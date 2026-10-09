/**
 * 批量时间戳 ↔ 时间互转。
 *
 * 参考 iamwawa.cn/batchtimestamp.html：支持秒/毫秒单位、多种时间格式、
 * 时间戳转时间、时间转时间戳、导出 CSV。
 */

export type TimestampUnit = 's' | 'ms';

export interface BatchConvertOptions {
  unit: TimestampUnit;
  /** 输出时间格式，见 FORMATS */
  format: string;
}

export const FORMATS: Record<string, (d: Date) => string> = {
  'YYYY-MM-DD HH:mm:ss': (d) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  'YYYY-MM-DD HH:mm': (d) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
  'YYYY/MM/DD HH:mm:ss': (d) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
  'YYYY/MM/DD HH:mm': (d) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },
};

export interface BatchRow {
  /** 原始输入 */
  input: string;
  /** 转换结果（时间字符串或时间戳），失败为空 */
  output: string;
  /** 是否转换失败 */
  error: boolean;
}

export function timestampsToDates(lines: string[], unit: TimestampUnit, format: string): BatchRow[] {
  const fmt = FORMATS[format] ?? FORMATS['YYYY-MM-DD HH:mm:ss'];
  const factor = unit === 's' ? 1000 : 1;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { input: line, output: '', error: false };
    }
    const ts = Number(trimmed);
    if (!Number.isFinite(ts)) {
      return { input: line, output: '', error: true };
    }
    const date = new Date(ts * factor);
    if (Number.isNaN(date.getTime())) {
      return { input: line, output: '', error: true };
    }
    return { input: line, output: fmt(date), error: false };
  });
}

export function datesToTimestamps(lines: string[], unit: TimestampUnit): BatchRow[] {
  const factor = unit === 's' ? 1 : 1000;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { input: line, output: '', error: false };
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return { input: line, output: '', error: true };
    }
    const ts = Math.floor(date.getTime() / factor);
    return { input: line, output: String(ts), error: false };
  });
}

/** 导出 CSV：两列 input,output */
export function toCsv(rows: BatchRow[]): string {
  const esc = (s: string) => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = 'input,output';
  const body = rows.map((r) => `${esc(r.input)},${esc(r.output)}`).join('\n');
  return `${header}\n${body}`;
}
