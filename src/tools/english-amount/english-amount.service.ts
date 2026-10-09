/**
 * 英文金额大写转换。
 *
 * 参考 iamwawa.cn/yingwendaxie.html：规范格式「SAY + 币种英文 + 金额英文 + ONLY」。
 * 复用 english-numbers 的数字转英文逻辑，纯自研。
 *
 * 币种英文对照（与参考站一致）：
 * - USD → US DOLLARS
 * - CNY → CHINESE YUAN
 * - EUR → EURO
 * - GBP → POUNDS STERLING
 * - JPY → JAPANESE YEN
 * - HKD → HONG KONG DOLLARS
 *
 * 金额读法：整数部分 + 「AND CENTS xx」小数（分）。参考站两种口径：
 * 1. 简洁：SAY USD 金额 ONLY（省略 DOLLARS）
 * 2. 完整：SAY US DOLLARS 金额 ONLY
 */

import { numberToEnglish } from '../english-numbers/english-numbers.service';

export interface CurrencyDef {
  code: string;
  /** 币种英文全称（用于完整句式） */
  name: string;
  /** 主单位单数/复数 */
  unit: string;
  units: string;
  /** 分单位（小数单位） */
  cent: string;
  cents: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'USD', name: 'US DOLLARS', unit: 'DOLLAR', units: 'DOLLARS', cent: 'CENT', cents: 'CENTS' },
  { code: 'CNY', name: 'CHINESE YUAN', unit: 'YUAN', units: 'YUAN', cent: 'FEN', cents: 'FEN' },
  { code: 'EUR', name: 'EURO', unit: 'EURO', units: 'EUROS', cent: 'CENT', cents: 'CENTS' },
  { code: 'GBP', name: 'POUNDS STERLING', unit: 'POUND', units: 'POUNDS', cent: 'PENNY', cents: 'PENCE' },
  { code: 'JPY', name: 'JAPANESE YEN', unit: 'YEN', units: 'YEN', cent: 'SEN', cents: 'SEN' },
  { code: 'HKD', name: 'HONG KONG DOLLARS', unit: 'DOLLAR', units: 'DOLLARS', cent: 'CENT', cents: 'CENTS' },
];

export interface EnglishAmountOptions {
  currencyCode: string;
  /** 完整句式（写明币种英文全称） vs 简洁（用货币代码） */
  fullForm?: boolean;
  hyphenated?: boolean;
}

export function amountToEnglish(amount: number | string, options: EnglishAmountOptions): string {
  const { currencyCode, fullForm = true, hyphenated = true } = options;
  const currency = CURRENCIES.find((c) => c.code === currencyCode) ?? CURRENCIES[0];

  const str = String(amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error('Invalid amount');
  }

  const negative = str.startsWith('-');
  const absStr = negative ? str.slice(1) : str;
  const [intPart, fracPart = ''] = absStr.split('.');
  const intNum = Number(intPart);

  // 整数部分英文（带逗号分组，符合票据规范）
  const intWords = numberToEnglish(intNum, { hyphenated, useComma: true });

  // 小数部分转「分」
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  const centNum = Number(cents);

  const unitWord = intNum === 1 ? currency.unit : currency.units;
  const centWord = centNum === 1 ? currency.cent : currency.cents;

  const amountWords = `${intWords} ${unitWord}${centNum > 0 ? ` AND ${numberToEnglish(centNum, { hyphenated, useComma: true })} ${centWord}` : ''}`;

  const currencyWord = fullForm ? currency.name : currency.code;
  // 「大写」= 全大写（SAY ... ONLY 票据规范），数字读数也大写
  const result = `SAY ${currencyWord} ${amountWords} ONLY`.toUpperCase();
  return negative ? `MINUS ${result}` : result;
}
