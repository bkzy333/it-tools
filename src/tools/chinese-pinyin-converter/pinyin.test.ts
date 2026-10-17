import { describe, expect, it } from 'vitest';
import {
  buildAlignedBlock,
  buildAlignedCells,
  formatPinyin,
  joinPinyin,
  toInitial,
  toNumberTone,
  toNumberToneMid,
  toPlain,
  tokenize,
} from './pinyin';

/** 只放用例需要的读音，不依赖 267KB 的真字典（那份是 fetch 加载的） */
const DICT: Record<string, string> = {
  中: 'zhōng zhòng',
  国: 'guó',
  人: 'rén',
  民: 'mín',
  银: 'yín',
  行: 'xíng háng',
  推: 'tuī',
  出: 'chū',
  数: 'shù shǔ',
  字: 'zì',
  币: 'bì',
  女: 'nǚ',
  好: 'hǎo',
  流: 'liú',
};

describe('声调转换', () => {
  it('带调 → 末位数字调：yī → yi1 / zhōng → zhong1', () => {
    expect(toNumberTone('zhōng')).toBe('zhong1');
    expect(toNumberTone('yī')).toBe('yi1');
  });

  it('无声调字符原样返回', () => {
    expect(toNumberTone('a')).toBe('a');
  });

  it('带调 → 中置数字调：按 a > e > o > 末位韵母定位', () => {
    expect(toNumberToneMid('zhōng')).toBe('zho1ng');
    expect(toNumberToneMid('hǎo')).toBe('ha3o');
    expect(toNumberToneMid('liú')).toBe('liu2');
    expect(toNumberToneMid('tuī')).toBe('tui1');
  });
});

describe('无声调 / 首字母', () => {
  it('默认把 ü 写成 v，keepUmlaut 时保留', () => {
    expect(toPlain('nǚ')).toBe('nv');
    expect(toPlain('nǚ', true)).toBe('nü');
  });

  it('首字母取声母并大写', () => {
    expect(toInitial('zhōng')).toBe('Z');
    expect(toInitial('nǚ')).toBe('N');
  });

  it('formatPinyin 支持全大写', () => {
    expect(formatPinyin('zhōng', 'tone', { upper: true })).toBe('ZHŌNG');
    expect(formatPinyin('zhōng', 'number', { upper: true })).toBe('ZHONG1');
    expect(formatPinyin('zhōng', 'initial')).toBe('Z');
  });
});

describe('tokenize / joinPinyin', () => {
  it('非汉字原样保留且不标汉字', () => {
    const items = tokenize('中a', DICT);

    expect(items.map(i => i.char).join('')).toBe('中a');
    expect(items[0]).toMatchObject({ char: '中', raw: 'zhōng', isHan: true, polyphone: true });
    expect(items[1]).toMatchObject({ char: 'a', raw: '', isHan: false, polyphone: false });
  });

  it('多音字只取最常用读音并打标', () => {
    const items = tokenize('银行', DICT);

    expect(items[1].raw).toBe('xíng');
    expect(items[1].polyphone).toBe(true);
  });

  it('keepUnrecognized=false 时连同分隔符一起跳过无法注音的字符', () => {
    const items = tokenize('中，a', DICT);

    expect(joinPinyin(items, 'tone', ' ')).toBe('zhōng ， a');
    expect(joinPinyin(items, 'tone', ' ', { keepUnrecognized: false })).toBe('zhōng');
  });
});

describe('「文字在下」的两行', () => {
  const items = tokenize('中国人民银行推出数字人民币', DICT);

  it('逐列数据与原文一一对应', () => {
    const cells = buildAlignedCells(items, 'tone');

    expect(cells).toHaveLength(items.length);
    expect(cells.map(c => c.char).join('')).toBe('中国人民银行推出数字人民币');
    expect(cells.map(c => c.pinyin)).toEqual([
      'zhōng', 'guó', 'rén', 'mín', 'yín', 'xíng', 'tuī', 'chū', 'shù', 'zì', 'rén', 'mín', 'bì',
    ]);
  });

  it('列布局与等宽文本必须覆盖同一批字符（否则页面和复制出去的对不上）', () => {
    const cells = buildAlignedCells(items, 'tone');
    const { pinyinLine, textLine } = buildAlignedBlock(items, 'tone', 7);

    expect(textLine.replace(/\s/g, '')).toBe(cells.map(c => c.char).join(''));
    expect(pinyinLine.replace(/\s/g, '')).toBe(cells.map(c => c.pinyin).join(''));
  });

  it('keepUnrecognized=false 时两行同时丢弃标点', () => {
    const withPunct = tokenize('中，国', DICT);

    expect(buildAlignedCells(withPunct, 'tone', { keepUnrecognized: false }).map(c => c.char)).toEqual(['中', '国']);
    expect(buildAlignedBlock(withPunct, 'tone', 7, { keepUnrecognized: false }).textLine.replace(/\s/g, '')).toBe('中国');
  });
});
