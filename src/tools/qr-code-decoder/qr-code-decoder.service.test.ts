import { describe, expect, test } from 'vitest';
import { translate as t } from '@/plugins/i18n.plugin';
import { parseQRData } from './qr-code-decoder.service';

// parseQRData 返回的是已经过 i18n 的文案（service 层直接 t() 包装）。
// 测试在这里仍走同一个 translate 取期望值：中文站断言中文、英文站断言英文，
// 不会再把「返回什么语言」误判成解析逻辑的 bug。
const TEXT_KEY = 'tools.qr-code-decoder.service.text';

describe('qr-code-decoder', () => {
  test('parseQRData should parse content correctly', () => {
    expect(parseQRData(null)).toEqual({
      type: t(`${TEXT_KEY}.unknown`),
      value: '',
    });
    expect(parseQRData('')).toEqual({
      type: t(`${TEXT_KEY}.unknown`),
      value: '',
    });
    expect(parseQRData('TEL:+33123456')).toEqual({
      type: t(`${TEXT_KEY}.phone`),
      value: '+33123456',
    });
    expect(parseQRData('MATMSG:TO: email@example.com;SUB:email subject;BODY:Email text;;')).toEqual({
      type: t(`${TEXT_KEY}.email`),
      value: {
        body: 'Email text',
        subject: 'email subject',
        to: 'email@example.com',
      },
    });
    expect(parseQRData('mailto:email@example.com?subject=email subject&body=Email text')).toEqual({
      type: t(`${TEXT_KEY}.email`),
      value: {
        body: 'Email text',
        subject: 'email subject',
        to: 'email@example.com',
      },
    });
    expect(parseQRData('SMTP:email@example.com:email subject:Email text')).toEqual({
      type: t(`${TEXT_KEY}.email-1`),
      value: {
        body: 'Email text',
        subject: 'email subject',
        to: 'email@example.com',
      },
    });
    expect(parseQRData('smsto:+33315555:message')).toEqual({
      type: t(`${TEXT_KEY}.sms`),
      value: {
        message: 'message',
        to: '+33315555',
      },
    });
    expect(parseQRData('WIFI:T:nopass;S:ssid;H:true;')).toEqual({
      type: t(`${TEXT_KEY}.wifi`),
      value: {
        authentication: 'nopass',
        hidden: 'true',
        name: 'ssid',
        password: undefined,
      },
    });
    expect(parseQRData('WIFI:T:WPA;S:ssid;P:password;H:false;')).toEqual({
      type: t(`${TEXT_KEY}.wifi`),
      value: {
        authentication: 'WPA',
        hidden: 'false',
        name: 'ssid',
        password: 'password', // NOSONAR
      },
    });
    expect(
      parseQRData(
        'otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30',
      ),
    ).toEqual({
      type: t(`${TEXT_KEY}.otpauth`),
      value: {
        label: {
          account: 'john.doe@email.com',
          issuer: 'ACME Co',
          raw: 'ACME Co:john.doe@email.com',
        },
        params: {
          algorithm: 'SHA1',
          digits: '6',
          issuer: 'ACME Co',
          period: '30',
          secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
        },
        type: 'totp',
        uri: 'otpauth://totp/ACME%20Co:john.doe@email.com?secret=HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ&issuer=ACME%20Co&algorithm=SHA1&digits=6&period=30',
      },
    });
    expect(
      parseQRData(
        'otpauth-migration://offline?data=CigKFFVUVURPbmFMMXd1cDlBSVZHOUVjEgRUZXN0GgRUZXN0IAEoAjACCi8KCkhlbGxvId6tvu8SEGFsaWNlQGdvb2dsZS5jb20aB0V4YW1wbGUgASgBMAE4BxABGAEgAA%3D%3D',
      ),
    ).toEqual({
      type: t(`${TEXT_KEY}.otpmigration`),
      value: [
        {
          label: {
            account: 'Test',
            issuer: 'Test',
            raw: 'Test:Test',
          },
          params: {
            algorithm: 'SHA1',
            digits: '8',
            issuer: 'Test',
            secret: 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD',
          },
          type: 'totp',
          uri: 'otpauth://totp/Test%3ATest?issuer=Test&algorithm=SHA1&digits=8&secret=KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD',
        },
        {
          label: {
            account: 'alice@google.com',
            issuer: 'Example',
            raw: 'Example:alice@google.com',
          },
          params: {
            algorithm: 'SHA1',
            counter: '7',
            digits: '6',
            issuer: 'Example',
            secret: 'JBSWY3DPEHPK3PXP',
          },
          type: 'hotp',
          uri: 'otpauth://hotp/Example%3Aalice%40google.com?issuer=Example&algorithm=SHA1&digits=6&counter=7&secret=JBSWY3DPEHPK3PXP',
        },
      ],
    });
    expect(
      parseQRData(
        'BEGIN:VCALENDAR\nPRODID:-//xyz Corp//NONSGML PDA Calendar Version 1.0//EN\nVERSION:2.0\nBEGIN:VEVENT\nDTSTAMP:19960704T120000Z\nUID:uid1@example.com\nORGANIZER:mailto:jsmith@example.com\nDTSTART:19960918T143000Z\nDTEND:19960920T220000Z\nSTATUS:CONFIRMED\nCATEGORIES:CONFERENCE\nSUMMARY:Networld+Interop Conference\nDESCRIPTION:Networld+Interop Conference\n  and Exhibit\\nAtlanta World Congress Center\\n\n Atlanta\\, Georgia\nEND:VEVENT\nEND:VCALENDAR',
      ),
    ).toEqual({
      type: t(`${TEXT_KEY}.ical`),
      value: [
        'vcalendar',
        [
          ['prodid', {}, 'text', '-//xyz Corp//NONSGML PDA Calendar Version 1.0//EN'],
          ['version', {}, 'text', '2.0'],
        ],
        [
          [
            'vevent',
            [
              ['dtstamp', {}, 'date-time', '1996-07-04T12:00:00Z'],
              ['uid', {}, 'text', 'uid1@example.com'],
              ['organizer', {}, 'cal-address', 'mailto:jsmith@example.com'],
              ['dtstart', {}, 'date-time', '1996-09-18T14:30:00Z'],
              ['dtend', {}, 'date-time', '1996-09-20T22:00:00Z'],
              ['status', {}, 'text', 'CONFIRMED'],
              ['categories', {}, 'text', 'CONFERENCE'],
              ['summary', {}, 'text', 'Networld+Interop Conference'],
              [
                'description',
                {},
                'text',
                'Networld+Interop Conference and Exhibit\nAtlanta World Congress Center\nAtlanta, Georgia',
              ],
            ],
            [],
          ],
        ],
      ],
    });
  });
});
