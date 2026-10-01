import { useStorage } from '@vueuse/core';

// 工具使用频次统计：数据只存在访问者自己的浏览器里，不上传服务器。
// 需要「全站所有人」的热门排行时，要接后端（Cloudflare Pages Functions + KV/D1），
// 这里是零成本、零后端的替代方案。
const STORAGE_KEY = 'it-tools-usage';

const usage = useStorage<Record<string, number>>(STORAGE_KEY, {});

export function recordToolVisit(path: string) {
  if (!path) {
    return;
  }
  usage.value = { ...usage.value, [path]: (usage.value[path] ?? 0) + 1 };
}

// 返回访问次数最多的工具路径（降序）
export function getMostUsedPaths(limit: number): string[] {
  return Object.entries(usage.value)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, limit)
    .map(([path]) => path);
}
