// 结构化二维码内容构建器（纯函数，无依赖、可单测）。
// 把表单字段拼成标准编码串，喂给现有 qrcode 渲染引擎。
// 参考 QR Studio 的数据类型，但用本站更专业的 pp-qr-code 渲染。

/** WiFi：按标准转义特殊字符（\;,": 必须用反斜杠转义）。 */
function escapeWifiValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/"/g, '\\"').replace(/:/g, '\\:');
}

export interface WifiInput {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export function buildWifi({ ssid, password, encryption, hidden }: WifiInput): string {
  const parts = [`T:${encryption}`, `S:${escapeWifiValue(ssid)}`];
  if (encryption !== 'nopass') {
    parts.push(`P:${escapeWifiValue(password)}`);
  }
  if (hidden) {
    parts.push('H:true');
  }
  return `WIFI:${parts.join(';')};;`;
}

/** vCard 3.0：转义反斜杠/逗号/分号/换行。 */
function escapeVcard(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export interface VcardInput {
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  phone: string;
  email: string;
  url: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export function buildVcard(i: VcardInput): string {
  const fullName = [i.lastName, i.firstName].filter(Boolean).join('') || i.email;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVcard(i.lastName)};${escapeVcard(i.firstName)};;;`,
    `FN:${escapeVcard(fullName)}`,
  ];
  if (i.org) lines.push(`ORG:${escapeVcard(i.org)}`);
  if (i.title) lines.push(`TITLE:${escapeVcard(i.title)}`);
  if (i.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(i.phone)}`);
  if (i.email) lines.push(`EMAIL:${escapeVcard(i.email)}`);
  if (i.url) lines.push(`URL:${escapeVcard(i.url)}`);
  const addr = [i.street, i.city, i.state, i.zip, i.country].map(escapeVcard).join(';');
  if (addr.replace(/;/g, '')) lines.push(`ADR;TYPE=WORK:;;${addr}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

export interface EmailInput {
  to: string;
  subject: string;
  body: string;
}

export function buildEmail({ to, subject, body }: EmailInput): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString();
  return `mailto:${to}${qs ? `?${qs}` : ''}`;
}

export interface SmsInput {
  to: string;
  body: string;
}

export function buildSms({ to, body }: SmsInput): string {
  return `SMSTO:${to}:${body}`;
}

export interface TelInput {
  number: string;
}

export function buildTel({ number }: TelInput): string {
  return `TEL:${number}`;
}

export interface GeoInput {
  lat: string;
  lon: string;
}

export function buildGeo({ lat, lon }: GeoInput): string {
  return `geo:${lat},${lon}`;
}

/** 时间戳(ms)或 ISO 串转为 iCal UTC 串 YYYYMMDDTHHMMSSZ；空返回 ''。 */
function toIcalUtc(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface CalendarInput {
  title: string;
  start: number | '';
  end: number | '';
  location: string;
  description: string;
}

export function buildCalendar(i: CalendarInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gjxtools//QR Calendar//CN',
    'BEGIN:VEVENT',
    `SUMMARY:${escapeVcard(i.title)}`,
  ];
  const dtStart = toIcalUtc(i.start);
  const dtEnd = toIcalUtc(i.end);
  if (dtStart) lines.push(`DTSTART:${dtStart}`);
  if (dtEnd) lines.push(`DTEND:${dtEnd}`);
  if (i.location) lines.push(`LOCATION:${escapeVcard(i.location)}`);
  if (i.description) lines.push(`DESCRIPTION:${escapeVcard(i.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\n');
}

export type GeneratorDataType = 'text' | 'url' | 'wifi' | 'vcard' | 'email' | 'sms' | 'tel' | 'geo' | 'event';

/** 结构化数据类型清单（含中文/英文标签由 i18n 提供，这里只给 key）。 */
export const DATA_TYPE_KEYS: GeneratorDataType[] = ['text', 'url', 'wifi', 'vcard', 'email', 'sms', 'tel', 'geo', 'event'];
