/**
 * 年龄计算器 —— 纯逻辑层。
 *
 * 行为规格来自参考站 https://gjupai.com/tools/age_calculator 的生产 JS chunk
 * （`/_next/static/chunks/pages/tools/age_calculator-145f9455d1228e5a.js`，16.7 KB）。
 * 参考站未开源（GitHub 搜不到对应仓库）→ 按 **NONE** 许可证处理：只对齐「行为」，
 * 代码全部重写，不搬运任何原始实现。逐条公式见 `_recon/age-calculator/BEHAVIOR.md`。
 *
 * 有一处**刻意与参考站不同**：`getFutureBirthdays()`。改之前先读那段注释和对应单测，
 * 别照着参考站源码「修正」回去。
 */
export interface AgeBreakdown {
  years: number;
  months: number;
  days: number;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
}

export interface NextBirthday {
  /** yyyy-MM-dd */
  date: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface FutureBirthday {
  year: number;
  /** yyyy-MM-dd */
  date: string;
  ageTurning: number;
}

export interface Milestone {
  age: number;
  /** yyyy-MM-dd */
  date: string;
}

export interface AgeExtras {
  birthWeekday: string;
  nextBirthdayWeekday: string;
  birthstone: string;
  generation: string;
  /** yyyy-MM-dd，出生日 + 6 个月 */
  halfBirthday: string;
  totalWeeks: number;
  /** 0~100，按预期寿命估算的生命进度百分比 */
  lifeProgress: number;
  heartbeats: number;
  breaths: number;
  sleepHours: number;
}

export interface AgeResult {
  age: AgeBreakdown | null;
  /** 虚岁 */
  nominalAge: number | null;
  constellation: string | null;
  zodiac: string | null;
  nextBirthday: NextBirthday | null;
  extras: AgeExtras | null;
  futureBirthdays: FutureBirthday[];
  milestones: Milestone[];
}

/* ------------------------------------------------------------------ 常量表 */
/* 以下 6 张表逐字取自参考站 chunk，改动即与参考站行为分叉。 */

export const CONSTELLATIONS: { name: string; start: [number, number]; end: [number, number] }[] = [
  { name: '水瓶座', start: [1, 20], end: [2, 18] },
  { name: '双鱼座', start: [2, 19], end: [3, 20] },
  { name: '白羊座', start: [3, 21], end: [4, 19] },
  { name: '金牛座', start: [4, 20], end: [5, 20] },
  { name: '双子座', start: [5, 21], end: [6, 21] },
  { name: '巨蟹座', start: [6, 22], end: [7, 22] },
  { name: '狮子座', start: [7, 23], end: [8, 22] },
  { name: '处女座', start: [8, 23], end: [9, 22] },
  { name: '天秤座', start: [9, 23], end: [10, 23] },
  { name: '天蝎座', start: [10, 24], end: [11, 22] },
  { name: '射手座', start: [11, 23], end: [12, 21] },
  { name: '摩羯座', start: [12, 22], end: [1, 19] },
];

/** 按 `年份 % 12` 取，2024→龙、2026→马 */
export const CHINESE_ZODIAC = ['猴', '鸡', '狗', '猪', '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊'];

/** 按 `Date#getDay()`（0=周日）取 */
export const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 按 `Date#getMonth()`（0=1 月）取 */
export const BIRTHSTONES = [
  '石榴石',
  '紫水晶',
  '海蓝宝石',
  '钻石',
  '祖母绿',
  '珍珠',
  '红宝石',
  '橄榄石',
  '蓝宝石',
  '欧泊',
  '黄水晶',
  '绿松石',
];

export const GENERATIONS: { name: string; start: number; end: number }[] = [
  { name: '失落的一代', start: 1883, end: 1900 },
  { name: '最伟大的一代', start: 1901, end: 1927 },
  { name: '沉默的一代', start: 1928, end: 1945 },
  { name: '婴儿潮一代', start: 1946, end: 1964 },
  { name: 'X 世代', start: 1965, end: 1980 },
  { name: '千禧一代', start: 1981, end: 1996 },
  { name: 'Z 世代', start: 1997, end: 2012 },
  { name: 'Alpha 世代', start: 2013, end: 2025 },
];

/** 预设的重要年龄节点 */
export const MILESTONE_AGES = [1, 3, 6, 10, 12, 18, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** 一年按 365.25 天算，用于生命进度 */
const MS_PER_YEAR = 31_557_600_000;
const MS_PER_WEEK = 604_800_000;

/** 趣味数据（估算）系数 */
const HEARTBEATS_PER_MINUTE = 72;
const BREATHS_PER_MINUTE = 16;
const SLEEP_HOURS_PER_DAY = 8;

export const DEFAULT_LIFE_EXPECTANCY = 80;

/* ------------------------------------------------------------------ 工具函数 */

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** yyyy-MM-dd */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * 解析出生日期 + 时间。参考站用的是 `new Date(`${date}T${time || '00:00'}`)`，
 * 即**本地时区**解析（不是 UTC）。非法输入返回 null。
 */
export function parseBirthDate(date: string, time?: string): Date | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* ------------------------------------------------------------------ 周岁拆解 */

/**
 * 周岁 = 年 + 月 + 天。
 *
 * 参考站口径：三个循环共用游标，先扣整年、再扣整月、余下的整天。
 *
 * ⚠ 这里是原生 `Date` 的**溢出语义**（`1/31` 加一个月 → `3/3`），
 * 换成 dayjs/luxon 的 `add(1, 'month')`（会 clamp 到 `2/28`）结果会不一样，
 * 月末出生的用户会差好几天。**别换库。**
 */
export function calcAgeBreakdown(birth: Date, now: Date): AgeBreakdown | null {
  if (!birth || !now || birth > now) {
    return null;
  }

  let cursor = new Date(birth);
  let years = 0;
  let months = 0;
  let days = 0;

  for (;;) {
    const next = new Date(cursor);
    next.setFullYear(cursor.getFullYear() + 1);
    if (next > now) {
      break;
    }
    cursor = next;
    years += 1;
  }

  for (;;) {
    const next = new Date(cursor);
    next.setMonth(cursor.getMonth() + 1);
    if (next > now) {
      break;
    }
    cursor = next;
    months += 1;
  }

  for (;;) {
    const next = new Date(cursor);
    next.setDate(cursor.getDate() + 1);
    if (next > now) {
      break;
    }
    cursor = next;
    days += 1;
  }

  const ms = now.getTime() - birth.getTime();

  return {
    years,
    months,
    days,
    totalSeconds: Math.floor(ms / 1000),
    totalMinutes: Math.floor(ms / 60_000),
    totalHours: Math.floor(ms / 3_600_000),
    totalDays: Math.floor(ms / 86_400_000),
  };
}

/** 虚岁 = 当前年份 − 出生年份 + 1（出生即算 1 岁，过年长一岁） */
export function calcNominalAge(birth: Date, now: Date): number | null {
  if (!birth || !now || birth > now) {
    return null;
  }
  return now.getFullYear() - birth.getFullYear() + 1;
}

/* ------------------------------------------------------------------ 星座 / 生肖 */

/**
 * 星座。跨年条目（摩羯座 12-22 ~ 1-19）走 `ge || le` 分支，其余走 `ge && le`。
 */
export function getConstellation(month: number, day: number): string {
  for (const sign of CONSTELLATIONS) {
    const [startMonth, startDay] = sign.start;
    const [endMonth, endDay] = sign.end;
    const ge = month > startMonth || (month === startMonth && day >= startDay);
    const le = month < endMonth || (month === endMonth && day <= endDay);
    if (startMonth <= endMonth ? ge && le : ge || le) {
      return sign.name;
    }
  }
  return '未知';
}

export function getChineseZodiac(year: number): string {
  return CHINESE_ZODIAC[year % 12];
}

/* ------------------------------------------------------------------ 下一个生日 */

/**
 * 下一个生日：取**今年**的生日同刻；已过（<= now）则取明年。
 * 保留出生时刻的时分秒，所以倒计时精确到秒。
 *
 * ⚠ 2 月 29 日出生：非闰年 `new Date(y, 1, 29)` 会被 JS 滚到 3 月 1 日。
 * 这是参考站的行为，也是 JS 的既有语义，保持一致（不特殊处理）。
 */
export function getNextBirthday(birth: Date, now: Date): NextBirthday | null {
  if (!birth || !now) {
    return null;
  }

  const buildFor = (year: number) =>
    new Date(year, birth.getMonth(), birth.getDate(), birth.getHours(), birth.getMinutes(), birth.getSeconds());

  let target = buildFor(now.getFullYear());
  if (target <= now) {
    target = buildFor(now.getFullYear() + 1);
  }

  const ms = target.getTime() - now.getTime();

  return {
    date: formatDate(target),
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

/* ------------------------------------------------------------------ 未来生日 */

/**
 * 未来 5 个生日。
 *
 * ⚠ **刻意与参考站不同（用户 2026-10-07 确认）**：
 * 参考站源码是 `for (s = 1..5) year = now.getFullYear() + s`，即从**明年**起列。
 * 这会和上方「下一个生日」脱节 —— 今天 2026-10-07、生日 12-25 的人，
 * 倒计时区块说下一次是 2026-12-25，列表却从 2027 年开始，今年这次被跳过。
 *
 * 我们改成从「下一个生日所在年份」起连续 5 个，让两个区块自洽。
 * 参考站口径保留在单测注释里做对照，别改回去。
 */
export function getFutureBirthdays(birth: Date, now: Date, count = 5): FutureBirthday[] {
  if (!birth || !now || birth > now) {
    return [];
  }

  const next = getNextBirthday(birth, now);
  if (!next) {
    return [];
  }

  const baseYear = Number(next.date.slice(0, 4));
  const out: FutureBirthday[] = [];

  for (let i = 0; i < count; i += 1) {
    const year = baseYear + i;
    const date = new Date(year, birth.getMonth(), birth.getDate());
    out.push({
      year,
      date: formatDate(date),
      ageTurning: year - birth.getFullYear(),
    });
  }

  return out;
}

/* ------------------------------------------------------------------ 重要年龄节点 */

/** 取还没达成的前 5 个预设节点；全部达成返回空数组（UI 显示「已达成全部预设节点」） */
export function getMilestones(birth: Date, age: AgeBreakdown | null, count = 5): Milestone[] {
  if (!birth || !age) {
    return [];
  }
  return MILESTONE_AGES.filter((m) => m > age.years)
    .slice(0, count)
    .map((m) => {
      const year = birth.getFullYear() + m;
      return { age: m, date: formatDate(new Date(year, birth.getMonth(), birth.getDate())) };
    });
}

/* ------------------------------------------------------------------ 附加信息 */

export function getGeneration(year: number): string {
  return GENERATIONS.find((g) => year >= g.start && year <= g.end)?.name ?? '未知';
}

export function calcExtras(
  birth: Date,
  now: Date,
  lifeExpectancy: number,
  age: AgeBreakdown | null,
): AgeExtras | null {
  if (!birth || !now || !age) {
    return null;
  }

  const ms = now.getTime() - birth.getTime();
  const birthAt = (year: number) =>
    new Date(year, birth.getMonth(), birth.getDate(), birth.getHours(), birth.getMinutes(), birth.getSeconds());

  // 下个生日星期：先算今年生日，已过则取明年
  const thisYear = birthAt(now.getFullYear());
  const nextBirthdayDate = thisYear <= now ? birthAt(now.getFullYear() + 1) : thisYear;

  const half = new Date(
    birth.getFullYear(),
    birth.getMonth() + 6,
    birth.getDate(),
    birth.getHours(),
    birth.getMinutes(),
    birth.getSeconds(),
  );

  const expectancy = lifeExpectancy > 0 ? lifeExpectancy : DEFAULT_LIFE_EXPECTANCY;

  return {
    birthWeekday: WEEKDAYS[birth.getDay()],
    nextBirthdayWeekday: WEEKDAYS[nextBirthdayDate.getDay()],
    birthstone: BIRTHSTONES[birth.getMonth()],
    generation: getGeneration(birth.getFullYear()),
    halfBirthday: formatDate(half),
    totalWeeks: Math.floor(ms / MS_PER_WEEK),
    lifeProgress: Math.min(100, Math.max(0, (ms / (MS_PER_YEAR * expectancy)) * 100)),
    heartbeats: HEARTBEATS_PER_MINUTE * age.totalMinutes,
    breaths: BREATHS_PER_MINUTE * age.totalMinutes,
    sleepHours: SLEEP_HOURS_PER_DAY * age.totalDays,
  };
}

/* ------------------------------------------------------------------ 汇总 */

export function calcAgeResult(
  birthDate: string,
  birthTime: string,
  now: Date,
  lifeExpectancy: number = DEFAULT_LIFE_EXPECTANCY,
): AgeResult {
  const birth = parseBirthDate(birthDate, birthTime);

  if (!birth) {
    return {
      age: null,
      nominalAge: null,
      constellation: null,
      zodiac: null,
      nextBirthday: null,
      extras: null,
      futureBirthdays: [],
      milestones: [],
    };
  }

  const age = calcAgeBreakdown(birth, now);

  return {
    age,
    nominalAge: calcNominalAge(birth, now),
    constellation: getConstellation(birth.getMonth() + 1, birth.getDate()),
    zodiac: getChineseZodiac(birth.getFullYear()),
    nextBirthday: getNextBirthday(birth, now),
    extras: calcExtras(birth, now, lifeExpectancy, age),
    futureBirthdays: getFutureBirthdays(birth, now),
    milestones: age ? getMilestones(birth, age) : [],
  };
}

/* ------------------------------------------------------------------ 复制文案 */

/**
 * 一键复制的整段文案。格式逐字对齐参考站（标点、空格都一致），
 * 因为它会直接被用户粘到聊天框里，改格式属于破坏性变更。
 */
export function buildCopyText(args: {
  birthDate: string;
  birthTime: string;
  age: AgeBreakdown;
  nominalAge: number | null;
  constellation: string | null;
  zodiac: string | null;
  nextBirthday: NextBirthday | null;
}): string {
  const { birthDate, birthTime, age, nominalAge, constellation, zodiac, nextBirthday } = args;

  const head =
    `出生日期：${birthDate} ${birthTime || '00:00'}，` +
    `周岁：${age.years} 岁 ${age.months} 个月 ${age.days} 天，` +
    `虚岁：${nominalAge ?? '—'} 岁。星座：${constellation ?? '未知'}，生肖：${zodiac ?? '未知'}。`;

  if (!nextBirthday) {
    return head;
  }

  return (
    head +
    `已生活 ${age.totalDays} 天 ${age.totalHours % 24} 小时 ${age.totalMinutes % 60} 分钟 ${age.totalSeconds % 60} 秒。` +
    `下一个生日还有 ${nextBirthday.days} 天 ${nextBirthday.hours} 小时 ${nextBirthday.minutes} 分钟 ${nextBirthday.seconds} 秒。`
  );
}
