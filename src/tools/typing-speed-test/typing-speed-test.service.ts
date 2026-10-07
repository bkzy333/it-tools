/**
 * 打字速度测试 —— 纯逻辑层。
 *
 * 行为规格来自参考站 gjupai.com/tools/typing_speed 的**真实前端 chunk**
 * （`/_next/static/chunks/pages/tools/typing_speed-*.js`，2026-10-07 抓取后反编译），
 * 不是靠看页面猜的。该站未开放源码许可，因此这里是**按行为重写**，没有搬运它的代码；
 * 练习语料也是本站自己写的，没抄它的句子。
 *
 * 下面每个公式后面都标了它在原实现里的对应变量，方便日后对账：
 *   原变量 M = 样本文本，_ = 已输入文本，q = 已用秒数，I = 正确字符数，P = 错误数。
 */

export type Lang = 'zh' | 'en';
export type TextMode = 'random' | 'custom';
export type DurationMode = 1 | 3 | 5 | 'custom';

/** 自定义文本最长 1000 字（原实现 $.slice(0, 1000)） */
export const MAX_CUSTOM_LENGTH = 1000;
/** 自定义时长的取值范围（原实现 Math.max(10, Math.min(1800, ...))） */
export const MIN_CUSTOM_SECONDS = 10;
export const MAX_CUSTOM_SECONDS = 1800;
/** 历史成绩最多保留 20 条，列表里展示最近 10 条（原实现 slice(0, 20) / slice(0, 10)） */
export const MAX_RECORDS = 20;
export const VISIBLE_RECORDS = 10;

/** 中文练习语料：常见书面语与熟语，一段 20~26 字，打完约 20~40 秒 */
export const SAMPLES_ZH: readonly string[] = [
  '千里之行始于足下，每一次练习都会让你变得更快更稳。',
  '读书破万卷，下笔如有神，坚持练习才能不断进步。',
  '星光不问赶路人，时光不负有心人，努力终有回响。',
  '不积跬步无以至千里，不积小流无以成江海。',
  '路漫漫其修远兮，吾将上下而求索，追寻心中目标。',
  '宝剑锋从磨砺出，梅花香自苦寒来，坚持就是胜利。',
  '业精于勤荒于嬉，行成于思毁于随，勤奋方能致远。',
  '一寸光阴一寸金，寸金难买寸光阴，珍惜每分每秒。',
  '天行健君子以自强不息，地势坤君子以厚德载物。',
  '纸上得来终觉浅，绝知此事要躬行，动手才有收获。',
  '山重水复疑无路，柳暗花明又一村，再坚持一下。',
  '博学之，审问之，慎思之，明辨之，笃行之。',
];

/** 英文练习语料：常用句型与常见词汇，长度与中文语料节奏相当 */
export const SAMPLES_EN: readonly string[] = [
  'The quick brown fox jumps over the lazy dog near the river.',
  'Practice makes perfect when you learn to type quickly and accurately.',
  'A journey of a thousand miles always begins with a single step.',
  'Keep your eyes on the screen and let your fingers find the keys.',
  'Good habits formed today will quietly shape the work you do tomorrow.',
  'Every expert was once a beginner who refused to give up too early.',
  'Typing is a skill that rewards patience far more than raw speed.',
  'Small steady progress each day adds up to something remarkable.',
  'Focus on accuracy first, and the speed will follow on its own.',
  'Write clearly, review carefully, and revise without fear or pride.',
  'The best way to predict the future is to build it with your hands.',
  'Learn one new thing today and teach it to someone else tomorrow.',
];

/**
 * 随机取一段练习文本。random 参数可注入，方便单测固定结果。
 * 原实现：t[Math.floor(Math.random() * t.length)]
 */
export function pickSample(lang: Lang, random: () => number = Math.random): string {
  const pool = lang === 'zh' ? SAMPLES_ZH : SAMPLES_EN;
  const idx = Math.floor(random() * pool.length);
  return pool[Math.min(Math.max(idx, 0), pool.length - 1)];
}

const ZH_PUNCTUATION = /[，。！？、：；“”‘’（）【】《》]/g;
const EN_PUNCTUATION = /[.,;:!?"'()[\]{}]/g;

/**
 * 得到「目标文本」：自定义模式直接截断到 1000 字，随机模式按选项清洗样本文本。
 *
 * 清洗顺序严格照原实现：先去标点 → 再去大写（仅英文）。
 * 英文去标点后还会把连续空白压成一个空格并 trim，否则会残留双空格。
 */
export function buildTargetText(params: {
  mode: TextMode;
  /** 随机模式下的样本文本 */
  sample: string;
  /** 自定义模式下用户输入的文本 */
  customText: string;
  lang: Lang;
  includePunctuation: boolean;
  includeUppercase: boolean;
}): string {
  const { mode, sample, customText, lang, includePunctuation, includeUppercase } = params;

  if (mode === 'custom') {
    return customText.slice(0, MAX_CUSTOM_LENGTH);
  }

  let text = sample;
  if (!includePunctuation) {
    text =
      lang === 'zh'
        ? text.replace(ZH_PUNCTUATION, '')
        : text.replace(EN_PUNCTUATION, '').replace(/\s{2,}/g, ' ').trim();
  }
  if (lang === 'en' && !includeUppercase) {
    text = text.toLowerCase();
  }
  return text;
}

/**
 * 时长（秒）。自定义模式夹在 10~1800 之间，非法值（NaN / 0 / 空）退化成 60。
 * 原实现：'custom' === w ? Math.max(10, Math.min(1800, Number(S) || 60)) : 60 * w
 */
export function resolveDurationSeconds(mode: DurationMode, customSeconds: number): number {
  if (mode === 'custom') {
    return Math.max(MIN_CUSTOM_SECONDS, Math.min(MAX_CUSTOM_SECONDS, Number(customSeconds) || 60));
  }
  return 60 * mode;
}

/**
 * 逐位比对，返回「位置正确」的字符数。
 * 只比到两者较短的长度，多打的部分不算正确也不单独计错。
 * 原实现 eu(e, t)。
 */
export function countCorrect(target: string, typed: string): number {
  let correct = 0;
  const len = Math.min(target.length, typed.length);
  for (let i = 0; i < len; i += 1) {
    if (target[i] === typed[i]) {
      correct += 1;
    }
  }
  return correct;
}

export interface TypingMetrics {
  /** 位置正确的字符数 */
  correct: number;
  /** 错误字符数 = 已输入长度 − 正确数（下限 0） */
  errors: number;
  /** 每分钟单词数 = 正确字符数 / 5 / 分钟 */
  wpm: number;
  /** 每分钟字符数 = 正确字符数 / 分钟 */
  cpm: number;
  /** 准确率 = 正确字符数 / 已输入字符数（未输入时为 100） */
  accuracy: number;
}

/**
 * 由「正确字符数 + 已结算的输入长度 + 用时」直接算指标。
 *
 * 之所以要暴露这个入口：中文输入法在**组合期**（拼音还没上屏）也会触发 input 事件、
 * 把拼音字母写进 textarea，此时不能拿它来算准确率（否则准确率会掉到一两成）。
 * 所以界面上只在 compositionend 之后才把长度结算进来，指标用本函数按已结算值算。
 *
 * ⚠ 三个照抄原实现的口径，看着别扭但不要擅自"修正"，改了就和参考站对不上：
 *   1. 分钟数取 `max(elapsedSeconds, 1) / 60`：第 0 秒按 1 秒算，避免除零。
 *   2. WPM 对中文也按「5 个字符 = 1 个单词」折算 —— 这是打字测试的通例，
 *      中文 WPM 天然比英文低一档，评级阈值也因此分了中英两套。
 *   3. 准确率的分母是**已输入字符数**（含打错的），不是目标文本长度。
 *      所以打到一半时准确率表示"已输入内容里对的比例"，不是"全文完成度"。
 */
export function metricsFromCounts(
  correct: number,
  typedLength: number,
  elapsedSeconds: number,
): TypingMetrics {
  const errors = Math.max(0, typedLength - correct);
  const minutes = Math.max(elapsedSeconds, 1) / 60;
  return {
    correct,
    errors,
    wpm: Math.round(correct / 5 / minutes),
    cpm: Math.round(correct / minutes),
    accuracy: typedLength > 0 ? Math.round((correct / typedLength) * 100) : 100,
  };
}

/** 一次性算完：先数正确字符，再套 metricsFromCounts */
export function computeMetrics(target: string, typed: string, elapsedSeconds: number): TypingMetrics {
  return metricsFromCounts(countCorrect(target, typed), typed.length, elapsedSeconds);
}

/** 等级配色。用语义名而不是 unocss 原子类：动态拼接的类名扫不进原子类的提取器。 */
export type LevelTone = 'gray' | 'blue' | 'purple' | 'orange' | 'red';

export interface Level {
  label: string;
  tone: LevelTone;
}

/**
 * 等级评定。中英两套阈值（原实现 ey）：
 *   中文：<40 入门 / <80 熟练 / <120 快速 / ≥120 专业
 *   英文：<20 入门 / <40 熟练 / <60 快速 / <80 专业 / ≥80 精英
 * 阈值差一档，是因为中文按 5 字折算成单词，同样手速下中文 WPM 天然更低。
 */
export function getLevel(wpm: number, lang: Lang): Level {
  if (lang === 'zh') {
    if (wpm < 40) return { label: '入门', tone: 'gray' };
    if (wpm < 80) return { label: '熟练', tone: 'blue' };
    if (wpm < 120) return { label: '快速', tone: 'purple' };
    return { label: '专业', tone: 'orange' };
  }
  if (wpm < 20) return { label: '入门', tone: 'gray' };
  if (wpm < 40) return { label: '熟练', tone: 'blue' };
  if (wpm < 60) return { label: '快速', tone: 'purple' };
  if (wpm < 80) return { label: '专业', tone: 'orange' };
  return { label: '精英', tone: 'red' };
}

/**
 * 易错键统计：记录每一次「目标字符 ≠ 实际输入字符」的位置。
 * 中文只记目标字（打错往往是不会拆这个字），英文记 `期望→实际` 对照（能看出哪根手指串位）。
 * 原实现：s[l] = 'zh' === v ? ec[e] : `${ec[e]}→${t[e]}`
 */
export function collectErrorKeys(target: string, typed: string, lang: Lang): Record<string, number> {
  const map: Record<string, number> = {};
  const len = Math.min(target.length, typed.length);
  for (let i = 0; i < len; i += 1) {
    if (target[i] !== typed[i]) {
      const key = lang === 'zh' ? target[i] : `${target[i]}→${typed[i]}`;
      map[key] = (map[key] ?? 0) + 1;
    }
  }
  return map;
}

/** 易错键 Top N，按次数降序（原实现 sort((a, b) => b[1] - a[1]).slice(0, 5)） */
export function topErrorKeys(map: Record<string, number>, n = 5): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/**
 * 进度条百分比：时间进度和输入进度取**较大**的那个（原实现 ew）。
 * 取较大值而不是只看时间，是为了"提前打完全文"时进度条也能走到 100%。
 */
export function progressPercent(
  elapsedSeconds: number,
  durationSeconds: number,
  typedLength: number,
  targetLength: number,
): number {
  if (!targetLength) {
    return 0;
  }
  const byTime = (elapsedSeconds / durationSeconds) * 100;
  const byText = (typedLength / targetLength) * 100;
  return Math.min(100, Math.max(byTime, byText));
}

/**
 * 是否提前完成：全文输入完且全部正确。
 * 打满长度但有错字不算完成，得等超时（原实现用 l === ec.length 严格相等）。
 */
export function isCompletedEarly(target: string, typed: string, correct: number): boolean {
  return target.length > 0 && typed.length >= target.length && correct === target.length;
}

export interface TypingRecord {
  /** ISO 时间串 */
  date: string;
  lang: Lang;
  wpm: number;
  cpm: number;
  accuracy: number;
  /** 实际用时（秒） */
  duration: number;
}

/** 新成绩插到最前面，保留最近 MAX_RECORDS 条 */
export function pushRecord(records: TypingRecord[], record: TypingRecord): TypingRecord[] {
  return [record, ...records].slice(0, MAX_RECORDS);
}

export function bestWpm(records: TypingRecord[]): number {
  return records.length ? Math.max(...records.map((r) => r.wpm)) : 0;
}

export function bestAccuracy(records: TypingRecord[]): number {
  return records.length ? Math.max(...records.map((r) => r.accuracy)) : 0;
}
