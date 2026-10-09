/**
 * BMI 计算器 —— 纯逻辑层。
 *
 * 行为规格来自两个参考站的生产行为（运行时 dump，见 `_recon-bmi/`、`_recon-ggbom/`）：
 * - BMI 四种标准阈值：https://cn.onlinebmicalculator.com/（服务端计算，POST 逐点探测）
 * - BMR/TDEE/理想体重/仪表盘：https://www.ggbom.cn/tools/bmi（inline JS，SOURCE 级）
 * 两者均未开源 → 按 **NONE** 许可证处理：只对齐「行为」，代码全部重写。
 *
 * 关键行为（均已验证，别改回直觉数字）：
 * 1. 换算：公制 `体重(kg) / 身高(m)²`；英制 `体重(lb) / 身高(in)² × 703`
 *    （67 in / 150 lb → 23.5，与各标准 metric 一致）。
 * 2. 分类阈值用**四舍五入到 1 位小数后的 BMI**判定，不是原始值。
 *    所以新加坡 27.55 会先 round 成 27.6 → 判「肥胖」。
 * 3. BMI 展示保留 1 位小数（参考站 65kg/170cm → 22.5，不是 22.49）。
 * 4. BMR 用 Mifflin-St Jeor：男 `10w+6.25h-5a+5`，女 `10w+6.25h-5a-161`（round 整数）。
 * 5. TDEE = BMR × 活动系数；减脂 `max(bmr, tdee-500)`、维持 `tdee`、增肌 `tdee+300`。
 */

/* ------------------------------------------------------------------ 单位制 */

export type UnitSystem = 'metric' | 'us';

/** 英制换算系数：BMI = lb / in² × 703（WHO 标准换算） */
export const US_FACTOR = 703;

/* ------------------------------------------------------------------ 标准定义 */

export type BmiStandard = 'international' | 'chinese' | 'japanese' | 'singapore';

export interface BmiCategoryDef {
  /** 分类名（中文） */
  label: string;
  /** 该分类的 BMI 下界（含）；最瘦的一档为 -Infinity */
  min: number;
  /** 该分类的 BMI 上界（含）；最胖的一档为 Infinity */
  max: number;
}

/**
 * 四种标准的分类阈值。
 *
 * 阈值逐点来自参考站运行时 dump（BMI 先 round 到 1 位小数再判定）：
 * - 国际(WHO) ：<18.5 偏瘦 | <25 正常 | <30 过重 | <35 1类肥胖 | <40 2类肥胖 | ≥40 3类肥胖
 * - 中国      ：<18.5 偏瘦 | <24 正常 | <28 过重 | ≥28 肥胖
 * - 日本      ：<18.5 偏瘦 | <23 正常 | <25 过重 | ≥25 肥胖
 * - 新加坡    ：<18.5 偏瘦 | <23 正常 | ≤27.5 过重 | ≤40 肥胖 | >40 非常肥胖
 *
 * 注意：这里用「含边界」的区间表达（min ≤ bmi ≤ max），最瘦/最胖档用 ±Infinity。
 * 判定用 round 后的 BMI，所以 18.45 → 18.5 会落入「正常」而非「偏瘦」，
 * 这一点和参考站完全一致（参考站 18.5 判正常、18.4 判偏瘦）。
 */
export const STANDARDS: Record<BmiStandard, BmiCategoryDef[]> = {
  international: [
    { label: '偏瘦', min: -Infinity, max: 18.4 },
    { label: '正常', min: 18.5, max: 24.9 },
    { label: '过重', min: 25.0, max: 29.9 },
    { label: '1类肥胖', min: 30.0, max: 34.9 },
    { label: '2类肥胖', min: 35.0, max: 39.9 },
    { label: '3类肥胖', min: 40.0, max: Infinity },
  ],
  chinese: [
    { label: '偏瘦', min: -Infinity, max: 18.4 },
    { label: '正常', min: 18.5, max: 23.9 },
    { label: '过重', min: 24.0, max: 27.9 },
    { label: '肥胖', min: 28.0, max: Infinity },
  ],
  japanese: [
    { label: '偏瘦', min: -Infinity, max: 18.4 },
    { label: '正常', min: 18.5, max: 22.9 },
    { label: '过重', min: 23.0, max: 24.9 },
    { label: '肥胖', min: 25.0, max: Infinity },
  ],
  singapore: [
    { label: '偏瘦', min: -Infinity, max: 18.4 },
    { label: '正常', min: 18.5, max: 22.9 },
    { label: '过重', min: 23.0, max: 27.5 },
    { label: '肥胖', min: 27.6, max: 40.0 },
    { label: '非常肥胖', min: 40.1, max: Infinity },
  ],
};

/* ------------------------------------------------------------------ 换算 */

/**
 * 把身高/体重归一成「kg + m」。
 * 公制：身高按 cm 传入，转 m；英制：身高按 in 传入，体重按 lb 传入，转 kg/m。
 */
export function toMetric(
  weight: number,
  height: number,
  unit: UnitSystem,
): { weightKg: number; heightM: number } {
  if (unit === 'us') {
    return {
      weightKg: weight * 0.45359237, // lb → kg
      heightM: height * 0.0254, // in → m
    };
  }
  return {
    weightKg: weight,
    heightM: height / 100, // cm → m
  };
}

/** 原始 BMI（不取整）。非法输入（非正数）返回 null。 */
export function calcRawBmi(weight: number, height: number, unit: UnitSystem): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) {
    return null;
  }
  if (unit === 'us') {
    return (weight / (height * height)) * US_FACTOR;
  }
  const { weightKg, heightM } = toMetric(weight, height, unit);
  return weightKg / (heightM * heightM);
}

/**
 * 展示用 BMI：四舍五入到 1 位小数。
 * 参考站输出就是 1 位小数（65kg/170cm → 22.5）。
 */
export function calcBmi(weight: number, height: number, unit: UnitSystem): number | null {
  const raw = calcRawBmi(weight, height, unit);
  if (raw === null) {
    return null;
  }
  return Math.round(raw * 10) / 10;
}

/* ------------------------------------------------------------------ 分类 */

/**
 * 按「四舍五入到 1 位小数后的 BMI」判定所属分类。
 * 这是参考站的行为：它先 round 再比较阈值（18.45 → 18.5 → 正常）。
 */
export function classifyBmi(bmi: number, standard: BmiStandard): BmiCategoryDef {
  const defs = STANDARDS[standard];
  return defs.find((d) => bmi >= d.min && bmi <= d.max) ?? defs[defs.length - 1];
}

/* ------------------------------------------------------------------ 健康体重范围 */

/**
 * 按给定标准、给定身高，反推落在「正常」档的体重范围（kg）。
 * 返回 [minKg, maxKg]，四舍五入到 0.1 kg。找不到「正常」档返回 null。
 *
 * 范围边界 = 正常档的 min/max 各向外扩 0.05（因为判定用 round 到 0.1 的 BMI，
 * 正常档下界 18.5 意味着原始 BMI ∈ [18.45, 18.55) 都会 round 成 18.5）。
 * 为稳妥起见，用「能 round 进正常档」的原始 BMI 闭区间来反推体重。
 */
export function healthyWeightRange(
  height: number,
  unit: UnitSystem,
  standard: BmiStandard,
): { minKg: number; maxKg: number } | null {
  const normal = STANDARDS[standard].find((d) => d.label === '正常');
  if (!normal || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  const { heightM } = toMetric(1, height, unit); // 只取身高换算，weight 传 1 占位
  const h2 = heightM * heightM;
  // round 到 0.1 的最小原始值 = min - 0.05；最大原始值 = max + 0.04999…
  const lo = normal.min - 0.05;
  const hi = normal.max + 0.05;
  return {
    minKg: Math.round(lo * h2 * 10) / 10,
    maxKg: Math.round(hi * h2 * 10) / 10,
  };
}

/* ------------------------------------------------------------------ 历史记录 */

export interface BmiHistoryEntry {
  id: string;
  /** 时间戳（ms） */
  ts: number;
  /** 录入日期 yyyy-MM-dd */
  date: string;
  height: number;
  weight: number;
  unit: UnitSystem;
  standard: BmiStandard;
  bmi: number;
  category: string;
}

/** localStorage key，与参考站一样按浏览器本地保存，不联网、不上传服务器 */
export const HISTORY_KEY = 'bmi-history';

/** 读取历史（按时间倒序）。SSR/无 localStorage 环境返回空数组。 */
export function loadHistory(): BmiHistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 追加一条记录并落盘，返回新数组（倒序）。 */
export function saveHistory(entry: BmiHistoryEntry): BmiHistoryEntry[] {
  const list = [entry, ...loadHistory()].slice(0, 100); // 最多保留 100 条
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      /* 配额满等异常静默忽略 */
    }
  }
  return list;
}

/** 删除一条记录并落盘，返回新数组。 */
export function deleteHistory(id: string): BmiHistoryEntry[] {
  const list = loadHistory().filter((e) => e.id !== id);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
  return list;
}

/** 清空历史。 */
export function clearHistory(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ 代谢分析 */
/* 行为规格来自 ggbom.cn/tools/bmi 的 inline JS（SOURCE 级）。 */

export type Gender = 'male' | 'female';

/** 活动强度系数（参考站逐字：1.2 / 1.375 / 1.55 / 1.725 / 1.9） */
export const ACTIVITY_LEVELS: { value: number; label: string }[] = [
  { value: 1.2, label: '极少运动 (久坐办公室、基本不运动)' },
  { value: 1.375, label: '轻度活动 (每周运动/散步 1-3 次)' },
  { value: 1.55, label: '中度活动 (每周运动 3-5 次，强度中等)' },
  { value: 1.725, label: '重度活动 (每周高强度运动 6-7 次)' },
  { value: 1.9, label: '极高强度 (专业运动员、高强度体力劳动者)' },
];

/**
 * 基础代谢率 BMR（Mifflin-St Jeor 修正公式）。
 * 男：`10×体重(kg) + 6.25×身高(cm) − 5×年龄 + 5`
 * 女：`10×体重(kg) + 6.25×身高(cm) − 5×年龄 − 161`
 * 返回四舍五入整数。输入非法返回 null。
 */
export function calcBmr(weightKg: number, heightCm: number, age: number, gender: Gender): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || !Number.isFinite(age) || weightKg <= 0 || heightCm <= 0 || age <= 0) {
    return null;
  }
  const offset = gender === 'male' ? 5 : -161;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + offset);
}

/** TDEE = BMR × 活动系数，四舍五入整数。 */
export function calcTdee(bmr: number, activityMultiplier: number): number | null {
  if (!Number.isFinite(bmr) || !Number.isFinite(activityMultiplier) || bmr <= 0 || activityMultiplier <= 0) {
    return null;
  }
  return Math.round(bmr * activityMultiplier);
}

/** 三档饮食建议：减脂 `max(bmr, tdee-500)`、维持 `tdee`、增肌 `tdee+300`。 */
export function calcDietAdvice(bmr: number, tdee: number): { lose: number; maintain: number; gain: number } | null {
  if (!Number.isFinite(bmr) || !Number.isFinite(tdee) || bmr <= 0 || tdee <= 0) {
    return null;
  }
  return {
    lose: Math.round(Math.max(bmr, tdee - 500)),
    maintain: Math.round(tdee),
    gain: Math.round(tdee + 300),
  };
}

/**
 * 理想体重区间：BMI 18.5 ~ 23.9 反推（中国标准「正常」档）。
 * 返回 [minKg, maxKg]，保留 1 位小数。这是参考站固定用的 18.5~23.9，
 * 与上方 healthyWeightRange 的区别是：那个随所选标准联动，这个固定中国标准
 * （BMR/TDEE 代谢分析本来就是中国标准语境）。
 */
export function calcIdealWeightRange(heightCm: number): { minKg: number; maxKg: number } | null {
  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    return null;
  }
  const h2 = (heightCm / 100) ** 2;
  return {
    minKg: Math.round(18.5 * h2 * 10) / 10,
    maxKg: Math.round(23.9 * h2 * 10) / 10,
  };
}

/**
 * BMI 仪表盘指针位置（%）。
 * 参考站刻度：BMI 15 → 0%，35 → 100%（总宽 20 个单位）。
 * - 偏瘦 <18.5：15~18.5 映射 0%~17.5%
 * - 正常 <24 ：18.5~24 映射 17.5%~45%
 * - 过重 <28 ：24~28 映射 45%~65%
 * - 肥胖 ≥28 ：28~35 映射 65%~100%（封顶 100%）
 * 返回 0~100 的百分比。
 */
export function calcGaugePercent(bmi: number): number {
  if (bmi < 18.5) {
    const ratio = (bmi - 15) / (18.5 - 15);
    return Math.max(0, ratio * 17.5);
  }
  if (bmi < 24.0) {
    const ratio = (bmi - 18.5) / (24.0 - 18.5);
    return 17.5 + ratio * 27.5;
  }
  if (bmi < 28.0) {
    const ratio = (bmi - 24.0) / (28.0 - 24.0);
    return 45.0 + ratio * 20.0;
  }
  const ratio = (bmi - 28.0) / (35.0 - 28.0);
  return 65.0 + Math.min(35.0, ratio * 35.0);
}

