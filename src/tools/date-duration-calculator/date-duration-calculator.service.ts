// 时长解析原本由独立的 duration-calculator 工具提供，该工具已下线，
// 实现内联到本目录，避免保留工具依赖已删除的模块。
import { computeDuration } from './duration.service';

export function addToDate(date: Date, durations: string) {
  const { total, errors } = computeDuration(durations);

  return {
    errors,
    date: new Date(date.getTime() + total.milliseconds),
    durationSeconds: total.seconds,
    durationPretty: total.prettified,
  };
}

/*
 * 新版结构化步骤引擎（替代旧的手填文本）。
 * 设计要点（与 timetool.cn / 用户需求一致）：
 *  - 用户不再手填 "HH:MM:SS" 之类的符号，改用「往前/往后 + 数量 + 单位」的下拉组合。
 *  - 支持多步链式运算：例如 2026-12-01 10:00 往后10天 → 往前1年 → 往后10小时。
 *  - 年和月按"日历"计算（setFullYear / setMonth，自动处理月末进位、闰年），其余单位按固定毫秒数。
 *    这与 it-tools 原 duration.service 的固定毫秒口径不同，但更符合普通用户对"加1个月"的预期。
 *  - 旧的 addToDate(文本) 仍保留（被单测锁定），本引擎仅供新 UI 使用，互不影响。
 */

export type DateStepUnit = 'y' | 'M' | 'w' | 'd' | 'h' | 'm' | 's';

export interface DateStep {
  op: 'add' | 'sub';
  amount: number;
  unit: DateStepUnit;
}

export interface DateStepTrace {
  index: number;
  op: 'add' | 'sub';
  amount: number;
  unit: DateStepUnit;
  date: Date;
}

export interface StepsResult {
  date: Date;
  start: Date;
  steps: DateStepTrace[];
  /** 与起点之间的精确秒差（按实际时刻计算，年/月也精确） */
  elapsedSeconds: number;
  weekdayIndex: number;
}

const FIXED_UNIT_MS: Record<'d' | 'h' | 'm' | 's', number> = {
  d: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000,
};

/**
 * 按"日历"加/减月或年：先定位目标月份，再把日号夹到该月的最后一天以内。
 * 关键修复：原生 Date.setMonth(1月31日 + 1) 会溢出成 3月2日（经典 JS bug），
 * 这里显式夹到月末，使 "1月31日加1个月 = 2月28/29日" 成立。
 */
function addCalendarMonths(base: Date, months: number): Date {
  const target = new Date(
    base.getFullYear(),
    base.getMonth() + months,
    1,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds(),
  );
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return target;
}

export function applySteps(start: Date, steps: DateStep[]): StepsResult {
  let cur = new Date(start.getTime());
  const traces: DateStepTrace[] = [];

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const sign = st.op === 'sub' ? -1 : 1;
    const amount = Math.abs(Number(st.amount) || 0) * sign;
    let next = new Date(cur.getTime());

    if (st.unit === 'y' || st.unit === 'M') {
      next = addCalendarMonths(next, st.unit === 'y' ? amount * 12 : amount);
    } else if (st.unit === 'w') {
      next.setTime(next.getTime() + amount * 7 * FIXED_UNIT_MS.d);
    } else {
      next.setTime(next.getTime() + amount * FIXED_UNIT_MS[st.unit]);
    }

    cur = next;
    traces.push({
      index: i + 1,
      op: st.op,
      amount: Number(st.amount) || 0,
      unit: st.unit,
      date: new Date(cur.getTime()),
    });
  }

  const elapsedSeconds = Math.round((cur.getTime() - start.getTime()) / 1000);
  return {
    date: cur,
    start: new Date(start.getTime()),
    steps: traces,
    elapsedSeconds,
    weekdayIndex: cur.getDay(),
  };
}
