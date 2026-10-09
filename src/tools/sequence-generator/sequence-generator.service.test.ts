import { describe, expect, it } from 'vitest';
import {
  generateSequence,
  toChinese,
  toLetters,
  toRoman,
  MAX_SEQ_COUNT,
  type SequenceOptions,
} from './sequence-generator.service';

const base: SequenceOptions = {
  mode: 'number',
  start: 1,
  count: 5,
  step: 1,
  padWidth: 0,
  prefix: '',
  suffix: '',
  separator: '\n',
  lowercase: false,
  chineseUppercase: false,
  customItems: '',
};

describe('toChinese', () => {
  it('基础数字', () => {
    expect(toChinese(0)).toBe('零');
    expect(toChinese(1)).toBe('一');
    expect(toChinese(5)).toBe('五');
    expect(toChinese(9)).toBe('九');
  });
  it('十与十几 顶位去一', () => {
    expect(toChinese(10)).toBe('十');
    expect(toChinese(11)).toBe('十一');
    expect(toChinese(13)).toBe('十三');
    expect(toChinese(19)).toBe('十九');
  });
  it('整十与几十', () => {
    expect(toChinese(20)).toBe('二十');
    expect(toChinese(21)).toBe('二十一');
    expect(toChinese(99)).toBe('九十九');
  });
  it('百位', () => {
    expect(toChinese(100)).toBe('一百');
    expect(toChinese(101)).toBe('一百零一');
    expect(toChinese(110)).toBe('一百一十');
    expect(toChinese(111)).toBe('一百一十一');
    expect(toChinese(305)).toBe('三百零五');
  });
  it('千位与跨零', () => {
    expect(toChinese(1000)).toBe('一千');
    expect(toChinese(1001)).toBe('一千零一');
    expect(toChinese(1010)).toBe('一千零一十');
    expect(toChinese(1100)).toBe('一千一百');
    expect(toChinese(1234)).toBe('一千二百三十四');
  });
  it('万级与零间隔', () => {
    expect(toChinese(10000)).toBe('一万');
    expect(toChinese(10001)).toBe('一万零一');
    expect(toChinese(100000000)).toBe('一亿');
    expect(toChinese(100010000)).toBe('一亿零一万');
  });
  it('大写', () => {
    expect(toChinese(1, true)).toBe('壹');
    expect(toChinese(1234, true)).toBe('壹仟贰佰叁拾肆');
  });
  it('异常输入返回空串', () => {
    expect(toChinese(-1)).toBe('');
    expect(toChinese(1.5)).toBe('');
    expect(toChinese(1e20)).toBe('');
  });
});

describe('toRoman', () => {
  it('基础', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(40)).toBe('XL');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
  });
  it('非法返回空串', () => {
    expect(toRoman(0)).toBe('');
    expect(toRoman(4000)).toBe('');
  });
});

describe('toLetters', () => {
  it('Excel 列名规则', () => {
    expect(toLetters(1)).toBe('A');
    expect(toLetters(26)).toBe('Z');
    expect(toLetters(27)).toBe('AA');
    expect(toLetters(28)).toBe('AB');
    expect(toLetters(52)).toBe('AZ');
    expect(toLetters(53)).toBe('BA');
  });
  it('非法返回空串', () => {
    expect(toLetters(0)).toBe('');
  });
});

describe('generateSequence - number', () => {
  it('基础 1..5 换行', () => {
    expect(generateSequence({ ...base })).toBe('1\n2\n3\n4\n5');
  });
  it('补零', () => {
    expect(
      generateSequence({ ...base, count: 3, start: 7, padWidth: 3 }),
    ).toBe('007\n008\n009');
  });
  it('步长与前后缀', () => {
    expect(
      generateSequence({ ...base, count: 3, start: 2, step: 2, prefix: 'NO.', suffix: ';' }),
    ).toBe('NO.2;\nNO.4;\nNO.6;');
  });
  it('逗号分隔', () => {
    expect(generateSequence({ ...base, count: 3, separator: ',' })).toBe('1,2,3');
  });
});

describe('generateSequence - letter / roman / chinese', () => {
  it('字母默认大写', () => {
    expect(generateSequence({ ...base, mode: 'letter', count: 3 })).toBe('A\nB\nC');
  });
  it('字母小写 + 从第 26 项起 AA', () => {
    expect(generateSequence({ ...base, mode: 'letter', count: 2, start: 26, lowercase: true })).toBe('z\naa');
  });
  it('罗马大写', () => {
    expect(generateSequence({ ...base, mode: 'roman', count: 3, start: 3 })).toBe('III\nIV\nV');
  });
  it('罗马小写', () => {
    expect(generateSequence({ ...base, mode: 'roman', count: 2, start: 1, lowercase: true })).toBe('i\nii');
  });
  it('中文数字', () => {
    expect(generateSequence({ ...base, mode: 'chinese', count: 3, start: 10 })).toBe('十\n十一\n十二');
  });
  it('中文大写', () => {
    expect(generateSequence({ ...base, mode: 'chinese', count: 2, start: 1, chineseUppercase: true })).toBe('壹\n贰');
  });
});

describe('generateSequence - cyclic', () => {
  it('星期从周一循环', () => {
    expect(generateSequence({ ...base, mode: 'weekday', count: 9 })).toBe(
      '周一\n周二\n周三\n周四\n周五\n周六\n周日\n周一\n周二',
    );
  });
  it('月份从三月起（start=3）', () => {
    expect(generateSequence({ ...base, mode: 'month', count: 2, start: 3 })).toBe('3月\n4月');
  });
  it('天干', () => {
    expect(generateSequence({ ...base, mode: 'ganzhi', count: 12 })).toBe(
      '甲\n乙\n丙\n丁\n戊\n己\n庚\n辛\n壬\n癸\n甲\n乙',
    );
  });
  it('地支', () => {
    expect(generateSequence({ ...base, mode: 'zodiac', count: 4 })).toBe('子\n丑\n寅\n卯');
  });
});

describe('generateSequence - custom', () => {
  it('循环填充', () => {
    expect(
      generateSequence({ ...base, mode: 'custom', count: 5, customItems: '红,黄,蓝' }),
    ).toBe('红\n黄\n蓝\n红\n黄');
  });
  it('空列表返回空', () => {
    expect(generateSequence({ ...base, mode: 'custom', count: 5, customItems: '  ,  ' })).toBe('');
  });
});

describe('generateSequence - 安全夹取', () => {
  it('count 超过上限被截断', () => {
    const out = generateSequence({ ...base, count: MAX_SEQ_COUNT + 5000 });
    expect(out.split('\n').length).toBe(MAX_SEQ_COUNT);
  });
  it('count 非正返回空', () => {
    expect(generateSequence({ ...base, count: 0 })).toBe('');
    expect(generateSequence({ ...base, count: -3 })).toBe('');
  });
  it('step 为 0 退化为 1', () => {
    expect(generateSequence({ ...base, count: 3, step: 0 })).toBe('1\n2\n3');
  });
});
