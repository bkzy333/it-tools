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
