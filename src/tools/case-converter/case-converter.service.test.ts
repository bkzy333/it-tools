import { describe, it, expect } from 'vitest';
import { camelCase, constantCase, kebabCase, pascalCase } from 'change-case';
import {
  toLanguageTitleCase,
  getSupportedLanguages,
  applyCleaningPatterns,
  convertWithConnectors,
  escapeCharClass,
  protectConnectors,
  restoreConnectors,
  CONNECTOR_SENTINEL,
} from './case-converter.service';

describe('toLanguageTitleCase – core behavior', () => {
  it('capitalizes normal words', () => {
    expect(toLanguageTitleCase('the quick brown fox', 'eng')).toBe('The Quick Brown Fox');
  });

  it('keeps stopwords lowercase except boundaries', () => {
    expect(toLanguageTitleCase('the lord of the rings', 'eng')).toBe('The Lord of the Rings');
  });

  it('handles empty input', () => {
    expect(toLanguageTitleCase('', 'eng')).toBe('');
  });

  it('handles single word', () => {
    expect(toLanguageTitleCase('hello', 'eng')).toBe('Hello');
  });
});

describe('toLanguageTitleCase – punctuation handling', () => {
  it('handles trailing punctuation', () => {
    expect(toLanguageTitleCase('hello, world!', 'eng')).toBe('Hello, World!');
  });

  it('handles starting punctuation', () => {
    expect(toLanguageTitleCase('(the lord of the rings)', 'eng')).toBe('(The Lord of the Rings)');
  });

  it('handles nested punctuation', () => {
    expect(toLanguageTitleCase('((the lord of the rings))', 'eng')).toBe('((The Lord of the Rings))');
  });

  it('handles unicode punctuation', () => {
    expect(toLanguageTitleCase('“the lord of the rings”', 'eng')).toBe('“The Lord of the Rings”');
  });

  it('handles mixed punctuation', () => {
    expect(toLanguageTitleCase('...the lord of the rings?!', 'eng')).toBe('...the Lord of the Rings?!');
    expect(toLanguageTitleCase('... the lord of the rings?!', 'eng')).toBe('... The Lord of the Rings?!');
  });

  it('handles punctuation inside sentence', () => {
    expect(toLanguageTitleCase('hello: the lord of the rings', 'eng')).toBe('Hello: the Lord of the Rings');
  });
});

describe('toLanguageTitleCase – French elisions', () => {
  it('handles basic elision', () => {
    expect(toLanguageTitleCase("l'homme et la mer", 'fra')).toBe('L’Homme et la Mer');
  });

  it('handles elision with punctuation', () => {
    expect(toLanguageTitleCase("“l'homme”", 'fra')).toBe('“L’Homme”');
  });

  it('handles multiple elisions', () => {
    expect(toLanguageTitleCase("d'amour et d'etoiles", 'fra')).toBe('D’Amour et d’Etoiles');
  });

  it('handles elisions with starting punctuation', () => {
    expect(toLanguageTitleCase("(l'amour", 'fra')).toBe('(L’Amour');
  });

  it('handles elisions with trailing punctuation', () => {
    expect(toLanguageTitleCase("l'homme!", 'fra')).toBe('L’Homme!');
  });

  it('handles elisions with unicode apostrophes', () => {
    expect(toLanguageTitleCase('l’homme et l’amour', 'fra')).toBe('L’Homme et l’Amour');
  });
});

describe('toLanguageTitleCase – advanced cases', () => {
  it('handles numbers', () => {
    expect(toLanguageTitleCase('the 7 wonders of the world', 'eng')).toBe('The 7 Wonders of the World');
  });

  it('handles acronyms', () => {
    expect(toLanguageTitleCase('the nasa launch', 'eng')).toBe('The Nasa Launch');
  });

  it('handles hyphenated words', () => {
    expect(toLanguageTitleCase('the state-of-the-art system', 'eng')).toBe('The State-of-the-art System');
  });

  it('handles mixed languages', () => {
    expect(toLanguageTitleCase("l'homme et l'homme and the sea", 'fra')).toBe('L’Homme et l’Homme And The Sea');
  });

  it('handles multiple spaces', () => {
    expect(toLanguageTitleCase('the   lord   of   the   rings', 'eng')).toBe('The Lord of the Rings');
  });

  it('handles tabs and newlines', () => {
    expect(toLanguageTitleCase('the\tlord\nof the rings', 'eng')).toBe('The Lord of the Rings');
  });

  it('handles uppercase input', () => {
    expect(toLanguageTitleCase('THE LORD OF THE RINGS', 'eng')).toBe('The Lord of the Rings');
  });

  it('handles mixed case input', () => {
    expect(toLanguageTitleCase('tHe LoRd oF tHe RiNgS', 'eng')).toBe('The Lord of the Rings');
  });

  it('handles sentences input', () => {
    expect(toLanguageTitleCase('tHe LoRd. oF tHe RiNgS', 'eng')).toBe('The Lord. Of the Rings');
  });
});

describe('getSupportedLanguages', () => {
  it('includes english stopwords', () => {
    const langs = getSupportedLanguages();
    const en = langs.find((l) => l.value === 'eng');
    expect(en).toBeDefined();
    expect(en!.label).toBe('English');
  });
});

describe('escapeCharClass', () => {
  it('转义字符类里的特殊符号，避免拼出非法正则', () => {
    expect(escapeCharClass('-')).toBe('\\-');
    expect(escapeCharClass(']')).toBe('\\]');
    expect(escapeCharClass('^')).toBe('\\^');
    expect(escapeCharClass('\\')).toBe('\\\\');
  });

  it('普通字符原样返回', () => {
    expect(escapeCharClass('_')).toBe('_');
    expect(escapeCharClass('a1')).toBe('a1');
  });
});

describe('protectConnectors / restoreConnectors', () => {
  // 第 0 / 第 1 个连接符各自的哨兵（哨兵 = CONNECTOR_SENTINEL + 下标字母）
  const M0 = `${CONNECTOR_SENTINEL}a`;
  const M1 = `${CONNECTOR_SENTINEL}b`;

  it('连接符被替换为带下标的哨兵串', () => {
    expect(protectConnectors('user_name', '_')).toBe(`user${M0}name`);
  });

  it('未设置连接符时原样返回', () => {
    expect(protectConnectors('user_name', '')).toBe('user_name');
    expect(restoreConnectors('user_name', '')).toBe('user_name');
  });

  it('还原对大小写不敏感（转换中被改成大写也能还原）', () => {
    expect(restoreConnectors(`USER${M0}NAME`, '_')).toBe('USER_NAME');
    expect(restoreConnectors(`User${M0}name`, '_')).toBe('User_name');
  });

  it('保护 + 还原可往返（单个连接符）', () => {
    expect(restoreConnectors(protectConnectors('hello-world', '-'), '-')).toBe('hello-world');
  });

  it('多个连接符各自独立，不会在还原时互相混淆', () => {
    // 回归：早期共用一个哨兵，还原时 - 和 _ 都会变成 "-_"
    expect(protectConnectors('hello-world_foo', '-_')).toBe(`hello${M0}world${M1}foo`);
    expect(restoreConnectors(protectConnectors('hello-world_foo', '-_'), '-_')).toBe('hello-world_foo');
  });
});

describe('convertWithConnectors', () => {
  it('标准英文下 user_name 会被拆词', () => {
    expect(convertWithConnectors(camelCase, 'user_name', '')).toBe('userName');
  });

  it('声明 _ 属于单词的一部分后不再断词', () => {
    expect(convertWithConnectors(camelCase, 'user_name', '_')).toBe('user_name');
  });

  it('连接符跟随大小写变换一起被还原', () => {
    expect(convertWithConnectors(pascalCase, 'user_name', '_')).toBe('User_name');
    expect(convertWithConnectors(constantCase, 'user_name', '_')).toBe('USER_NAME');
  });

  it('连字符同理', () => {
    expect(convertWithConnectors(camelCase, 'hello-world', '')).toBe('helloWorld');
    expect(convertWithConnectors(camelCase, 'hello-world', '-')).toBe('hello-world');
    expect(convertWithConnectors(kebabCase, 'hello-world', '')).toBe('hello-world');
  });

  it('转换函数抛异常时回退，不抛错', () => {
    const boom = () => {
      throw new Error('boom');
    };
    expect(convertWithConnectors(boom, 'user_name', '_')).toBe('user_name');
  });
});

describe('applyCleaningPatterns', () => {
  it('按正则逐条清除', () => {
    expect(applyCleaningPatterns('a-b c!', ['[^\\w\\d\\s]'])).toBe('ab c');
  });

  it('多条规则依次生效', () => {
    expect(applyCleaningPatterns('a-b 1', ['[^\\w\\d\\s]', '\\s', '\\d'])).toBe('ab');
  });

  it('无规则时原样返回', () => {
    expect(applyCleaningPatterns('a-b', [])).toBe('a-b');
  });

  it('遇到非法正则跳过，不让一条规则拖垮整体', () => {
    expect(applyCleaningPatterns('abc', ['(', '\\d'])).toBe('abc');
    expect(applyCleaningPatterns('a1b', ['(', '\\d'])).toBe('ab');
  });

  it('去除特殊符号（\\p{P}\\p{S}）保留中文/字母/数字，只删符号', () => {
    // 回归：原 specialChars 正则 [^\w\d\s] 的 \w 不含汉字，会删光中文只剩数字
    expect(applyCleaningPatterns('我们都是@方电饭锅435', ['[\\p{P}\\p{S}]'])).toBe('我们都是方电饭锅435');
    expect(applyCleaningPatterns('a-b c! $100', ['[\\p{P}\\p{S}]'])).toBe('ab c 100');
  });
});
