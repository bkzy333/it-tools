import { describe, it, expect } from 'vitest';
import { pki } from 'node-forge';
import { buildCsr, keyAuthorizationFor, parseCertChain, generateKeyPair } from './free-ssl.service';

describe('buildCsr', () => {
  it('produces a valid PKCS#10 request carrying CN + SAN', () => {
    const kp = pki.rsa.generateKeyPair({ bits: 2048 });
    const domains = ['example.com', '*.example.com', 'www.example.com'];
    const { pem } = buildCsr(kp.publicKey, kp.privateKey, domains);

    expect(pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
    expect(pem).toContain('-----END CERTIFICATE REQUEST-----');

    const parsed = pki.certificationRequestFromPem(pem);
    expect(parsed.subject.getField('CN').value).toBe('example.com');

    const attrs = (parsed as { attributes?: { name: string; extensions?: { name: string; altNames?: { value: string }[] }[]; value?: unknown }[] }).attributes ?? [];
    const extAttr = attrs.find((a) => a.name === 'extensionRequest');
    const exts = extAttr?.extensions ?? [];
    const san = exts.find((e) => e.name === 'subjectAltName');
    expect(san).toBeTruthy();
    const names = (san?.altNames ?? []).map((a) => a.value);
    for (const d of domains) {
      expect(names).toContain(d);
    }
  });

  it('accepts RSA-4096 public keys', () => {
    const kp = pki.rsa.generateKeyPair({ bits: 4096 });
    const { pem } = buildCsr(kp.publicKey, kp.privateKey, ['x.example.com']);
    expect(pem).toContain('-----BEGIN CERTIFICATE REQUEST-----');
  });
});

describe('keyAuthorizationFor', () => {
  it('returns `${token}.${base64url-thumbprint}`', async () => {
    const kp = await generateKeyPair('ec-p256');
    const token = 'token-value-123';
    const ka = await keyAuthorizationFor(kp.publicKey, token);
    expect(ka.startsWith(`${token}.`)).toBe(true);
    const thumb = ka.slice(token.length + 1);
    expect(thumb).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(thumb).not.toContain('=');
  });
});

describe.skipIf(!process.env.RUN_SSL_E2E)('FreeSslClient e2e against Let\'s Encrypt staging', () => {
  it('creates a real ACME account + order (no domain validation needed)', async () => {
    const { FreeSslClient } = await import('./free-ssl.service');
    const client = new FreeSslClient('staging');
    await client.init();
    const res = await client.createOrder({
      domains: ['e2e-test.example.com'],
      certKeyType: 'rsa-2048',
      challengeType: 'dns-01',
    });
    expect(res.challenges.length).toBe(1);
    expect(res.challenges[0].dnsRecordName).toBe('_acme-challenge.e2e-test.example.com');
    expect(res.challenges[0].type).toBe('dns-01');
    expect(client.certPrivateKeyPem).toContain('PRIVATE KEY');
    expect(client.csrPem).toContain('CERTIFICATE REQUEST');
  }, 30_000);
});

describe('parseCertChain', () => {
  it('splits the leaf (first) from the full chain', () => {
    const leaf = '-----BEGIN CERTIFICATE-----\nMIIBleaf\n-----END CERTIFICATE-----';
    const intermediate = '-----BEGIN CERTIFICATE-----\nMIIBintermediate\n-----END CERTIFICATE-----';
    const chain = `${leaf}\n${intermediate}`;
    const result = parseCertChain(chain);
    expect(result.leaf).toBe(leaf);
    expect(result.fullchain).toBe(chain);
  });
});
