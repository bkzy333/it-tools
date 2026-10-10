// 翻译用量「每日播报 + 突增巡查」Worker（非 Pages Function，需单独部署为 Cloudflare Worker）。
//
// 为什么单独一个 Worker：Cloudflare Pages Functions 不支持 cron 定时，定时任务必须落到 Worker 上。
//
// 部署步骤（一次性）：
//   1) 在 Cloudflare 控制台新建一个 Worker，把本文件作为入口（export default）。
//   2) 给 Worker 绑定同一个 KV 命名空间（变量名必须叫 TOOLS_USAGE，与 Pages 项目用的同一个）。
//   3) 在 Worker 的「触发器 → Cron 触发器」加一条：`5 0 * * *`（每天 UTC 0:05）。
//   4) 可选：绑定 TG_BOT_TOKEN / TG_CHAT_ID 环境变量，用量播报会推到你的 Telegram。
//      没配则只在 Worker 日志里打印，不影响主流程。
//
// 注：突增告警（今日 > 昨日同时段 ×3）已由 functions/api/_translate-common.ts 在每次调用时实时触发，
//     这里只负责「每日汇总播报」，两者互补。

interface KvLike {
  get(key: string): Promise<string | null>;
}

interface WorkerEnv {
  TOOLS_USAGE?: KvLike;
  TG_BOT_TOKEN?: string;
  TG_CHAT_ID?: string;
}

interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

const TXT_FREE = 5_000_000;
const IMG_FREE = 10_000;

export default {
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const kv = env.TOOLS_USAGE;
    if (!kv) {
      console.warn('[budget-watch] TOOLS_USAGE 未绑定，跳过');
      return;
    }

    const ym = new Date().toISOString().slice(0, 7);
    const ymd = new Date().toISOString().slice(0, 10);

    const txUsed = Number((await kv.get(`tx:used:txt:${ym}`)) ?? 0) || 0;
    const imgUsed = Number((await kv.get(`tx:used:img:${ym}`)) ?? 0) || 0;
    const txDay = Number((await kv.get(`tx:day:txt:${ymd}`)) ?? 0) || 0;
    const imgDay = Number((await kv.get(`tx:day:img:${ymd}`)) ?? 0) || 0;

    const pct = (u: number, q: number) => Math.round((u / q) * 100);
    const txPct = pct(txUsed, TXT_FREE);
    const imgPct = pct(imgUsed, IMG_FREE);

    const lines = [
      `📊 翻译用量日报（${ymd} UTC）`,
      `文本：${txUsed} / ${TXT_FREE} 字符（${txPct}%）`,
      `图片：${imgUsed} / ${IMG_FREE} 次（${imgPct}%）`,
      `今日新增：文本 ${txDay} · 图片 ${imgDay}`,
    ];
    if (txPct >= 95 || imgPct >= 95) {
      lines.push('🚨 已接近月免费额度上限，建议尽快处理！');
    }
    const message = lines.join('\n');

    console.log('[budget-watch]', message);

    if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
      ctx.waitUntil(
        fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: message }),
        }).catch((e) => console.warn('[budget-watch] 推送失败', String(e))),
      );
    }
  },
};
