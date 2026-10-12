/**
 * 零依赖的极简 xlsx 写出器。
 *
 * 为什么自己写而不引 SheetJS：
 * - SheetJS 在 npm 上的 0.18.5 有已知解析类 CVE（GHSA）；本工具站安全基调很硬，
 *   能不引有告警的第三方依赖就不引。我们只「生成」不「解析」xlsx，但引包即引入攻击面。
 * - pnpm 不在 PATH，往工程里加依赖会动 lockfile，麻烦。
 * - 手写 stored（不压缩）ZIP + SpreadsheetML inlineStr，足够 Excel / WPS / Numbers 打开，
 *   包体零增长。
 *
 * ZIP 采用「不压缩（method=0）」存储，只需自己算 CRC32，无需 DEFLATE。
 * 单元格用 inlineStr（内联字符串），免 sharedStrings 表，简单且不易出错。
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function strToU8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function colLetter(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let s = '';
  let x = index;
  do {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  } while (x >= 0);
  return s;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 把二维字符串数组写成一个 .xlsx Blob。
 * 数字（含负号、小数）写成数值单元格，其余写成内联字符串（保留首尾空格）。
 */
export function gridToXlsx(rows: string[][]): Blob {
  const sheet = buildSheetXml(rows);

  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: strToU8(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: strToU8(RELS_XML) },
    { name: 'xl/workbook.xml', data: strToU8(WORKBOOK_XML) },
    { name: 'xl/_rels/workbook.xml.rels', data: strToU8(WORKBOOK_RELS_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: strToU8(sheet) },
    { name: 'docProps/core.xml', data: strToU8(CORE_XML) },
    { name: 'docProps/app.xml', data: strToU8(APP_XML) },
  ];

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameU8 = strToU8(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    const lh = new Uint8Array(30 + nameU8.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, 0x04034b50, true); // 本地文件头签名
    ldv.setUint16(4, 20, true); // version needed
    ldv.setUint16(6, 0, true); // general purpose flag（ASCII 文件名）
    ldv.setUint16(8, 0, true); // method = stored
    ldv.setUint16(10, 0, true); // last mod time
    ldv.setUint16(12, 0, true); // last mod date
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, size, true); // compressed size
    ldv.setUint32(22, size, true); // uncompressed size
    ldv.setUint16(26, nameU8.length, true);
    ldv.setUint16(28, 0, true); // extra field length
    lh.set(nameU8, 30);
    localParts.push(lh, f.data);

    const ch = new Uint8Array(46 + nameU8.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, 0x02014b50, true); // 中央目录头签名
    cdv.setUint16(4, 20, true); // version made by
    cdv.setUint16(6, 20, true); // version needed
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameU8.length, true);
    cdv.setUint16(30, 0, true); // extra
    cdv.setUint16(32, 0, true); // comment
    cdv.setUint16(34, 0, true); // disk number start
    cdv.setUint16(36, 0, true); // internal attrs
    cdv.setUint32(38, 0, true); // external attrs
    cdv.setUint32(42, offset, true); // local header offset
    ch.set(nameU8, 46);
    centralParts.push(ch);

    offset += lh.length + f.data.length;
  }

  const centralSize = centralParts.reduce((s, c) => s + c.length, 0);

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true); // 中央目录结束签名
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const all = [...localParts, ...centralParts, eocd];
  const total = all.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of all) {
    out.set(part, pos);
    pos += part.length;
  }

  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function buildSheetXml(rows: string[][]): string {
  let body = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  body += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  body += '<sheetData>';

  rows.forEach((row, rIndex) => {
    const r = rIndex + 1;
    body += `<row r="${r}">`;
    row.forEach((cell, cIndex) => {
      const ref = `${colLetter(cIndex)}${r}`;
      const text = cell ?? '';
      if (/^-?\d+(\.\d+)?$/.test(text)) {
        body += `<c r="${ref}"><v>${text}</v></c>`;
      } else {
        body += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
      }
    });
    body += '</row>';
  });

  body += '</sheetData></worksheet>';
  return body;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const CORE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Table</dc:title>
<dc:creator>gjxtools</dc:creator>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>gjxtools</Application>
</Properties>`;
