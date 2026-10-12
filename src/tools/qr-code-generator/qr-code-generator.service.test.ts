import { describe, expect, it } from 'vitest';
import {
  buildCalendar,
  buildEmail,
  buildGeo,
  buildSms,
  buildTel,
  buildVcard,
  buildWifi,
} from './qr-code-generator.service';

describe('buildWifi', () => {
  it('WPA 带密码与逃逸', () => {
    expect(buildWifi({ ssid: 'My;Net', password: 'p;a\\s"s', encryption: 'WPA', hidden: false })).toBe(
      'WIFI:T:WPA;S:My\\;Net;P:p\\;a\\\\s\\"s;;',
    );
  });
  it('nopass 不带密码字段', () => {
    expect(buildWifi({ ssid: 'open', password: 'x', encryption: 'nopass', hidden: true })).toBe(
      'WIFI:T:nopass;S:open;H:true;;',
    );
  });
});

describe('buildVcard', () => {
  it('生成 3.0 名片并转义', () => {
    const out = buildVcard({
      firstName: '三',
      lastName: '张',
      org: 'ACME,Inc',
      title: 'Engineer',
      phone: '13800000000',
      email: 'a@b.com',
      url: 'https://x.com',
      street: '街1号',
      city: '北京',
      state: '北京',
      zip: '100000',
      country: 'CN',
    });
    expect(out).toContain('BEGIN:VCARD');
    expect(out).toContain('VERSION:3.0');
    expect(out).toContain('FN:张三');
    expect(out).toContain('TEL;TYPE=CELL:13800000000');
    expect(out).toContain('ORG:ACME\\,Inc');
    expect(out).toContain('END:VCARD');
  });
});

describe('buildEmail', () => {
  it('mailto 带编码参数', () => {
    expect(buildEmail({ to: 'a@b.com', subject: 'hi', body: 'hello world' })).toBe(
      'mailto:a@b.com?subject=hi&body=hello+world',
    );
  });
  it('无主题无正文', () => {
    expect(buildEmail({ to: 'a@b.com', subject: '', body: '' })).toBe('mailto:a@b.com');
  });
});

describe('buildSms', () => {
  it('SMSTO 格式', () => {
    expect(buildSms({ to: '13800000000', body: 'hi' })).toBe('SMSTO:13800000000:hi');
  });
});

describe('buildTel', () => {
  it('TEL 格式', () => {
    expect(buildTel({ number: '+8613800000000' })).toBe('TEL:+8613800000000');
  });
});

describe('buildGeo', () => {
  it('geo 格式', () => {
    expect(buildGeo({ lat: '39.9042', lon: '116.4074' })).toBe('geo:39.9042,116.4074');
  });
});

describe('buildCalendar', () => {
  it('生成 iCal 事件并转 UTC（用时间戳保证确定性）', () => {
    const start = new Date('2026-10-12T13:30:00Z').getTime();
    const end = new Date('2026-10-12T14:30:00Z').getTime();
    const out = buildCalendar({
      title: '会议',
      start,
      end,
      location: 'Room 1',
      description: 'desc',
    });
    expect(out).toContain('BEGIN:VCALENDAR');
    expect(out).toContain('SUMMARY:会议');
    expect(out).toContain('DTSTART:20261012T133000Z');
    expect(out).toContain('DTEND:20261012T143000Z');
    expect(out).toContain('LOCATION:Room 1');
    expect(out).toContain('END:VCALENDAR');
  });
  it('空时间为缺失字段', () => {
    const out = buildCalendar({ title: 't', start: '', end: '', location: '', description: '' });
    expect(out).not.toContain('DTSTART');
    expect(out).toContain('SUMMARY:t');
  });
});
