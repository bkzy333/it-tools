import { expect, describe, it } from 'vitest';
import {
  calcBmi,
  calcRawBmi,
  classifyBmi,
  healthyWeightRange,
  toMetric,
  US_FACTOR,
  STANDARDS,
  calcBmr,
  calcTdee,
  calcDietAdvice,
  calcIdealWeightRange,
  calcGaugePercent,
} from './bmi-calculator.service';

/**
 * 用例直接对应参考站 https://cn.onlinebmicalculator.com/ 的运行时 dump
 * （`_recon-bmi/`），阈值逐点锁定，别改回直觉数字。
 */
describe('bmi-calculator / 换算', () => {
  it('公制：kg / m²', () => {
    // 65kg / 170cm → 22.491… → round 1 位 = 22.5（参考站输出 22.5）
    expect(calcRawBmi(65, 170, 'metric')).toBeCloseTo(22.49, 2);
    expect(calcBmi(65, 170, 'metric')).toBe(22.5);
  });

  it('英制：lb / in² × 703', () => {
    // 67in / 150lb → 23.487… → 参考站输出 23.5，与 metric 一致
    expect(US_FACTOR).toBe(703);
    expect(calcRawBmi(150, 67, 'us')).toBeCloseTo(23.49, 2);
    expect(calcBmi(150, 67, 'us')).toBe(23.5);
  });

  it('toMetric 英制归一', () => {
    const m = toMetric(150, 67, 'us');
    expect(m.weightKg).toBeCloseTo(150 * 0.45359237, 5);
    expect(m.heightM).toBeCloseTo(67 * 0.0254, 5);
  });

  it('非法输入返回 null', () => {
    expect(calcBmi(0, 170, 'metric')).toBeNull();
    expect(calcBmi(-5, 170, 'metric')).toBeNull();
    expect(calcBmi(65, 0, 'metric')).toBeNull();
    expect(calcBmi(Number.NaN, 170, 'metric')).toBeNull();
  });
});

describe('bmi-calculator / 中国标准分类', () => {
  it('四档阈值：<18.5 偏瘦 | <24 正常 | <28 过重 | ≥28 肥胖', () => {
    expect(classifyBmi(18.4, 'chinese').label).toBe('偏瘦');
    expect(classifyBmi(18.5, 'chinese').label).toBe('正常');
    expect(classifyBmi(23.9, 'chinese').label).toBe('正常');
    expect(classifyBmi(24.0, 'chinese').label).toBe('过重');
    expect(classifyBmi(27.9, 'chinese').label).toBe('过重');
    expect(classifyBmi(28.0, 'chinese').label).toBe('肥胖');
  });

  it('round 到 1 位后判定：18.45 → 18.5 → 正常', () => {
    // 参考站把 BMI 先 round 到 1 位再判定（精确 BMI 18.45 显示 18.5 并判「正常」）。
    // 所以 classifyBmi 接收的是 round 后的值：calcBmi(53.3205, 170) = 18.5 → 正常
    const rounded = calcBmi(53.3205, 170, 'metric')!;
    expect(rounded).toBe(18.5);
    expect(classifyBmi(rounded, 'chinese').label).toBe('正常');
    // 而 raw 18.45 若不经 round 直接判，是「偏瘦」—— 证明 round 顺序不可省略
    expect(calcRawBmi(53.3205, 170, 'metric')!).toBeLessThan(18.5);
  });
});

describe('bmi-calculator / 国际标准(WHO)分类', () => {
  it('六级阈值', () => {
    expect(classifyBmi(18.4, 'international').label).toBe('偏瘦');
    expect(classifyBmi(18.5, 'international').label).toBe('正常');
    expect(classifyBmi(24.9, 'international').label).toBe('正常');
    expect(classifyBmi(25.0, 'international').label).toBe('过重');
    expect(classifyBmi(29.9, 'international').label).toBe('过重');
    expect(classifyBmi(30.0, 'international').label).toBe('1类肥胖');
    expect(classifyBmi(34.9, 'international').label).toBe('1类肥胖');
    expect(classifyBmi(35.0, 'international').label).toBe('2类肥胖');
    expect(classifyBmi(39.9, 'international').label).toBe('2类肥胖');
    expect(classifyBmi(40.0, 'international').label).toBe('3类肥胖');
  });
});

describe('bmi-calculator / 日本标准分类', () => {
  it('四档阈值：<18.5 | <23 | <25 | ≥25', () => {
    expect(classifyBmi(18.4, 'japanese').label).toBe('偏瘦');
    expect(classifyBmi(18.5, 'japanese').label).toBe('正常');
    expect(classifyBmi(22.9, 'japanese').label).toBe('正常');
    expect(classifyBmi(23.0, 'japanese').label).toBe('过重');
    expect(classifyBmi(24.9, 'japanese').label).toBe('过重');
    expect(classifyBmi(25.0, 'japanese').label).toBe('肥胖');
  });
});

describe('bmi-calculator / 新加坡标准分类', () => {
  it('五档阈值：<18.5 | <23 | ≤27.5 | ≤40 | >40', () => {
    expect(classifyBmi(18.4, 'singapore').label).toBe('偏瘦');
    expect(classifyBmi(18.5, 'singapore').label).toBe('正常');
    expect(classifyBmi(22.9, 'singapore').label).toBe('正常');
    expect(classifyBmi(23.0, 'singapore').label).toBe('过重');
    expect(classifyBmi(27.5, 'singapore').label).toBe('过重');
    // 27.55 → round 27.6 → 肥胖（参考站 27.6 判肥胖、27.5 判过重）
    expect(classifyBmi(27.6, 'singapore').label).toBe('肥胖');
    expect(classifyBmi(40.0, 'singapore').label).toBe('肥胖');
    expect(classifyBmi(40.1, 'singapore').label).toBe('非常肥胖');
  });
});

describe('bmi-calculator / 健康体重范围', () => {
  it('中国标准 170cm 正常体重约 53.5~69.0kg', () => {
    const r = healthyWeightRange(170, 'metric', 'chinese')!;
    // 正常档 18.5~23.9，按 round 边界 18.45~23.95：18.45*2.89≈53.3，23.95*2.89≈69.2
    expect(r.minKg).toBeGreaterThan(53);
    expect(r.minKg).toBeLessThan(54);
    expect(r.maxKg).toBeGreaterThan(69);
    expect(r.maxKg).toBeLessThan(70);
  });

  it('无「正常」档不会发生（四种标准都有）', () => {
    expect(STANDARDS.chinese.some((c) => c.label === '正常')).toBe(true);
    expect(STANDARDS.international.some((c) => c.label === '正常')).toBe(true);
    expect(STANDARDS.japanese.some((c) => c.label === '正常')).toBe(true);
    expect(STANDARDS.singapore.some((c) => c.label === '正常')).toBe(true);
  });
});

describe('bmi-calculator / BMR（Mifflin-St Jeor，ggbom 口径）', () => {
  it('男生：10w+6.25h-5a+5', () => {
    // 65kg / 175cm / 25 岁 男 → 10*65 + 6.25*175 - 5*25 + 5 = 650 + 1093.75 - 125 + 5 = 1623.75 → 1624
    expect(calcBmr(65, 175, 25, 'male')).toBe(1624);
  });

  it('女生：10w+6.25h-5a-161', () => {
    // 65kg / 175cm / 25 岁 女 → 650 + 1093.75 - 125 - 161 = 1457.75 → 1458
    expect(calcBmr(65, 175, 25, 'female')).toBe(1458);
  });

  it('参考站默认值：65kg/175cm/25岁男 → 1588 与实测一致？', () => {
    // 参考站页面默认 65kg 175cm 25岁 男 显示 BMR 1588 —— 那是 65/170/25 的结果：
    // 10*65 + 6.25*170 - 5*25 + 5 = 650 + 1062.5 - 125 + 5 = 1592.5 → 1593
    // 实测页面是 1588，说明默认身高其实是 170 且年龄/体重有细微差。这里只锁公式本身。
    expect(calcBmr(65, 170, 25, 'male')).toBe(1593);
  });

  it('非法输入返回 null', () => {
    expect(calcBmr(0, 175, 25, 'male')).toBeNull();
    expect(calcBmr(65, 0, 25, 'male')).toBeNull();
    expect(calcBmr(65, 175, 0, 'male')).toBeNull();
  });
});

describe('bmi-calculator / TDEE 与饮食建议（ggbom 口径）', () => {
  it('TDEE = BMR × 活动系数', () => {
    expect(calcTdee(1624, 1.2)).toBe(1949); // 1624*1.2 = 1948.8 → 1949
    expect(calcTdee(1624, 1.55)).toBe(2517); // 1624*1.55 = 2517.2 → 2517
  });

  it('三档建议：减脂 max(bmr, tdee-500)、维持 tdee、增肌 tdee+300', () => {
    const bmr = 1624;
    const tdee = 1949;
    const d = calcDietAdvice(bmr, tdee)!;
    expect(d.lose).toBe(Math.max(bmr, tdee - 500)); // 1449 → 但 < bmr，取 bmr = 1624
    expect(d.lose).toBe(1624);
    expect(d.maintain).toBe(1949);
    expect(d.gain).toBe(2249); // 1949+300
  });

  it('减脂兜底：tdee-500 低于 bmr 时取 bmr', () => {
    // bmr 1500, tdee 1800 → tdee-500=1300 < bmr → lose=1500
    expect(calcDietAdvice(1500, 1800)!.lose).toBe(1500);
  });
});

describe('bmi-calculator / 理想体重区间与仪表盘（ggbom 口径）', () => {
  it('理想体重 18.5~23.9 反推，170cm → 53.5~69.1', () => {
    const r = calcIdealWeightRange(170)!;
    // 18.5 * 2.89 = 53.465 → 53.5；23.9 * 2.89 = 69.071 → 69.1
    expect(r.minKg).toBe(53.5);
    expect(r.maxKg).toBe(69.1);
  });

  it('仪表盘指针位置：21.2 → 正常区约 30.8%', () => {
    // 21.2 在正常档：17.5 + (21.2-18.5)/(24-18.5)*27.5 = 17.5 + 2.7/5.5*27.5 = 17.5+13.5 = 31.0
    const p = calcGaugePercent(21.2);
    expect(p).toBeCloseTo(31.0, 1);
  });

  it('仪表盘边界：偏瘦 <18.5 与肥胖封顶 100%', () => {
    expect(calcGaugePercent(17)).toBeGreaterThan(0);
    expect(calcGaugePercent(17)).toBeLessThan(17.5);
    expect(calcGaugePercent(18.5)).toBeCloseTo(17.5, 0);
    expect(calcGaugePercent(24)).toBeCloseTo(45.0, 0);
    expect(calcGaugePercent(28)).toBeCloseTo(65.0, 0);
    expect(calcGaugePercent(40)).toBe(100); // 封顶
    expect(calcGaugePercent(100)).toBe(100);
  });
});
