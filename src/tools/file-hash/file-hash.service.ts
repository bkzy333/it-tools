// 文件哈希计算器 的纯逻辑层。放在这里而不是 .vue 里，是为了能跑 vitest 单测。
//
// 两个设计要点：
// 1) 哈希走 hash-wasm 的增量接口（init/update/digest），文件按 2MB 切片喂进去，
//    内存占用与文件大小无关，几个 GB 的 ISO 也不会把页面撑爆；
// 2) 预期哈希解析要容错：用户粘过来的可能是裸十六进制、sha256sum 的一行输出、
//    BSD 风格「SHA256 (file.iso) = hash」、带 0x 前缀——四种都要能取出哈希本体。

import {
  createBLAKE2b,
  createMD5,
  createSHA1,
  createSHA256,
  createSHA384,
  createSHA512,
  createSHA3,
  type IHasher,
} from 'hash-wasm';

export type FileHashAlgoId = 'MD5' | 'SHA1' | 'SHA256' | 'SHA384' | 'SHA512' | 'SHA3-256' | 'SHA3-512' | 'BLAKE2b';

export interface HashAlgoMeta {
  id: FileHashAlgoId;
  /** 展示名（UI 与报告里都用它） */
  label: string;
  /** 十六进制摘要的字符数，用来识别用户粘来的预期哈希是哪种算法 */
  hexLength: number;
  /** MD5 / SHA-1 已有实际可行的碰撞攻击，保留是为了校验旧文件 */
  legacy: boolean;
}

/** 算法表即渲染顺序：常用的在前，MD5/SHA-1 标旧版。 */
export const HASH_ALGOS: readonly HashAlgoMeta[] = [
  { id: 'MD5', label: 'MD5', hexLength: 32, legacy: true },
  { id: 'SHA1', label: 'SHA-1', hexLength: 40, legacy: true },
  { id: 'SHA256', label: 'SHA-256', hexLength: 64, legacy: false },
  { id: 'SHA3-256', label: 'SHA3-256', hexLength: 64, legacy: false },
  { id: 'SHA384', label: 'SHA-384', hexLength: 96, legacy: false },
  { id: 'SHA512', label: 'SHA-512', hexLength: 128, legacy: false },
  { id: 'SHA3-512', label: 'SHA3-512', hexLength: 128, legacy: false },
  { id: 'BLAKE2b', label: 'BLAKE2b', hexLength: 128, legacy: false },
] as const;

/** 默认只算 SHA-256：80% 的用户要的就是发布页旁边那一个值。 */
export const DEFAULT_ALGOS: FileHashAlgoId[] = ['SHA256'];

/** 分块大小：2MB。再大 progress 更新太顿，再小 slice 调用太频繁。 */
export const CHUNK_SIZE = 2 * 1024 * 1024;

/** 单次最多排入队列的文件数。防的是误选整个目录把页面挂住。 */
export const MAX_FILES = 100;

const factories: Record<FileHashAlgoId, () => Promise<IHasher>> = {
  MD5: createMD5,
  SHA1: createSHA1,
  SHA256: createSHA256,
  SHA384: createSHA384,
  SHA512: createSHA512,
  'SHA3-256': () => createSHA3(256),
  'SHA3-512': () => createSHA3(512),
  BLAKE2b: () => createBLAKE2b(512),
};

export function algoMeta(id: FileHashAlgoId): HashAlgoMeta {
  const found = HASH_ALGOS.find((a) => a.id === id);
  if (!found) {
    throw new Error(`未知的哈希算法：${id}`);
  }
  return found;
}

/**
 * 按 2MB 分块流式哈希一个文件（或任意 Blob）。
 *
 * hasher 全程复用同一个实例：init() 一次，之后每块 update()，最后 digest()。
 * onProgress 的入参是 0~1 的比例；空文件也会回调一次 1（否则进度条永远不动）。
 */
export async function hashBlobWithAlgos(
  blob: Blob,
  algoIds: readonly FileHashAlgoId[],
  onProgress?: (ratio: number) => void,
): Promise<Record<string, string>> {
  if (algoIds.length === 0) {
    throw new Error('至少选择一种哈希算法');
  }

  const hashers = await Promise.all(algoIds.map((id) => factories[id]()));
  for (const hasher of hashers) {
    hasher.init();
  }

  const total = blob.size;
  let loaded = 0;
  while (loaded < total) {
    const chunk = new Uint8Array(await blob.slice(loaded, loaded + CHUNK_SIZE).arrayBuffer());
    for (const hasher of hashers) {
      hasher.update(chunk);
    }
    loaded += chunk.length;
    onProgress?.(total > 0 ? Math.min(loaded / total, 1) : 1);
  }
  if (total === 0) {
    onProgress?.(1);
  }

  const result: Record<string, string> = {};
  algoIds.forEach((id, index) => {
    result[id] = hashers[index].digest('hex');
  });
  return result;
}

// ---------------------------------------------------------------- 预期哈希解析

export interface ParsedExpectedHash {
  /** 提取出的十六进制（统一小写）；没提取到时为 null */
  hex: string | null;
  /** 长度对得上的算法（按 HASH_ALGOS 顺序） */
  matchedAlgos: FileHashAlgoId[];
  /** 长度不是任何已知算法的摘要长度（比如粘了半截） */
  unknownLength: boolean;
}

const BSD_LINE = /^[A-Za-z0-9_-]+\s*\([^)]*\)\s*=\s*([0-9a-fA-F]{32,128})\s*$/;
const COREUTILS_LINE = /^([0-9a-fA-F]{32,128})\s+\*?\S+/;

/**
 * 从用户粘贴的内容里提取预期哈希。支持四种形态：
 *   1. 裸十六进制（大小写、有无 0x 前缀都行）
 *   2. sha256sum / md5sum 的一行输出：「哈希 文件名」或「哈希 *文件名」
 *   3. BSD 风格：「SHA256 (file.iso) = 哈希」
 *   4. 前后带多余空白 / 换行
 * 提取不到返回 hex: null（UI 显示空状态，不报错）。
 */
export function parseExpectedHash(input: string): ParsedExpectedHash {
  const trimmed = input.trim();
  if (!trimmed) {
    return { hex: null, matchedAlgos: [], unknownLength: false };
  }

  const noPrefix = trimmed.replace(/^0[xX]/, '');
  let hex: string | null = null;

  if (/^[0-9a-fA-F]+$/.test(noPrefix)) {
    hex = noPrefix;
  } else {
    const coreutils = COREUTILS_LINE.exec(trimmed);
    const bsd = BSD_LINE.exec(trimmed);
    hex = coreutils?.[1] ?? bsd?.[1] ?? null;
  }

  if (hex === null) {
    return { hex: null, matchedAlgos: [], unknownLength: false };
  }

  hex = hex.toLowerCase();
  const matchedAlgos = HASH_ALGOS.filter((algo) => algo.hexLength === hex.length).map((algo) => algo.id);
  return { hex, matchedAlgos, unknownLength: matchedAlgos.length === 0 };
}

export type VerifyState = 'match' | 'mismatch' | null;

export interface Verification {
  state: VerifyState;
  /** 命中的算法 id（match 时必有） */
  algoId: FileHashAlgoId | null;
  /** mismatch 的补充说明：长度对得上但值不同 / 长度压根对不上 */
  reason: 'value-differs' | 'length-mismatch' | null;
}

/**
 * 把预期哈希和一个文件的各算法结果比对。
 * 没填预期哈希 → null（UI 不显示绿/红）；填了但没有任何算法的摘要长度
 * 与它相同 → mismatch + length-mismatch（不可能相等，但要说清为什么）。
 *
 * **大小写不敏感**：Windows certutil、部分下载页给的是大写十六进制，
 * 而我们输出小写，直接 === 会把完全一致的哈希判成不一致。
 */
export function verifyAgainstExpected(expectedHex: string | null, hashes: Record<string, string>): Verification {
  if (!expectedHex) {
    return { state: null, algoId: null, reason: null };
  }
  const expected = expectedHex.toLowerCase();
  for (const algo of HASH_ALGOS) {
    const actual = hashes[algo.id];
    if (actual && actual.length === expected.length && actual === expected) {
      return { state: 'match', algoId: algo.id, reason: null };
    }
  }
  const anySameLength = Object.values(hashes).some((value) => value.length === expected.length);
  return { state: 'mismatch', algoId: null, reason: anySameLength ? 'value-differs' : 'length-mismatch' };
}

/** 多文件场景：某一算法的摘要是否所有文件完全相同（hash-file.online 的「两文件是否相同」 generalized） */
export function allHashesIdentical(files: { hashes: Record<string, string> }[], algoId: FileHashAlgoId): boolean {
  if (files.length < 2) {
    return false;
  }
  const first = files[0].hashes[algoId];
  if (!first) {
    return false;
  }
  return files.every((file) => file.hashes[algoId] === first);
}

// ---------------------------------------------------------------- 结果导出

export interface FileHashResult {
  name: string;
  size: number;
  hashes: Record<string, string>;
  durationMs: number;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function verifiedText(expected: string | null, file: FileHashResult): string {
  if (!expected) {
    return '';
  }
  return verifyAgainstExpected(expected, file.hashes).state === 'match' ? '一致' : '不一致';
}

/** 报告里的预期哈希统一小写（比对本身大小写不敏感，回显要一致） */
function normalizeExpected(expected: string | null): string | null {
  return expected ? expected.toLowerCase() : null;
}

/** TXT 报告：人看的。 */
export function buildTxtReport(
  files: FileHashResult[],
  algos: readonly HashAlgoMeta[],
  expectedInput: string | null,
  generatedAt: Date,
): string {
  const expected = normalizeExpected(expectedInput);
  const lines: string[] = [
    '文件哈希校验报告',
    `生成时间：${formatDateTime(generatedAt)}`,
    `算法：${algos.map((a) => a.label).join('、')}`,
  ];
  if (expected) {
    lines.push(`预期哈希：${expected}`);
  }
  lines.push('');

  files.forEach((file, index) => {
    lines.push(`[${index + 1}] ${file.name}（${formatFileSize(file.size)}）`);
    for (const algo of algos) {
      const hash = file.hashes[algo.id];
      if (hash) {
        lines.push(`  ${algo.label}  ${hash}`);
      }
    }
    const verdict = verifiedText(expected, file);
    if (verdict) {
      lines.push(`  预期哈希比对：${verdict}`);
    }
    lines.push('');
  });

  lines.push(`共 ${files.length} 个文件。本报告由浏览器本地生成，文件未上传服务器。`);
  return lines.join('\n');
}

/** CSV 行（不含 BOM，BOM 由 downloadCsvFile 统一加）：一屏对账用。 */
export function buildCsvRows(
  files: FileHashResult[],
  algos: readonly HashAlgoMeta[],
  expectedInput: string | null,
): string[][] {
  const expected = normalizeExpected(expectedInput);
  const header = ['文件名', '大小(字节)', '耗时(ms)', ...algos.map((a) => a.label)];
  if (expected) {
    header.push('预期哈希比对');
  }
  const rows = files.map((file) => {
    const row = [
      file.name,
      String(file.size),
      String(Math.round(file.durationMs)),
      ...algos.map((a) => file.hashes[a.id] ?? ''),
    ];
    if (expected) {
      row.push(verifiedText(expected, file));
    }
    return row;
  });
  return [header, ...rows];
}

/** JSON 报告：程序消费用（接口联调、入库）。 */
export function buildJsonReport(
  files: FileHashResult[],
  algos: readonly HashAlgoMeta[],
  expectedInput: string | null,
  generatedAt: Date,
): string {
  const expected = normalizeExpected(expectedInput);
  const payload = {
    tool: 'gjxtools.com 文件哈希计算器',
    generatedAt: generatedAt.toISOString(),
    algorithms: algos.map((a) => a.id),
    expectedHash: expected,
    fileCount: files.length,
    files: files.map((file) => {
      const verdict = verifyAgainstExpected(expected, file.hashes);
      return {
        name: file.name,
        sizeBytes: file.size,
        durationMs: Math.round(file.durationMs),
        hashes: file.hashes,
        verified: verdict.state === 'match' ? true : verdict.state === 'mismatch' ? false : null,
      };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------- 示例文件（U6）

/**
 * 「一键示例」的素材：一段固定内容的文本文件 + 它确定性的 SHA-256。
 *
 * 用固定内容而不是随机内容，是为了预期哈希可以预先算死（下面的常量），
 * 点一下示例按钮就能演示「粘贴预期哈希 → 绿色一致」的完整核心交互，
 * 而且单测能锁住这个常量不会漂移。
 */
export const EXAMPLE_FILE_NAME = 'gjxtools-示例文件.txt';
export const EXAMPLE_FILE_CONTENT =
  'gjxtools.com 文件哈希计算示例\n这段文本可以在任何设备上复现同样的 SHA-256：把文件拖进来，预期哈希会自动比对。\n第二行：Hello, world! 12345\n';
/** 上面这段内容的 SHA-256（已用 node:crypto 独立核算，测试里会再锁一次） */
export const EXAMPLE_FILE_SHA256 = 'bb8cc8ceb7e242aff9e9fa6c3c026a4b7e795e950de4faa641c795379eedd97d';

export function createExampleFile(): File {
  return new File([EXAMPLE_FILE_CONTENT], EXAMPLE_FILE_NAME, { type: 'text/plain' });
}
