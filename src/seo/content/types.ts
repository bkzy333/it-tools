// 工具页 SEO 正文的数据结构。
//
// 两个消费方：
//   1. 运行时 —— ToolUsageGuide.vue 拿它渲染"使用说明 / 常见问题"，用户看到的就是它
//   2. 构建期 —— build/seo-prerender.ts 拿同一份数据生成静态 HTML，爬虫不执行 JS 也能读到
//
// 两边必须是同一份数据：如果静态 HTML 和用户看到的不是一回事，那就是 cloaking，
// AdSense 会直接判违规。所以这里的内容改了，两边同时生效。

export interface ToolContentFaq {
  q: string;
  a: string;
}

export interface ToolContentExample {
  input: string;
  output: string;
  note?: string;
}

export interface ToolContent {
  /** 80~160 字：输入什么、得到什么、什么场景下用得上 */
  intro: string;
  /** 4~6 条，每条一个能照做的具体动作 */
  steps: string[];
  /** 2~3 条，只有真的用过才知道的坑 */
  tips: string[];
  /** 3~5 条真实用户会搜的问题 */
  faq: ToolContentFaq[];
  /** 能给的都给：真实、简短、看得懂的输入输出 */
  example?: ToolContentExample;
}
