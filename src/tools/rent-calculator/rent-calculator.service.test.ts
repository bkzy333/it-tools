import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  buildCsvRows,
  buildJsonReport,
  buildTxtReport,
  comparePeriod,
  computeFees,
  createExampleState,
  currentPeriod,
  filterRecords,
  formatMoney,
  formatPeriod,
  formatTimestamp,
  latestRecordForRoom,
  loadState,
  migrateFromLegacy,
  parseNum,
  recordsForLocation,
  recordsForRoom,
  resolvePrices,
  round2,
  sanitizeState,
  saveState,
  shiftPeriod,
  PERIOD_RE,
  type RentState,
} from './rent-calculator.service';

/* ------------------------------------------------------------ 数值解析 */

describe('parseNum', () => {
  it('空/空白 → null', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum('   ')).toBeNull();
    expect(parseNum(null)).toBeNull();
    expect(parseNum(undefined)).toBeNull();
  });

  it('正常数字与 number 直通', () => {
    expect(parseNum('12.5')).toBe(12.5);
    expect(parseNum('-3')).toBe(-3);
    expect(parseNum(7)).toBe(7);
  });

  it('千分位逗号与内部空白', () => {
    expect(parseNum('1,200')).toBe(1200);
    expect(parseNum('1 200.50')).toBe(1200.5);
  });

  it('全角数字/句点（微信、Excel 复制来的）', () => {
    expect(parseNum('１２３')).toBe(123);
    expect(parseNum('１２．５')).toBe(12.5);
    expect(parseNum('１，２００')).toBe(1200);
  });

  it('脏值 → null 不炸', () => {
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('12元')).toBeNull();
    expect(parseNum(Number.NaN)).toBeNull();
  });
});

describe('round2 / formatMoney', () => {
  it('压掉浮点尘', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it('金额固定两位', () => {
    expect(formatMoney(1270.4)).toBe('1270.40');
    expect(formatMoney(0)).toBe('0.00');
  });
});

/* ------------------------------------------------------------ 费用计算 */

const fullInput = {
  rent: 1200,
  elecPrice: 0.6,
  waterPrice: 3.5,
  elecLast: 1024,
  elecNow: 1086,
  waterLast: 56,
  waterNow: 61,
  otherAmount: null,
};

describe('computeFees', () => {
  it('常规一期：电水费 + 总计', () => {
    const r = computeFees(fullInput);
    expect(r.elecDiff).toBe(62);
    expect(r.waterDiff).toBe(5);
    expect(r.elecFee).toBe(37.2); // 62 × 0.6
    expect(r.waterFee).toBe(17.5); // 5 × 3.5
    expect(r.totalFee).toBe(1254.7); // 房租 1200 + 37.2 + 17.5（无卫生费）
    expect(r.reversedElec).toBe(false);
    expect(r.reversedWater).toBe(false);
  });

  it('缺任一读数 → 对应费用与总计为 null', () => {
    const r = computeFees({ ...fullInput, waterNow: null });
    expect(r.elecFee).toBe(37.2);
    expect(r.waterFee).toBeNull();
    expect(r.totalFee).toBeNull();
  });

  it('缺单价 → 费用为 null', () => {
    const r = computeFees({ ...fullInput, elecPrice: null });
    expect(r.elecFee).toBeNull();
    expect(r.totalFee).toBeNull();
  });

  it('读数倒挂：照常计算 + 标记', () => {
    const r = computeFees({ ...fullInput, elecNow: 1000, waterNow: 50 });
    expect(r.reversedElec).toBe(true);
    expect(r.reversedWater).toBe(true);
    expect(r.elecFee).toBe(-14.4); // (1000-1024) × 0.6
    expect(r.waterFee).toBe(-21); // (50-56) × 3.5
    expect(r.totalFee).toBe(1164.6); // 1200-14.4-21
  });

  it('其他费用计入总计', () => {
    const r = computeFees({ ...fullInput, otherAmount: 50 });
    expect(r.totalFee).toBe(1304.7);
  });

  it('读数为 0 也是有效值（不是缺填）', () => {
    const r = computeFees({ ...fullInput, elecLast: 0 });
    expect(r.elecDiff).toBe(1086);
    expect(r.elecFee).toBe(651.6);
  });

  it('房租缺填按 0 计', () => {
    const r = computeFees({ ...fullInput, rent: null });
    expect(r.totalFee).toBe(54.7); // 37.2 + 17.5
  });
});

/* ------------------------------------------------------------ 单价继承 */

describe('resolvePrices', () => {
  const loc = { elecPrice: 0.6, waterPrice: 3.5 };

  it('房间全覆盖', () => {
    expect(resolvePrices({ elecPrice: 1, waterPrice: 4 }, loc)).toEqual({ elecPrice: 1, waterPrice: 4 });
  });

  it('房间不覆盖 → 继承位置', () => {
    expect(resolvePrices({}, loc)).toEqual({ elecPrice: 0.6, waterPrice: 3.5 });
  });

  it('只覆盖一个', () => {
    expect(resolvePrices({ elecPrice: 1 }, loc)).toEqual({ elecPrice: 1, waterPrice: 3.5 });
  });
});

/* ------------------------------------------------------------ 账期工具 */

describe('period helpers', () => {
  it('shiftPeriod 跨年', () => {
    expect(shiftPeriod('2026-10', 1)).toBe('2026-11');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2027-01', -1)).toBe('2026-12');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
  });

  it('formatPeriod / comparePeriod', () => {
    expect(formatPeriod('2026-10')).toBe('2026年10月');
    expect(comparePeriod('2026-10', '2026-09')).toBe(1);
    expect(comparePeriod('2026-10', '2026-10')).toBe(0);
    expect(PERIOD_RE.test('2026-10')).toBe(true);
    expect(PERIOD_RE.test('2026-13')).toBe(false);
    expect(PERIOD_RE.test('2026-1')).toBe(false);
  });

  it('currentPeriod 输出合法账期', () => {
    expect(PERIOD_RE.test(currentPeriod())).toBe(true);
  });
});

/* ------------------------------------------------------------ 状态清洗 */

const CURRENT_VERSION = 2;

describe('sanitizeState', () => {
  it('空/坏输入 → 空状态', () => {
    expect(sanitizeState(null)).toEqual({ version: CURRENT_VERSION, locations: [], rooms: [], records: [] });
    expect(sanitizeState('garbage')).toEqual({ version: CURRENT_VERSION, locations: [], rooms: [], records: [] });
    expect(sanitizeState({ locations: 'x', rooms: 5, records: null })).toEqual({
      version: CURRENT_VERSION,
      locations: [],
      rooms: [],
      records: [],
    });
  });

  it('清掉孤儿房间与孤儿记录', () => {
    const dirty = {
      locations: [{ id: 'l1', name: '幸福小区', elecPrice: 0.6, waterPrice: 3.5 }],
      rooms: [
        { id: 'r1', locationId: 'l1', name: '301', rent: 1200 },
        { id: 'r2', locationId: 'l-gone', name: '鬼房间', rent: 1 },
      ],
      records: [
        { id: 'rec1', roomId: 'r1', period: '2026-10', rent: 1, elecPrice: 1, waterPrice: 1, elecLast: 1, elecNow: 2, waterLast: 1, waterNow: 2, elecFee: 1, waterFee: 1, otherName: '', otherAmount: 0, totalFee: 4, createdAt: 'x' },
        { id: 'rec2', roomId: 'r-gone', period: '2026-10', rent: 1, elecPrice: 1, waterPrice: 1, elecLast: 1, elecNow: 2, waterLast: 1, waterNow: 2, elecFee: 1, waterFee: 1, otherName: '', otherAmount: 0, totalFee: 4, createdAt: 'x' },
      ],
    };
    const s = sanitizeState(dirty);
    expect(s.rooms.map((r) => r.id)).toEqual(['r1']);
    expect(s.records.map((r) => r.id)).toEqual(['rec1']);
  });

  it('同一位置下的同名房间合并，记录改挂到留下的那个', () => {
    const dirty = {
      locations: [{ id: 'l1', name: '幸福小区', elecPrice: 0.6, waterPrice: 3.5 }],
      rooms: [
        { id: 'r1', locationId: 'l1', name: '301', rent: 1200 },
        { id: 'r2', locationId: 'l1', name: '301', rent: 1300 },
        { id: 'r3', locationId: 'l1', name: '302', rent: 1500 },
      ],
      records: [
        { id: 'rec-dup', roomId: 'r2', period: '2026-10', rent: 1300, elecPrice: 1, waterPrice: 1, elecLast: 1, elecNow: 2, waterLast: 1, waterNow: 2, elecFee: 1, waterFee: 1, otherName: '', otherAmount: 0, totalFee: 1302, createdAt: 'x' },
      ],
    };
    const s = sanitizeState(dirty);
    expect(s.rooms.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(s.rooms[0].rent).toBe(1200); // 保留最先那条的配置
    expect(s.records[0].roomId).toBe('r1'); // 孤儿记录改挂，不是被删
  });

  it('不同位置允许同名房间', () => {
    const s = sanitizeState({
      locations: [
        { id: 'l1', name: 'A区', elecPrice: 0, waterPrice: 0 },
        { id: 'l2', name: 'B区', elecPrice: 0, waterPrice: 0 },
      ],
      rooms: [
        { id: 'r1', locationId: 'l1', name: '301', rent: 1 },
        { id: 'r2', locationId: 'l2', name: '301', rent: 1 },
      ],
    });
    expect(s.rooms).toHaveLength(2);
  });

  it('数字字段强制转 Number，非法账期回退当月', () => {
    const s = sanitizeState({
      locations: [{ id: 'l1', name: 'A', elecPrice: '0.6', waterPrice: '3.5' }],
      rooms: [{ id: 'r1', locationId: 'l1', name: '301', rent: '1200' }],
      records: [
        { id: 'rec1', roomId: 'r1', period: '2026-13', rent: 1, elecPrice: 1, waterPrice: 1, elecLast: 1, elecNow: 2, waterLast: 1, waterNow: 2, elecFee: 1, waterFee: 1, otherName: '', otherAmount: 0, totalFee: 4, createdAt: 'x' },
      ],
    });
    expect(s.locations[0].elecPrice).toBe(0.6);
    expect(s.rooms[0].rent).toBe(1200);
    expect(s.records[0].period).toMatch(PERIOD_RE);
  });

  it('保留预留的 parentId', () => {
    const s = sanitizeState({
      locations: [{ id: 'l1', name: '三屯', elecPrice: 0, waterPrice: 0, parentId: 'p1' }],
    });
    expect(s.locations[0].parentId).toBe('p1');
  });

  it('无名字的位置/房间被丢弃', () => {
    const s = sanitizeState({
      locations: [{ id: 'l1', name: '', elecPrice: 0, waterPrice: 0 }],
      rooms: [],
      records: [],
    });
    expect(s.locations).toHaveLength(0);
  });
});

/* ------------------------------------------------------------ 存取 */

describe('loadState / saveState', () => {
  const store = new Map<string, string>();
  const backup = (globalThis as Record<string, unknown>).localStorage;

  beforeAll(() => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterAll(() => {
    if (backup === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = backup;
    }
  });
  beforeEach(() => store.clear());

  it('无数据 → 空状态', () => {
    expect(loadState()).toEqual({ version: CURRENT_VERSION, locations: [], rooms: [], records: [] });
  });

  it('存取往返', () => {
    const state = createExampleState();
    saveState(state);
    expect(loadState()).toEqual(state);
  });

  it('坏 JSON → 空状态不炸', () => {
    store.set('rent-calculator-state', '{not json');
    expect(loadState().locations).toEqual([]);
  });

  it('v1 存档（含卫生费）→ 自动迁移：结构与历史记录留下，总费用按新口径重算', () => {
    store.set(
      'rent-calculator-state',
      JSON.stringify({
        version: 1,
        locations: [{ id: 'l1', name: '三屯', elecPrice: 0.6, waterPrice: 3.5 }],
        rooms: [{ id: 'r1', locationId: 'l1', name: '301', rent: 1000, sanitation: 30 }],
        records: [
          {
            id: 'rec1',
            roomId: 'r1',
            period: '2026-10',
            rent: 1000,
            sanitation: 30,
            elecPrice: 0.6,
            waterPrice: 3.5,
            elecLast: 980,
            elecNow: 1024,
            waterLast: 52,
            waterNow: 56,
            elecFee: 26.4,
            waterFee: 14,
            otherName: '',
            otherAmount: 0,
            totalFee: 1070.4, // 旧口径含 30 元卫生费
            createdAt: '2026-11-01T09:00:00.000Z',
          },
        ],
      }),
    );
    const s = loadState();
    expect(s.version).toBe(CURRENT_VERSION);
    expect(s.locations).toHaveLength(1);
    expect(s.rooms).toHaveLength(1);
    expect(s.records).toHaveLength(1);
    expect(s.rooms[0]).not.toHaveProperty('sanitation');
    expect(s.records[0]).not.toHaveProperty('sanitation');
    expect(s.records[0].elecFee).toBe(26.4); // 重算结果不变
    expect(s.records[0].totalFee).toBe(1040.4); // 1000 + 26.4 + 14，卫生费已被抹掉
  });

  it('v2 存档不再触发迁移（总价原样保留，哪怕手改过其他费用）', () => {
    const state = createExampleState();
    state.records[0]!.otherName = '卫生费';
    state.records[0]!.otherAmount = 30;
    state.records[0]!.totalFee = 1284.7; // 手改过，迁移不应把它拉回 1254.70
    saveState(state);
    expect(loadState().records.find((r) => r.id === state.records[0]!.id)?.totalFee).toBe(1284.7);
  });
});

/* ------------------------------------------------------------ 查询与衔接 */

function sampleState(): RentState {
  const base = createExampleState();
  return {
    ...base,
    rooms: [
      ...base.rooms,
      { id: 'room-2', locationId: 'loc-example-1', name: '3栋302', rent: 1500 },
    ],
    records: [
      ...base.records,
      {
        id: 'rec-2-2026-10',
        roomId: 'room-2',
        period: '2026-10',
        rent: 1500,
        elecPrice: 0.6,
        waterPrice: 3.5,
        elecLast: 100,
        elecNow: 150,
        waterLast: 10,
        waterNow: 12,
        elecFee: 30,
        waterFee: 7,
        otherName: '',
        otherAmount: 0,
        totalFee: 1537, // 1500 + 30 + 7
        createdAt: '2026-11-02T09:00:00.000Z',
      },
    ],
  };
}

describe('records 查询', () => {
  it('recordsForRoom 按账期倒序', () => {
    const recs = recordsForRoom(createExampleState().records, 'room-example-1');
    expect(recs.map((r) => r.period)).toEqual(['2026-10', '2026-09']);
  });

  it('latestRecordForRoom 取最新一期（衔接读数的数据源）', () => {
    const latest = latestRecordForRoom(createExampleState().records, 'room-example-1');
    expect(latest?.elecNow).toBe(1086);
    expect(latest?.waterNow).toBe(61);
  });

  it('recordsForLocation 跨房间', () => {
    expect(recordsForLocation(sampleState(), 'loc-example-1')).toHaveLength(3);
    expect(recordsForLocation(sampleState(), 'nope')).toHaveLength(0);
  });

  it('filterRecords 三档范围', () => {
    const s = sampleState();
    expect(filterRecords(s, 'room', 'room-example-1')).toHaveLength(2);
    expect(filterRecords(s, 'location', 'loc-example-1')).toHaveLength(3);
    expect(filterRecords(s, 'all', null)).toHaveLength(3);
  });

  it('空房间 → null', () => {
    expect(latestRecordForRoom([], 'x')).toBeNull();
  });
});

/* ------------------------------------------------------------ v1 → v2 迁移 */

describe('migrateFromLegacy（删卫生费）', () => {
  it('总费用按「房租 + 电费 + 水费 + 其他」重算，电水费数值不变', () => {
    const legacy: RentState = {
      version: 2, // 类型上已是新结构，这里手工造一条「总价里还含卫生费」的脏数据
      locations: [{ id: 'l1', name: '三屯', elecPrice: 0.6, waterPrice: 3.5 }],
      rooms: [{ id: 'r1', locationId: 'l1', name: '301', rent: 1200 }],
      records: [
        {
          id: 'rec1',
          roomId: 'r1',
          period: '2026-10',
          rent: 1200,
          elecPrice: 0.6,
          waterPrice: 3.5,
          elecLast: 1024,
          elecNow: 1086,
          waterLast: 56,
          waterNow: 61,
          elecFee: 37.2,
          waterFee: 17.5,
          otherName: '',
          otherAmount: 0,
          totalFee: 1284.7, // 旧口径：多了 30 元卫生费
          createdAt: '2026-11-01T09:00:00.000Z',
        },
      ],
    };
    const [rec] = migrateFromLegacy(legacy).records;
    expect(rec.elecFee).toBe(37.2);
    expect(rec.waterFee).toBe(17.5);
    expect(rec.totalFee).toBe(1254.7);
    // 明细加得回总计：这是迁移唯一的目的
    expect(rec.rent + rec.elecFee + rec.waterFee + rec.otherAmount).toBe(rec.totalFee);
  });

  it('其他费用照算，不被抹掉', () => {
    const state = createExampleState();
    state.records[0]!.otherName = '网费';
    state.records[0]!.otherAmount = 50;
    const [rec] = migrateFromLegacy(state).records.filter((r) => r.otherAmount === 50);
    expect(rec.rent + rec.elecFee + rec.waterFee + 50).toBe(rec.totalFee);
  });
});

/* ------------------------------------------------------------ 明细查询 */

describe('明细查询', () => {
  it('详情行能解析出位置名与房间名（记录只存 roomId）', () => {
    const s = sampleState();
    const roomById = new Map(s.rooms.map((r) => [r.id, r]));
    const rec = s.records.find((r) => r.roomId === 'room-2')!;
    const room = roomById.get(rec.roomId)!;
    expect(room.name).toBe('3栋302');
    expect(room.locationId).toBe('loc-example-1');
  });

  it('全量明细按账期倒序，跨房间铺平', () => {
    const all = filterRecords(sampleState(), 'all', null);
    expect(all).toHaveLength(3);
    expect(all.map((r) => r.period)).toEqual(['2026-10', '2026-10', '2026-09']);
    // 两条 2026-10 分属不同房间
    expect(new Set(all.filter((r) => r.period === '2026-10').map((r) => r.roomId)).size).toBe(2);
  });
});

/* ------------------------------------------------------------ 导出构建 */

describe('导出构建', () => {
  const state = createExampleState();
  const records = filterRecords(state, 'all', null);

  it('buildCsvRows：表头与页面明细同序，数值按快照取源', () => {
    const rows = buildCsvRows(records, state);
    expect(rows).toHaveLength(3); // 表头 + 2 条
    expect(rows[0].slice(0, 12)).toEqual([
      '账期', '位置', '房间', '房租', '上次电表', '现在电表', '上次水表', '现在水表', '电费', '水费', '其他费用', '总费用',
    ]);
    expect(rows[0]).not.toContain('卫生费');
    expect(rows[1][0]).toBe('2026-10');
    expect(rows[1][1]).toBe('幸福小区');
    expect(rows[1][2]).toBe('3栋301');
    expect(rows[1][3]).toBe('1200.00'); // 房租
    expect(rows[1][4]).toBe('1024.00'); // 上次电表
    expect(rows[1][5]).toBe('1086.00'); // 现在电表
    expect(rows[1][8]).toBe('37.20'); // 电费
    expect(rows[1][9]).toBe('17.50'); // 水费
    expect(rows[1][11]).toBe('1254.70'); // 总费用
  });

  it('buildTxtReport：人读行文', () => {
    const txt = buildTxtReport(records, state, '当前位置「幸福小区」');
    expect(txt).toContain('房租水电费记录');
    expect(txt).toContain('导出范围：当前位置「幸福小区」');
    expect(txt).toContain('[2026年10月] 幸福小区 / 3栋301');
    expect(txt).not.toContain('卫生费');
    expect(txt).toContain('电表读数: 1024.00 → 1086.00');
    expect(txt).toContain('电费: (1086.00 - 1024.00) × 0.60 = 37.20');
    expect(txt).toContain('总费用: 1200.00 + 37.20 + 17.50 + 0.00 = 1254.70');
    expect(txt).toContain('其他费用: 无');
  });

  it('buildJsonReport：可解析回刮', () => {
    const json = buildJsonReport(records, state, '全部');
    const parsed = JSON.parse(json);
    expect(parsed.tool).toBe('房租水电计算器');
    expect(parsed.count).toBe(2);
    expect(parsed.records[0].locationName).toBe('幸福小区');
    expect(parsed.records[0].roomName).toBe('3栋301');
    expect(parsed.records[0].totalFee).toBe(1254.7);
  });

  it('formatTimestamp：本地可读格式', () => {
    const expected = (() => {
      const d = new Date('2026-10-01T09:00:00.000Z');
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    })();
    expect(formatTimestamp('2026-10-01T09:00:00.000Z')).toBe(expected);
    expect(formatTimestamp('garbage')).toBe('garbage');
  });
});

/* ------------------------------------------------------------ 示例数据 */

describe('createExampleState', () => {
  it('结构：1 位置 1 房间 2 期', () => {
    const s = createExampleState();
    expect(s.locations).toHaveLength(1);
    expect(s.locations[0].name).toBe('幸福小区');
    expect(s.rooms).toHaveLength(1);
    expect(s.rooms[0].name).toBe('3栋301');
    expect(s.records).toHaveLength(2);
  });

  it('两期账期连续，读数首尾相接（衔接链成立）', () => {
    const [sep, oct] = createExampleState().records;
    expect([sep.period, oct.period]).toEqual(['2026-09', '2026-10']);
    expect(oct.elecLast).toBe(sep.elecNow);
    expect(oct.waterLast).toBe(sep.waterNow);
  });

  it('快照费用与 computeFees 实算一致（示例不手编）', () => {
    for (const rec of createExampleState().records) {
      const fee = computeFees({
        rent: rec.rent,
        elecPrice: rec.elecPrice,
        waterPrice: rec.waterPrice,
        elecLast: rec.elecLast,
        elecNow: rec.elecNow,
        waterLast: rec.waterLast,
        waterNow: rec.waterNow,
        otherAmount: rec.otherAmount,
      });
      expect(rec.elecFee).toBe(fee.elecFee);
      expect(rec.waterFee).toBe(fee.waterFee);
      expect(rec.totalFee).toBe(fee.totalFee);
    }
  });

  it('总价数值（SEO 正文引用的就是这两个数）', () => {
    const [sep, oct] = createExampleState().records;
    expect(sep.totalFee).toBe(1240.4);
    expect(oct.totalFee).toBe(1254.7);
  });

  it('示例里没有卫生费字段', () => {
    const s = createExampleState();
    expect(s.rooms[0]).not.toHaveProperty('sanitation');
    expect(s.records[0]).not.toHaveProperty('sanitation');
  });

  it('sanitize 后示例仍完整（存取链路）', () => {
    const s = sanitizeState(JSON.parse(JSON.stringify(createExampleState())));
    expect(s.records).toHaveLength(2);
  });
});
