// Cloudflare Pages Function：同源「我的 IP」查询。
//
//   GET /api/my-ip
//   returns(JSON): { ip, type, country, countryCode, region, city, timezone, isp, org, asn, source }
//
// 设计要点：
//   - 不依赖任何第三方接口。Cloudflare 边缘本身就知道访客的真实公网 IP 与归属地，
//     直接从请求头 CF-Connecting-IP 和请求对象 request.cf 读取即可。
//   - 同源请求，浏览器端 fetch('/api/my-ip') 不受 CORS 限制，国内网络也 100% 可达，
//     彻底规避此前「ipwho.is / ipify / ip.sb / cloudflare trace 直连被拦」整页报错的问题。
//   - 没有外部网络依赖 → 不会超时、不会被墙、免费、隐私更优（IP 不流出本站）。
//   - 降级：request.cf 的地理字段在某些边缘可能为空，这种情况只回退少地理信息，IP 始终有。

// 常见国家/地区 ISO 3166-1 alpha-2 → 中文名（其余未知时回退为代码本身）
const COUNTRY_CN: Record<string, string> = {
  CN: '中国',
  HK: '中国香港',
  MO: '中国澳门',
  TW: '中国台湾',
  US: '美国',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  CA: '加拿大',
  AU: '澳大利亚',
  RU: '俄罗斯',
  IN: '印度',
  BR: '巴西',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  ID: '印度尼西亚',
  PH: '菲律宾',
  NZ: '新西兰',
  NL: '荷兰',
  ES: '西班牙',
  IT: '意大利',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*',
    },
  });
}

export async function onRequestGet(context: { request: Request }) {
  const req = context.request;

  // 真实访客 IP：Cloudflare 在边缘注入的请求头，绝不会缺失
  const ip =
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '';

  if (!ip) {
    // 极端兜底：连 IP 都拿不到（理论不会发生），让前端退回到第三方源
    return json({ error: 'no client ip available' }, 502);
  }

  // Cloudflare 边缘附带的地理/ASN 信息（部分字段可能为空）
  const cf: Record<string, unknown> = (req as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const countryCode = (cf.country as string) || '';
  const type = ip.includes(':') ? 'IPv6' : 'IPv4';
  const asnNum = cf.asn as number | undefined;
  const asOrg = (cf.asOrganization as string) || '';

  return json({
    ip,
    type,
    country: countryCode ? COUNTRY_CN[countryCode] || countryCode : '',
    countryCode,
    region: (cf.region as string) || (cf.regionCode as string) || '',
    city: (cf.city as string) || '',
    timezone: (cf.timezone as string) || '',
    isp: asOrg,
    org: asOrg,
    asn: asnNum ? `AS${asnNum}` : '',
    source: 'cloudflare-edge',
  });
}

// 跨域预检 / localhost 调试
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': '*',
    },
  });
}
