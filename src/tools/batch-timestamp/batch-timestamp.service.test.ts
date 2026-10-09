import { describe, expect, it } from 'vitest';
import { datesToTimestamps, timestampsToDates, toCsv } from './batch-timestamp.service';

describe('timestampsToDates', () => {
  it('秒转时间', () => {
    const rows = timestampsToDates(['0'], 's', 'YYYY-MM-DD HH:mm:ss');
    // 0 秒 = 1970-01-01 08:00:00 (UTC+8 环境)
    expect(rows[0].output).toMatch(/^1970-01-01/);
  });

  it('毫秒转时间', () => {
    const rows = timestampsToDates(['0'], 'ms', 'YYYY-MM-DD HH:mm:ss');
    expect(rows[0].output).toMatch(/^1970-01-01/);
  });

  it('非法输入标记 error', () => {
    const rows = timestampsToDates(['abc'], 's', 'YYYY-MM-DD HH:mm:ss');
    expect(rows[0].error).toBe(true);
    expect(rows[0].output).toBe('');
  });

  it('空行跳过', () => {
    const rows = timestampsToDates([''], 's', 'YYYY-MM-DD HH:mm:ss');
    expect(rows[0].error).toBe(false);
    expect(rows[0].output).toBe('');
  });
});

describe('datesToTimestamps', () => {
  it('时间转秒时间戳', () => {
    // 用 ISO 带时区的时间，避免测试环境时区差异
    const rows = datesToTimestamps(['1970-01-01T00:00:00Z'], 's');
    expect(rows[0].output).toBe('0');
  });

  it('时间转毫秒时间戳', () => {
    const rows = datesToTimestamps(['1970-01-01T00:00:00Z'], 'ms');
    expect(rows[0].output).toBe('0');
  });

  it('非法时间标记 error', () => {
    const rows = datesToTimestamps(['not-a-date'], 's');
    expect(rows[0].error).toBe(true);
  });
});

describe('toCsv', () => {
  it('生成含表头的 CSV', () => {
    const csv = toCsv([{ input: '0', output: '1970-01-01 08:00:00', error: false }]);
    expect(csv).toContain('input,output');
    expect(csv).toContain('0,1970-01-01 08:00:00');
  });
});
