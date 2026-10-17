import { describe, expect, it } from 'vitest';
import { computeCheckCode, parseIdCard, upgrade15To18 } from './id-card';

/** 用前 17 位补出校验位正确的 18 位号码，避免用例里硬编码校验位写错 */
const mk = (first17: string) => `${first17}${computeCheckCode(first17)}`;

describe('computeCheckCode', () => {
  it('GB 11643 加权算法：已知号码的校验位', () => {
    expect(computeCheckCode('44030419900307821')).toBe('2');
    expect(computeCheckCode('11010519491231002')).toBe('X');
  });
});

describe('upgrade15To18', () => {
  it('补 19 世纪前缀并重算校验位', () => {
    const id18 = upgrade15To18('440304900307821');

    expect(id18).toHaveLength(18);
    expect(id18.slice(0, 6)).toBe('440304');
    expect(id18.slice(6, 14)).toBe('19900307');
    expect(id18[17]).toBe(computeCheckCode(id18.slice(0, 17)));
  });
});

describe('parseIdCard · 正常号码', () => {
  const info = parseIdCard('440304199003078212');

  it('校验通过并解析出全部字段', () => {
    expect(info.valid).toBe(true);
    expect(info.reason).toBe('');
    expect(info.normalized).toBe('440304199003078212');
    expect(info.region).toBe('广东省 深圳市');
    expect(info.birthday).toBe('1990-03-07');
    expect(info.gender).toBe('男');
    expect(info.zodiac).toBe('马');
    expect(info.constellation).toBe('双鱼座');
  });

  it('年龄：用元旦生日保证任何一天跑都稳定', () => {
    const fixed = parseIdCard(mk('44030419900101001'));

    expect(fixed.age).toBe(new Date().getFullYear() - 1990);
  });

  it('校验码 X 与大小写、首尾空格都能处理', () => {
    const id = mk('11010519491231002');

    expect(id.endsWith('X')).toBe(true);
    expect(parseIdCard(id).valid).toBe(true);
    expect(parseIdCard(id.toLowerCase()).valid).toBe(true);
    expect(parseIdCard(`  ${id}  `).valid).toBe(true);
  });

  it('15 位老号码会自动升级并标记', () => {
    const info15 = parseIdCard('440304900307821');

    expect(info15.wasOldFormat).toBe(true);
    expect(info15.normalized).toHaveLength(18);
    expect(info15.valid).toBe(true);
  });
});

describe('parseIdCard · 各类失败必须给出可读原因', () => {
  it('校验位不对：valid=false，但地区生日仍能解析', () => {
    const info = parseIdCard('440304199003078213');

    expect(info.valid).toBe(false);
    expect(info.expectedCheckCode).toBe('2');
    expect(info.reason).toContain('校验位');
    // 校验位错不代表号码结构坏，字段照样给出来（批量表格里这几列还要显示）
    expect(info.region).toBe('广东省 深圳市');
    expect(info.birthday).toBe('1990-03-07');
  });

  it('长度不对', () => {
    const info = parseIdCard('44030419900307');

    expect(info.normalized).toBe('');
    expect(info.reason).toContain('应为 18 位');
  });

  it('前 17 位必须数字，末位只能是数字或 X', () => {
    expect(parseIdCard('44030419900307821A').reason).toContain('最后一位');
  });

  it('出生日期非法（2 月 30 日）', () => {
    const info = parseIdCard(mk('44030419900230001'));

    expect(info.normalized).not.toBe('');
    expect(info.reason).toContain('不是合法日期');
  });

  it('出生日期不在合理范围（1900 之前 / 未来）', () => {
    expect(parseIdCard(mk('44030418990101001')).reason).toContain('合理范围');
    expect(parseIdCard(mk('44030420990101001')).reason).toContain('合理范围');
  });

  it('行政区划码没收录时给出占位而不是崩掉', () => {
    expect(parseIdCard(mk('99010119900101001')).region).toContain('未知地区');
  });

  it('空输入', () => {
    expect(parseIdCard('   ').reason).toContain('请输入');
  });
});
