/**
 * 纯前端 Let's Encrypt ACME 客户端。
 *
 * 设计原则（与 gjxtools.com 的静态站 / AdSense 基调一致）：
 * - 不依赖任何后端，所有密钥在浏览器内用 WebCrypto 生成，私钥永不离开本机；
 * - 直连 Let's Encrypt 的 ACME 接口（已实测支持 CORS），本站不存储任何数据；
 * - 借用 node-forge 构建 CSR、jose 完成 JWS 签名与 JWK 指纹。
 *
 * 参考 RFC 8555（ACME）。Staging 用于试跑（证书不被浏览器信任），Production 签发受信任证书。
 */

import { pki, md, asn1 } from 'node-forge';
import { FlattenedSign, exportJWK, calculateJwkThumbprint, base64url } from 'jose';

export type Environment = 'staging' | 'production';
// 仅证书密钥使用本类型；账号密钥固定 ec-p256（仅用于 ACME JWS，不经 CSR 签名，故无影响）。
// 注意：node-forge 1.4.0 的 CSR 签名 OID 写死 WithRSAEncryption 且无 ECDSA 签名 OID，
// 因此证书密钥仅支持 RSA，避免生成 Let's Encrypt 会拒绝的错误算法标识。
export type CertKeyType = 'rsa-2048' | 'rsa-4096';
export type KeyType = 'rsa-2048' | 'rsa-4096' | 'ec-p256';
export type ChallengeType = 'dns-01' | 'http-01';

const DIRECTORIES: Record<Environment, string> = {
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
  production: 'https://acme-v02.api.letsencrypt.org/directory',
};

// 账号密钥固定用 EC P-256（仅用于 ACME 身份与签名，与证书密钥解耦）。
const ACCOUNT_KEY_TYPE: KeyType = 'ec-p256';

export interface ChallengeInfo {
  domain: string;
  type: ChallengeType;
  token: string;
  keyAuthorization: string;
  dnsRecordName: string;
  dnsRecordValue: string;
  httpUrl: string;
  httpContent: string;
  challengeUrl: string;
  authzUrl: string;
}

interface AuthzState {
  domain: string;
  authzUrl: string;
  challengeUrl: string;
  token: string;
  keyAuthorization: string;
}

export interface OrderResult {
  domains: string[];
  challenges: ChallengeInfo[];
  orderUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uint8ToBinaryString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

function derToPem(der: Uint8Array, label: string): string {
  const b64 = btoa(uint8ToBinaryString(der));
  const body = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

/** 生成证书/账号密钥对（extractable，便于导出给 forge 构建 CSR）。 */
export async function generateKeyPair(keyType: KeyType): Promise<CryptoKeyPair> {
  if (keyType.startsWith('rsa')) {
    const modulusLength = keyType === 'rsa-4096' ? 4096 : 2048;
    return crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
  }
  // 走到这里只剩 ec-p256（账号密钥固定类型），namedCurve 恒为 P-256
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

/** 把 WebCrypto 密钥对转成 forge 密钥，用于构建 CSR。 */
async function keyPairToForge(
  keyPair: CryptoKeyPair,
): Promise<{ privateKey: pki.PrivateKey; publicKey: pki.PublicKey }> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const privateKey = pki.privateKeyFromPem(derToPem(pkcs8, 'PRIVATE KEY'));
  const publicKey = pki.publicKeyFromAsn1(asn1.fromDer(uint8ToBinaryString(spki)));
  return { privateKey, publicKey };
}

/** 构建 PKCS#10 证书签名请求（含 SAN 扩展），返回 PEM 与 DER 的 base64url（ACME finalize 用）。 */
export function buildCsr(
  publicKey: pki.PublicKey,
  privateKey: pki.PrivateKey,
  domains: string[],
): { pem: string; derB64: string } {
  const certReq = pki.createCertificationRequest();
  certReq.publicKey = publicKey;
  certReq.setSubject([{ name: 'commonName', value: domains[0] }]);
  certReq.setAttributes([
    {
      name: 'extensionRequest',
      extensions: [
        {
          name: 'subjectAltName',
          altNames: domains.map((d) => ({ type: 2, value: d })),
        },
      ],
    },
  ]);
  certReq.sign(privateKey as pki.rsa.PrivateKey, md.sha256.create());
  const pem = pki.certificationRequestToPem(certReq);
  const derStr = asn1.toDer(pki.certificationRequestToAsn1(certReq)).getBytes();
  const derBytes = new Uint8Array(derStr.length);
  for (let i = 0; i < derStr.length; i++) {
    derBytes[i] = derStr.charCodeAt(i);
  }
  const derB64 = base64url.encode(derBytes);
  return { pem, derB64 };
}

/** 计算 ACME http-01 / dns-01 的 key authorization：`${token}.${账号公钥JWK指纹}`。 */
export async function keyAuthorizationFor(accountPublicKey: CryptoKey, token: string): Promise<string> {
  const jwk = await exportJWK(accountPublicKey);
  const thumbprint = await calculateJwkThumbprint(jwk);
  return `${token}.${thumbprint}`;
}

/** 把 Let's Encrypt 返回的证书 PEM（可能含多张）拆成 leaf + fullchain。 */
export function parseCertChain(pem: string): { leaf: string; fullchain: string } {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const fullchain = blocks.join('\n');
  const leaf = blocks[0] ?? pem;
  return { leaf, fullchain };
}

export class FreeSslClient {
  private env: Environment;
  private directory: Record<string, string> = {};
  private accountKey!: CryptoKeyPair;
  private accountUrl?: string;
  private nonce?: string;
  private readonly alg = 'ES256';

  private orderUrl?: string;
  private finalizeUrl?: string;
  private authzs: AuthzState[] = [];
  private csrDerB64?: string;

  public certPrivateKeyPem = '';
  public csrPem = '';

  constructor(env: Environment) {
    this.env = env;
  }

  /** 拉取 ACME 目录并生成本地账号密钥（私钥绝不外传）。 */
  async init(): Promise<void> {
    const res = await fetch(DIRECTORIES[this.env]);
    if (!res.ok) {
      throw new Error(`无法获取 ACME 目录：${res.status}`);
    }
    this.directory = (await res.json()) as Record<string, string>;
    this.accountKey = await generateKeyPair(ACCOUNT_KEY_TYPE);
  }

  private async getNonce(): Promise<void> {
    const res = await fetch(this.directory.newNonce, { method: 'HEAD' });
    let nonce = res.headers.get('replay-nonce') ?? undefined;
    if (!nonce) {
      const res2 = await fetch(this.directory.newNonce);
      nonce = res2.headers.get('replay-nonce') ?? undefined;
    }
    this.nonce = nonce;
  }

  /** 按 RFC 8555 构造并发送 JWS（POST / POST-as-GET）。 */
  private async signedRequest(url: string, payload: unknown, useKid: boolean): Promise<Response> {
    if (!this.nonce) {
      await this.getNonce();
    }
    const header: Record<string, unknown> = {
      alg: this.alg,
      url,
      nonce: this.nonce,
    };
    if (useKid && this.accountUrl) {
      header.kid = this.accountUrl;
    } else {
      header.jwk = await exportJWK(this.accountKey.publicKey);
    }
    const payloadBytes =
      payload === undefined || payload === null
        ? new Uint8Array(0)
        : new TextEncoder().encode(JSON.stringify(payload));
    const jws = await new FlattenedSign(payloadBytes).setProtectedHeader(header).sign(this.accountKey.privateKey);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose+json' },
      body: JSON.stringify(jws),
    });
    const newNonce = res.headers.get('replay-nonce');
    if (newNonce) {
      this.nonce = newNonce;
    }
    return res;
  }

  private async registerAccount(contactEmail?: string): Promise<void> {
    const payload: Record<string, unknown> = { termsOfServiceAgreed: true };
    if (contactEmail) {
      payload.contact = [`mailto:${contactEmail}`];
    }
    const res = await this.signedRequest(this.directory.newAccount, payload, false);
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`账号注册失败：${res.status} ${await res.text()}`);
    }
    this.accountUrl = res.headers.get('location') ?? this.accountUrl;
  }

  /**
   * 创建证书订单并生成证书密钥 + CSR。
   * 返回每个域名的验证信息（DNS TXT / HTTP 文件内容）。
   */
  async createOrder(opts: {
    domains: string[];
    contactEmail?: string;
    certKeyType: CertKeyType;
    challengeType: ChallengeType;
  }): Promise<OrderResult> {
    if (!this.accountUrl) {
      await this.registerAccount(opts.contactEmail);
    }
    const identifiers = opts.domains.map((d) => ({ type: 'dns', value: d }));
    const res = await this.signedRequest(this.directory.newOrder, { identifiers }, true);
    if (!res.ok) {
      throw new Error(`创建订单失败：${res.status} ${await res.text()}`);
    }
    this.orderUrl = res.headers.get('location') ?? undefined;
    const order = (await res.json()) as { finalize: string; authorizations: string[] };
    this.finalizeUrl = order.finalize;

    this.authzs = [];
    const challenges: ChallengeInfo[] = [];
    for (const authzUrl of order.authorizations) {
      const azRes = await this.signedRequest(authzUrl, {}, true);
      if (!azRes.ok) {
        throw new Error(`获取授权失败：${azRes.status}`);
      }
      const az = (await azRes.json()) as {
        identifier: { value: string };
        challenges: { type: string; token: string; url: string }[];
      };
      const domain = az.identifier.value;
      const challenge = az.challenges.find((c) => c.type === opts.challengeType);
      if (!challenge) {
        throw new Error(`域名 ${domain} 不支持 ${opts.challengeType} 验证方式`);
      }
      const keyAuth = await keyAuthorizationFor(this.accountKey.publicKey, challenge.token);
      this.authzs.push({
        domain,
        authzUrl,
        challengeUrl: challenge.url,
        token: challenge.token,
        keyAuthorization: keyAuth,
      });
      challenges.push({
        domain,
        type: opts.challengeType,
        token: challenge.token,
        keyAuthorization: keyAuth,
        dnsRecordName: `_acme-challenge.${domain}`,
        dnsRecordValue: keyAuth,
        httpUrl: `http://${domain}/.well-known/acme-challenge/${challenge.token}`,
        httpContent: keyAuth,
        challengeUrl: challenge.url,
        authzUrl,
      });
    }

    const certKey = await generateKeyPair(opts.certKeyType);
    const { privateKey, publicKey } = await keyPairToForge(certKey);
    this.certPrivateKeyPem = pki.privateKeyToPem(privateKey);
    const { pem, derB64 } = buildCsr(publicKey, privateKey, opts.domains);
    this.csrPem = pem;
    this.csrDerB64 = derB64;

    return { domains: opts.domains, challenges, orderUrl: this.orderUrl ?? '' };
  }

  /** 提交各域名的挑战并轮询，直到全部验证通过。 */
  async verify(): Promise<void> {
    for (const a of this.authzs) {
      const startRes = await this.signedRequest(a.challengeUrl, {}, true);
      if (!startRes.ok) {
        throw new Error(`启动验证失败（${a.domain}）：${startRes.status} ${await startRes.text()}`);
      }
      await this.pollAuthz(a.authzUrl);
    }
  }

  private async pollAuthz(authzUrl: string): Promise<void> {
    for (let i = 0; i < 45; i++) {
      const res = await this.signedRequest(authzUrl, {}, true);
      const az = (await res.json()) as {
        status: string;
        challenges?: { type: string; status: string; error?: { detail: string } }[];
      };
      if (az.status === 'valid') {
        return;
      }
      if (az.status === 'invalid') {
        const detail = (az.challenges ?? [])
          .map((c) => `${c.type}: ${c.error?.detail ?? c.status}`)
          .join('; ');
        throw new Error(`域名验证失败：${detail || JSON.stringify(az)}`);
      }
      await sleep(2000);
    }
    throw new Error('域名验证超时（请确认解析 / 文件已生效后再试）');
  }

  /** 提交 CSR 并轮询，最终下载完整证书链（PEM）。 */
  async finalize(): Promise<string> {
    if (!this.finalizeUrl || !this.csrDerB64 || !this.orderUrl) {
      throw new Error('尚未创建订单或 CSR');
    }
    const res = await this.signedRequest(this.finalizeUrl, { csr: this.csrDerB64 }, true);
    if (!res.ok) {
      throw new Error(`提交 CSR 失败：${res.status} ${await res.text()}`);
    }
    let order = (await res.json()) as { status: string; certificate?: string };
    for (let i = 0; i < 45; i++) {
      if (order.status === 'valid') {
        break;
      }
      if (order.status === 'invalid') {
        throw new Error(`订单无效：${JSON.stringify(order)}`);
      }
      await sleep(2000);
      const r2 = await this.signedRequest(this.orderUrl, {}, true);
      order = (await r2.json()) as { status: string; certificate?: string };
    }
    if (!order.certificate) {
      throw new Error('证书下载地址缺失');
    }
    const certRes = await this.signedRequest(order.certificate, {}, true);
    if (!certRes.ok) {
      throw new Error(`下载证书失败：${certRes.status}`);
    }
    return certRes.text();
  }
}
