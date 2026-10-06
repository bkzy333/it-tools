/**
 * opencc-*.wrapped.js 的类型声明。
 *
 * 那些文件是第三方产物（见 LICENSE-opencc-js.txt），正文与上游一致，
 * 只是在外面套了一层函数作用域以避开打包器 rolldown 的顶层重名问题；
 * 类型靠这个同名 .d.ts 补上，TS 解析 `./opencc-cn2t.wrapped` 时会优先用它。
 */

export interface OpenCCLocale {
  /** 转换方向，取值如 cn / tw / twp / hk / jp / t */
  from?: string;
  to?: string;
}

export declare function Converter(locale?: OpenCCLocale): (text: string) => string;

export declare function ConverterFactory(...dicts: unknown[]): (text: string) => string;

export declare function CustomConverter(dict: string | string[][]): (text: string) => string;

export declare function HTMLConverter(
  converter: (text: string) => string,
  rootNode: Node,
  fromLang: string,
  toLang: string,
): { convert: () => void; restore: () => void };

export declare const Locale: Record<string, unknown>;

export declare const Trie: unknown;

declare const OpenCC: {
  Converter: typeof Converter;
  ConverterFactory: typeof ConverterFactory;
  CustomConverter: typeof CustomConverter;
  HTMLConverter: typeof HTMLConverter;
  Locale: typeof Locale;
  Trie: typeof Trie;
};

export default OpenCC;
