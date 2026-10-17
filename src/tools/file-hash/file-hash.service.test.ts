import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  DEFAULT_ALGOS,
  EXAMPLE_FILE_CONTENT,
  EXAMPLE_FILE_NAME,
  EXAMPLE_FILE_SHA256,
  HASH_ALGOS,
  allHashesIdentical,
  algoMeta,
  buildCsvRows,
  buildJsonReport,
  buildTxtReport,
  createExampleFile,
  formatFileSize,
  hashBlobWithAlgos,
  parseExpectedHash,
  verifyAgainstExpected,
  type FileHashAlgoId,
  type FileHashResult,
} from './file-hash.service';
import { buildHashReportPdf, type PdfFileEntry } from './file-hash-pdf';

/** 算法 id → node:crypto 的算法名（作为独立 oracle） */
const NODE_ALGO: Record<FileHashAlgoId, string> = {
  MD5: 'md5',
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA384: 'sha384',
  SHA512: 'sha512',
  'SHA3-256': 'sha3-256',
  'SHA3-512': 'sha3-512',
  BLAKE2b: 'blake2b512',
};

function nodeHash(algo: FileHashAlgoId, data: Uint8Array): string {
  return createHash(NODE_ALGO[algo]).update(data).digest('hex');
}

/** 造一块确定性内容的缓冲（避免全零被某些实现特殊处理） */
function makeBuffer(size: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(size));
  for (let i = 0; i < size; i += 1) {
    buf[i] = (i * 31 + ((i >> 8) & 0xff)) & 0xff;
  }
  return buf;
}

describe('file-hash service', () => {
  describe('HASH_ALGOS', () => {
    it('hexLength 与算法实际输出长度一致', () => {
      const data = makeBuffer(1024);
      for (const algo of HASH_ALGOS) {
        expect(algoMeta(algo.id).hexLength, algo.id).toBe(nodeHash(algo.id, data).length);
      }
    });

    it('MD5 / SHA-1 标为旧版，其余不标', () => {
      expect(HASH_ALGOS.filter((a) => a.legacy).map((a) => a.id)).toEqual(['MD5', 'SHA1']);
    });

    it('默认算法只有 SHA-256', () => {
      expect(DEFAULT_ALGOS).toEqual(['SHA256']);
    });
  });

  describe('hashBlobWithAlgos', () => {
    it('全部算法与 node:crypto 逐字节一致（小文件，单块）', async () => {
      const data = makeBuffer(4096);
      const blob = new Blob([data]);
      const hashes = await hashBlobWithAlgos(blob, HASH_ALGOS.map((a) => a.id));
      for (const algo of HASH_ALGOS) {
        expect(hashes[algo.id], algo.id).toBe(nodeHash(algo.id, data));
      }
    });

    it('跨 2MB 分块边界的文件也与 node:crypto 一致（3+ 块）', async () => {
      // 4.5MB → 3 块（2MB + 2MB + 0.5MB），专测分块拼接
      const size = CHUNK_SIZE * 2 + 512 * 1024;
      const data = makeBuffer(size);
      const blob = new Blob([data]);
      const hashes = await hashBlobWithAlgos(blob, ['MD5', 'SHA256', 'SHA3-512', 'BLAKE2b']);
      for (const id of ['MD5', 'SHA256', 'SHA3-512', 'BLAKE2b'] as FileHashAlgoId[]) {
        expect(hashes[id], id).toBe(nodeHash(id, data));
      }
    });

    it('块大小正好是 CHUNK_SIZE 整数倍时也一致', async () => {
      const data = makeBuffer(CHUNK_SIZE * 2);
      const blob = new Blob([data]);
      const hashes = await hashBlobWithAlgos(blob, ['SHA256']);
      expect(hashes.SHA256).toBe(nodeHash('SHA256', data));
    });

    it('空文件算出标准空摘要', async () => {
      const hashes = await hashBlobWithAlgos(new Blob([]), ['MD5', 'SHA256']);
      expect(hashes.MD5).toBe('d41d8cd98f00b204e9800998ecf8427e');
      expect(hashes.SHA256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('进度回调单调递增且以 1 结束（空文件也会回调 1）', async () => {
      const data = makeBuffer(CHUNK_SIZE + 100);
      const seen: number[] = [];
      await hashBlobWithAlgos(new Blob([data]), ['SHA256'], (ratio) => seen.push(ratio));
      expect(seen.length).toBeGreaterThan(1);
      expect(seen.at(-1)).toBe(1);
      for (let i = 1; i < seen.length; i += 1) {
        expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
      }

      const emptySeen: number[] = [];
      await hashBlobWithAlgos(new Blob([]), ['SHA256'], (ratio) => emptySeen.push(ratio));
      expect(emptySeen).toEqual([1]);
    });

    it('不选算法时抛错（UI 会拦，这里锁行为）', async () => {
      await expect(hashBlobWithAlgos(new Blob(['x']), [])).rejects.toThrow('至少选择一种哈希算法');
    });
  });

  describe('parseExpectedHash', () => {
    it('裸十六进制（大小写混写也认）', () => {
      expect(parseExpectedHash('BB8CC8CEB7E242AFF9E9FA6C3C026A4B7E795E950DE4FAA641C795379EEDD97D').hex).toBe(
        'bb8cc8ceb7e242aff9e9fa6c3c026a4b7e795e950de4faa641c795379eedd97d',
      );
    });

    it('带 0x 前缀', () => {
      const hex = 'a'.repeat(64);
      expect(parseExpectedHash(`0x${hex}`).hex).toBe(hex);
    });

    it('sha256sum 一行输出（哈希 + 空格 + 文件名）', () => {
      const hex = 'b'.repeat(64);
      expect(parseExpectedHash(`${hex}  ubuntu-24.04.iso`).hex).toBe(hex);
      expect(parseExpectedHash(`${hex} *ubuntu-24.04.iso`).hex).toBe(hex);
    });

    it('BSD 风格「SHA256 (file.iso) = hash」', () => {
      const hex = 'c'.repeat(64);
      expect(parseExpectedHash(`SHA256 (ubuntu-24.04.iso) = ${hex}`).hex).toBe(hex);
    });

    it('前后多余空白/换行不影响', () => {
      const hex = 'd'.repeat(40);
      expect(parseExpectedHash(`  \n ${hex} \n `).hex).toBe(hex);
    });

    it('空串与提取不到的内容返回 null', () => {
      expect(parseExpectedHash('').hex).toBeNull();
      expect(parseExpectedHash('   ').hex).toBeNull();
      expect(parseExpectedHash('这不是哈希').hex).toBeNull();
      expect(parseExpectedHash('太短了').hex).toBeNull();
    });

    it('长度对得上算法时给出候选（64 位同时对应 SHA-256 与 SHA3-256）', () => {
      const parsed = parseExpectedHash('e'.repeat(64));
      expect(parsed.matchedAlgos).toEqual(['SHA256', 'SHA3-256']);
      expect(parsed.unknownLength).toBe(false);
    });

    it('长度对不上任何算法时标记 unknownLength', () => {
      const parsed = parseExpectedHash('f'.repeat(50));
      expect(parsed.hex).toBe('f'.repeat(50));
      expect(parsed.matchedAlgos).toEqual([]);
      expect(parsed.unknownLength).toBe(true);
    });
  });

  describe('verifyAgainstExpected', () => {
    const hashes = { SHA256: 'a'.repeat(64), SHA512: 'b'.repeat(128) };

    it('没填预期哈希 → null', () => {
      expect(verifyAgainstExpected(null, hashes).state).toBeNull();
    });

    it('完全一致 → match 并指出算法', () => {
      const result = verifyAgainstExpected('A'.repeat(64), hashes);
      expect(result.state).toBe('match');
      expect(result.algoId).toBe('SHA256');
    });

    it('长度对得上但值不同 → mismatch + value-differs', () => {
      const result = verifyAgainstExpected('c'.repeat(64), hashes);
      expect(result.state).toBe('mismatch');
      expect(result.reason).toBe('value-differs');
    });

    it('长度压根对不上 → mismatch + length-mismatch', () => {
      const result = verifyAgainstExpected('d'.repeat(40), hashes);
      expect(result.state).toBe('mismatch');
      expect(result.reason).toBe('length-mismatch');
    });
  });

  describe('allHashesIdentical', () => {
    it('少于两个文件恒为 false', () => {
      expect(allHashesIdentical([{ hashes: { MD5: 'x' } }], 'MD5')).toBe(false);
      expect(allHashesIdentical([], 'MD5')).toBe(false);
    });

    it('全部相同 / 存在不同', () => {
      expect(allHashesIdentical([{ hashes: { MD5: 'x' } }, { hashes: { MD5: 'x' } }], 'MD5')).toBe(true);
      expect(allHashesIdentical([{ hashes: { MD5: 'x' } }, { hashes: { MD5: 'y' } }], 'MD5')).toBe(false);
    });

    it('结果里没有该算法时 false（不误报「一致」）', () => {
      expect(allHashesIdentical([{ hashes: {} }, { hashes: {} }], 'MD5')).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('各档位', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 1024 * 1.25)).toBe('1.3 GB');
    });
  });

  describe('报告导出', () => {
    const files: FileHashResult[] = [
      { name: 'ubuntu-24.04.iso', size: 6100371456, hashes: { SHA256: 'a'.repeat(64) }, durationMs: 1234.6 },
      { name: '说明.txt', size: 2048, hashes: { SHA256: 'b'.repeat(64) }, durationMs: 2.4 },
    ];
    const algos = [algoMeta('SHA256')];
    const at = new Date('2026-10-17T10:20:30Z');

    it('TXT 报告含文件名、哈希与文件数脚注', () => {
      const txt = buildTxtReport(files, algos, null, at);
      expect(txt).toContain('ubuntu-24.04.iso');
      expect(txt).toContain('a'.repeat(64));
      expect(txt).toContain('共 2 个文件');
      expect(txt).toContain('2026-10-17 10:20:30'); // TZ=UTC（vitest 配置钉了）
    });

    it('TXT 报告带预期哈希时输出比对结论', () => {
      const txt = buildTxtReport(files, algos, 'A'.repeat(64), at);
      expect(txt).toContain('预期哈希：' + 'a'.repeat(64));
      expect(txt).toContain('预期哈希比对：一致');
      expect(txt).toContain('预期哈希比对：不一致');
    });

    it('CSV 表头 + 行，行序与输入一致', () => {
      const rows = buildCsvRows(files, algos, null);
      expect(rows[0]).toEqual(['文件名', '大小(字节)', '耗时(ms)', 'SHA-256']);
      expect(rows[1][0]).toBe('ubuntu-24.04.iso');
      expect(rows[1][3]).toBe('a'.repeat(64));
      expect(rows[2][0]).toBe('说明.txt');
    });

    it('CSV 填了预期哈希才加比对列', () => {
      const withExpected = buildCsvRows(files, algos, 'A'.repeat(64));
      expect(withExpected[0].at(-1)).toBe('预期哈希比对');
      expect(withExpected[1].at(-1)).toBe('一致');
      expect(withExpected[2].at(-1)).toBe('不一致');
    });

    it('JSON 报告可解析回同样结构', () => {
      const parsed = JSON.parse(buildJsonReport(files, algos, 'A'.repeat(64), at));
      expect(parsed.fileCount).toBe(2);
      expect(parsed.algorithms).toEqual(['SHA256']);
      expect(parsed.expectedHash).toBe('a'.repeat(64));
      expect(parsed.files[0].name).toBe('ubuntu-24.04.iso');
      expect(parsed.files[0].verified).toBe(true);
      expect(parsed.files[1].verified).toBe(false);
    });
  });

  describe('示例文件（U6）', () => {
    it('示例文件算出来的 SHA-256 与内置常量一致（锁死常量不漂移）', async () => {
      const hashes = await hashBlobWithAlgos(createExampleFile(), ['SHA256']);
      expect(hashes.SHA256).toBe(EXAMPLE_FILE_SHA256);
    });

    it('示例文件的基本属性', () => {
      const file = createExampleFile();
      expect(file.name).toBe(EXAMPLE_FILE_NAME);
      expect(file.type).toBe('text/plain');
      expect(file.size).toBe(new TextEncoder().encode(EXAMPLE_FILE_CONTENT).length);
    });
  });
});

describe('file-hash PDF 报告', () => {
  const files: PdfFileEntry[] = [
    {
      name: 'ubuntu-24.04-desktop-amd64.iso',
      size: 6100371456,
      hashes: { SHA256: 'a'.repeat(64), SHA512: 'b'.repeat(128) },
      verified: 'match',
    },
    { name: '中文文件名.txt', size: 2048, hashes: { SHA256: 'c'.repeat(64) }, verified: 'mismatch' },
  ];
  const algos = [algoMeta('SHA256'), algoMeta('SHA512')];

  function build(reportId = 'TEST1234', fileList = files, expected: string | null = 'a'.repeat(64)) {
    return buildHashReportPdf({
      algorithms: algos,
      expectedHash: expected,
      files: fileList,
      generatedAt: new Date('2026-10-17T10:20:30Z'),
      reportId,
    });
  }

  it('是结构完整的 PDF：头/尾/xref 偏移都指向正确位置', () => {
    const pdf = build();
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);

    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(Number.isFinite(startxref)).toBe(true);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');

    // xref 表里每个偏移都应指向「N 0 obj」
    const xrefBody = text.slice(startxref);
    const offsets = [...xrefBody.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(5);
    for (const offset of offsets) {
      expect(text.slice(offset)).toMatch(/^\d+ 0 obj\n/);
    }
  });

  it('页数与 /Count、/Kids 一致', () => {
    const text = Buffer.from(build()).toString('latin1');
    const count = Number(/\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/.exec(text)?.[2]);
    expect(count).toBe(1);
    const pageObjs = text.match(/\/Type \/Page /g) ?? [];
    expect(pageObjs.length).toBe(count);
  });

  it('ASCII 文件名与哈希值以字面量出现在内容流里（可直接阅读）', () => {
    const text = Buffer.from(build()).toString('latin1');
    expect(text).toContain('ubuntu-24.04-desktop-amd64.iso');
    expect(text).toContain('a'.repeat(64));
  });

  it('中文文件名按 UTF-8 百分号转写，并附说明行', () => {
    const text = Buffer.from(build()).toString('latin1');
    expect(text).toContain('%E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6%E5%90%8D.txt');
    expect(text).toContain('UTF-8 percent-encoded');
    expect(text).toContain('CSV / JSON / TXT export for original file names');
  });

  it('报告标签是英文（哈希工具的输出惯例），预期哈希未填时写 (none)', () => {
    const text = Buffer.from(build('NOEXP', files, null)).toString('latin1');
    expect(text).toContain('FILE HASH VERIFICATION REPORT');
    // 括号在 PDF 字面量串里是转义的：\(none\)
    expect(text).toContain('Expected hash: \\(none\\)');
    const text2 = Buffer.from(build('EXP', files, 'A'.repeat(64))).toString('latin1');
    expect(text2).toContain(`Expected hash: ${'a'.repeat(64)}`); // 统一小写回显
  });

  it('整个文件是纯 ASCII（xref 偏移才能按字符数算）', () => {
    const pdf = build();
    for (const byte of pdf) {
      expect(byte).toBeLessThan(0x80);
    }
  });

  it('文件多时自动分页，且每页都有页脚', () => {
    const many: PdfFileEntry[] = Array.from({ length: 40 }, (_, i) => ({
      name: `file-${i}.bin`,
      size: 1024 * (i + 1),
      hashes: { SHA256: String(i).repeat(64) },
      verified: null,
    }));
    const text = Buffer.from(build('MULTI', many, null)).toString('latin1');
    const count = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(count).toBeGreaterThan(1);
    const footers = text.split('Generated locally in your browser. No file was uploaded.').length - 1;
    expect(footers).toBe(count);
  });

  it('比对结论写作 MATCH / MISMATCH / not compared', () => {
    const text = Buffer.from(build()).toString('latin1');
    expect(text).toContain('Expected hash: MATCH');
    expect(text).toContain('Expected hash: MISMATCH');
  });
});
