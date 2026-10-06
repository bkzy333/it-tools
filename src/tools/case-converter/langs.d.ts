// langs 这个包没有自带类型声明，只有 JS 入口，TS 会报 TS7016。
// 这里补一个最小声明，避免为了一个几十行的语言码表去装 @types。
declare module 'langs';
