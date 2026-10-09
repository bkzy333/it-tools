/**
 * 阿拉伯数字 ↔ 英文读数互转。
 *
 * 参考 iamwawa.cn/englishnumbers.html 的行为：数字转英文（可选连字符）、
 * 英文读数转数字。这里是纯自研实现，不搬运参考站代码（参考站无 LICENSE）。
 *
 * 边界约定（与参考站对齐，注释+单测双锁）：
 * - 整数部分最多支持到 trillion（万亿 / 10^12）以内，超出按报错处理。
 * - 英文读数是「美式短标度」（short scale）：1,000,000,000 = one billion。
 * - 小数部分逐位读（point three four five），不支持分数读法。
 * - 负数前缀 minus，零读 zero。
 */

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

/** 三位一组（百位内）转英文，不含 scale 后缀 */
function threeDigitsToWords(num: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(num / 100);
  const rest = num % 100;
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} hundred`);
  }
  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]);
    } else {
      const ten = Math.floor(rest / 10);
      const one = rest % 10;
      parts.push(one > 0 ? `${TENS[ten]}-${ONES[one]}` : TENS[ten]);
    }
  }
  return parts.join(' ');
}

export interface NumberToEnglishOptions {
  /** 是否在十位与个位之间用连字符（twenty-one vs twenty one） */
  hyphenated?: boolean;
  /** 是否在每组之间用逗号（one thousand, two hundred） */
  useComma?: boolean;
}

export function numberToEnglish(input: number | string, options: NumberToEnglishOptions = {}): string {
  const { hyphenated = true, useComma = true } = options;
  const str = String(input).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error('Invalid number');
  }

  const negative = str.startsWith('-');
  const absStr = negative ? str.slice(1) : str;
  const [intPart, fracPart] = absStr.split('.');

  const intNum = intPart === '' ? 0 : Number(intPart);
  if (!Number.isSafeInteger(intNum) || intNum >= 1e15) {
    throw new Error('Number too large');
  }

  const words: string[] = [];

  // 整数部分
  if (intNum === 0) {
    words.push('zero');
  } else {
    let remaining = intNum;
    const groups: string[] = [];
    for (let scale = 0; remaining > 0; scale += 1) {
      const chunk = remaining % 1000;
      if (chunk > 0) {
        const scaleWord = SCALES[scale];
        groups.push(scaleWord ? `${threeDigitsToWords(chunk)} ${scaleWord}` : threeDigitsToWords(chunk));
      }
      remaining = Math.floor(remaining / 1000);
    }
    // 从大到小拼接，组间逗号
    const joined = groups.reverse().join(useComma ? ', ' : ' ');
    words.push(joined);
  }

  // 小数部分
  if (fracPart !== undefined) {
    const fracWords = fracPart.split('').map((d) => ONES[Number(d)]).join(' ');
    words.push(`point ${fracWords}`);
  }

  let result = words.join(' ');
  if (negative) {
    result = `minus ${result}`;
  }
  if (!hyphenated) {
    result = result.replace(/(\w+)-(\w+)/g, '$1 $2');
  }
  return result;
}

// ---- 英文 → 数字 ----

const WORD_TO_VALUE: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_VALUE: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

/**
 * 英文读数 → 阿拉伯数字。
 * 支持连字符、and（可省略）、逗号分隔，返回数字字符串（可能含小数）。
 */
export function englishToNumber(input: string): string {
  let text = input.trim().toLowerCase();
  let negative = false;
  if (text.startsWith('minus ') || text.startsWith('negative ')) {
    negative = true;
    text = text.replace(/^(minus|negative)\s+/, '');
  }

  // 处理 point 小数
  let fracDigits = '';
  const pointIdx = text.search(/\bpoint\b/);
  if (pointIdx !== -1) {
    const fracPart = text.slice(pointIdx + 'point'.length).trim();
    const digits = fracPart.split(/[\s,]+/).filter(Boolean).map((w) => WORD_TO_VALUE[w]);
    if (digits.some((d) => d === undefined)) {
      throw new Error('Invalid fraction');
    }
    fracDigits = digits.join('');
    text = text.slice(0, pointIdx).trim();
  }

  // 归一化：去掉 and、连字符、逗号
  const tokens = text
    .replace(/\band\b/g, ' ')
    .replace(/-/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token === 'hundred') {
      if (current === 0) {
        current = 1;
      }
      current *= 100;
    } else if (SCALE_VALUE[token] !== undefined) {
      if (current === 0) {
        current = 1;
      }
      total += current * SCALE_VALUE[token];
      current = 0;
    } else if (WORD_TO_VALUE[token] !== undefined) {
      current += WORD_TO_VALUE[token];
    } else {
      throw new Error(`Unknown word: ${token}`);
    }
  }
  total += current;

  let result = String(total);
  if (fracDigits) {
    result = `${result}.${fracDigits}`;
  }
  return negative ? `-${result}` : result;
}
