import { useStorage } from '@vueuse/core';

// 工具使用频次统计
// 1) 本机维度：localStorage，key = it-tools-usage，用于首页「你常用的工具」
// 2) 全站维度：上报到 Cloudflare Pages Functions（/api/hot，KV 存储），用于首页「热门工具」
//    接口不可用（KV 未绑定 / 出错）时静默失败，前端自动回退，不影响使用。

const STORAGE_KEY = 'it-tools-usage';
const REPORT_PREFIX = 'it-tools-report:';
const REPORT_TTL_MS = 24 * 60 * 60 * 1000; // 同一个浏览器、同一个工具，24 小时内只上报一次

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

function canReport(path: string): boolean {
  try {
    const last = Number(localStorage.getItem(`${REPORT_PREFIX}${path}`) ?? 0);
    if (Date.now() - last < REPORT_TTL_MS) {
      return false;
    }
    localStorage.setItem(`${REPORT_PREFIX}${path}`, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

// 上报一次访问给服务端（去重后写入，失败静默）
export async function reportToolVisit(path: string) {
  if (!path || typeof fetch === 'undefined' || !canReport(path)) {
    return;
  }
  try {
    await fetch('/api/hot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: path }),
      keepalive: true,
    });
  } catch {
    // 上报失败无所谓，首页会回退到精选热门
  }
}

// 拉全站热门排行，返回工具路径数组；拿不到就返回空数组
export async function fetchGlobalHotTools(limit = 12): Promise<string[]> {
  try {
    const response = await fetch('/api/hot', { headers: { accept: 'application/json' } });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as { list?: { path?: string }[] };
    return (data.list ?? [])
      .slice(0, limit)
      .map((item) => item.path)
      .filter((path): path is string => typeof path === 'string');
  } catch {
    return [];
  }
}
