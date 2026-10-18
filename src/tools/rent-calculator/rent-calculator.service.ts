/**
 * 房租水电计算器 —— 纯逻辑层。
 *
 * 行为规格来自用户提供的雏形（`repo/server.js` + `index.html` + `index.js`，
 * Express + lowdb + ExcelJS 的个人记账小站），按本站现实做了两处架构改写：
 *
 * 1. **存储从服务端 db.json 改为浏览器 localStorage** —— 本站是 100% 静态站
 *    （Cloudflare Pages，无服务器无数据库），所有工具都是「数据不出浏览器」。
 *    localStorage 模式抄 `bmi-calculator.service.ts`（HISTORY_KEY + SSR 守卫）。
 * 2. **导出从服务端 ExcelJS 改为客户端零依赖 xlsx 写出器** —— 用共享模块
 *    `xlsx-writer/xlsx-export.ts` 的 gridToXlsx，不引 SheetJS（见该文件头部注释：
 *    npm 版有 CVE、本地未安装、全站无工具使用）。
 *
 * 保留的雏形核心行为（别改回直觉）：
 * - 电费 = (现在电表 − 上次电表) × 电费单价；水费同理；总费用 = 房租 + 电费 + 水费（+ 其他费用）
 * - 切换房间时，把该房间**最近一期**的「现在读数」自动填进本期「上次读数」
 * - 雏形的 locationData 预设（三屯 1000/100、汀山 3000/300）不内置 —— 首次打开为空，
 *   示例数据走一键示例（幸福小区），见 createExampleState
 *
 * 数据结构（两级：位置 → 房间，记录挂房间）：
 * - 位置（RentLocation）：名字 + 默认电/水单价。单价在页面顶部的「配置」区统一设置，
 *   房间不必再逐个填。**名字建好之后不允许改**（2026-10-18 用户要求）：改名会牵动
 *   导出文件、历史对账里的叫法，与其做一套「改一半」的校验，不如删掉重建。
 * - 房间（RentRoom）：名字/昵称 + 房租 + 可选的单价覆盖（不填继承位置默认）。
 *   房租在新增房间时先录一次（比水电表读数稳定得多），之后每期保存账单时会同步回来，
 *   下次切到这个房间就不用再填。
 * - 记录（RentRecord）：一期账单的快照 —— 房租/单价/读数/费用全部定格，
 *   改默认值不会污染历史。
 * - 删除是级联的：删位置带走它的房间和记录，删房间带走它的记录（removeLocation /
 *   removeRoom）。孤儿数据不留在存档里，跟 sanitizeState 的清洗口径保持一致。
 *
 * ── 版本迁移（version 1 → 2，2026-10-18 用户要求）──
 * v1 的房间和记录各带一个「卫生费」字段，现已被删掉：用户说卫生费可以用「其他费用」
 * （带名称）替代，页面也不该有第二个说不清的杂费入口。
 * 迁移策略：**结构照留，只抹掉卫生费并重算总费用**。老 localStorage 数据被读到时
 * （loadState 发现 version < CURRENT_VERSION）：位置/房间全保留，同一位置下的同名房间
 * 合并（保留最先那条，孤儿记录改挂到它名下），每条记录的 elecFee/waterFee/totalFee
 * 用快照里的读数与单价重算一遍 — 老总费用里含卫生费，不重算就会出现「明细加不出总计」。
 */

/* ------------------------------------------------------------------ 数据模型 */

export interface RentLocation {
  id: string;
  /** 位置名：可大可小，一个小区或一栋楼都行，如「幸福小区」「三屯」 */
  name: string;
  /** 默认电费单价（元/度），房间可覆盖 */
  elecPrice: number;
  /** 默认水费单价（元/吨），房间可覆盖 */
  waterPrice: number;
  /** 预留：将来升级三级「地方」层级用，当前恒为 undefined */
  parentId?: string;
}

export interface RentRoom {
  id: string;
  locationId: string;
  /** 房间名/昵称，如「3栋301」「老张家」 */
  name: string;
  /** 月房租。杂费统一记在「其他费用」，不再单列卫生费 */
  rent: number;
  /** 电费单价覆盖；undefined = 继承位置默认 */
  elecPrice?: number;
  /** 水费单价覆盖；undefined = 继承位置默认 */
  waterPrice?: number;
}

export interface RentRecord {
  id: string;
  roomId: string;
  /** 账期 YYYY-MM */
  period: string;
  /* ---- 以下均为保存当期的快照 ---- */
  rent: number;
  elecPrice: number;
  waterPrice: number;
  elecLast: number;
  elecNow: number;
  waterLast: number;
  waterNow: number;
  elecFee: number;
  waterFee: number;
  /** 其他费用名称，空串 = 没有 */
  otherName: string;
  otherAmount: number;
  totalFee: number;
  /** ISO 时间戳 */
  createdAt: string;
}

export interface RentState {
  version: typeof CURRENT_VERSION;
  locations: RentLocation[];
  rooms: RentRoom[];
  records: RentRecord[];
}

/**
 * 当前数据版本。老存档（v1）被读到时走一次迁移：删卫生费 + 重算总费用。
 * 新数据一律写 2。改数据结构的同志：升版本的同时必须在 loadState 里补迁移分支。
 */
export const CURRENT_VERSION = 2;

export type ExportScope = 'room' | 'location' | 'all';

/* ------------------------------------------------------------------ 常量 */

/** localStorage key。SSR/无 localStorage 环境loadState 返回空状态。 */
export const STORAGE_KEY = 'rent-calculator-state';

/** 账期格式：YYYY-MM，月份 01~12 */
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/* ------------------------------------------------------------------ 基础数值 */

/** 四舍五入到 2 位小数（加 EPSILON 压 0.1+0.2 类的浮点尘）。 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 金额展示：固定 2 位小数。 */
export function formatMoney(n: number): string {
  return n.toFixed(2);
}

/**
 * 容错解析数字输入（U5 精神：输入永远是脏的）。
 * 支持：空 → null；全角数字/句点/逗号；千分位逗号；首尾空白。
 * 解析不出返回 null（调用方按「没填」处理，不炸）。
 */
export function parseNum(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  // 全角 → 半角（微信/Excel 复制过来的常见形态）
  const halfWidth = input
    .replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\uff0e/g, '.') // 。
    .replace(/\uff0c/g, ''); // ，当千分位
  const cleaned = halfWidth.replace(/[,\s\u00a0]/g, '');
  if (cleaned === '') {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ 费用计算 */

export interface FeeInput {
  rent: number | null;
  elecPrice: number | null;
  waterPrice: number | null;
  elecLast: number | null;
  elecNow: number | null;
  waterLast: number | null;
  waterNow: number | null;
  otherAmount: number | null;
}

export interface FeeResult {
  elecDiff: number | null;
  waterDiff: number | null;
  elecFee: number | null;
  waterFee: number | null;
  /** 电水费都算出来才有总计；缺读数时为 null（避免「忘了填水表却显示一个偏低的总价」） */
  totalFee: number | null;
  /** 现在读数 < 上次读数（抄错/换表），照常计算但提示 */
  reversedElec: boolean;
  reversedWater: boolean;
}

/**
 * 一期账单的费用计算。
 *
 * 规则（与雏形一致 + 边界处理）：
 * - 四个读数有任缺 → 对应费用为 null（该行留空，不算）
 * - 倒挂（now < last）→ reversed 标记置位，费用照算（负数）
 * - 房租/其他费用缺填按 0 计
 * - 总费用只在电/水费都可算时非 null
 *
 * ⚠ 2026-10-18：卫生费已从模型里删掉（改走带名称的「其他费用」），
 *   总费用 = 房租 + 电费 + 水费 + 其他费用。老记录的迁移见 CURRENT_VERSION 注释。
 */
export function computeFees(input: FeeInput): FeeResult {
  const elecDiff = sub(input.elecNow, input.elecLast);
  const waterDiff = sub(input.waterNow, input.waterLast);

  const elecFee = elecDiff !== null && input.elecPrice !== null ? round2(elecDiff * input.elecPrice) : null;
  const waterFee = waterDiff !== null && input.waterPrice !== null ? round2(waterDiff * input.waterPrice) : null;

  const rent = input.rent ?? 0;
  const other = input.otherAmount ?? 0;

  const complete = elecFee !== null && waterFee !== null;
  const totalFee = complete ? round2(rent + elecFee + waterFee + other) : null;

  return {
    elecDiff,
    waterDiff,
    elecFee,
    waterFee,
    totalFee,
    reversedElec: elecDiff !== null && elecDiff < 0,
    reversedWater: waterDiff !== null && waterDiff < 0,
  };
}

function sub(a: number | null, b: number | null): number | null {
  if (a === null || b === null) {
    return null;
  }
  return a - b;
}

/* ------------------------------------------------------------------ 单价继承 */

/**
 * 房间的生效单价：房间覆盖优先，否则继承位置默认。
 * 这是「位置级设一次、房间可单独覆盖」规则的唯一实现处。
 */
export function resolvePrices(
  room: Pick<RentRoom, 'elecPrice' | 'waterPrice'>,
  location: Pick<RentLocation, 'elecPrice' | 'waterPrice'>,
): { elecPrice: number; waterPrice: number } {
  return {
    elecPrice: room.elecPrice ?? location.elecPrice,
    waterPrice: room.waterPrice ?? location.waterPrice,
  };
}

/* ------------------------------------------------------------------ 账期工具 */

/** 当前账期（本地时间 YYYY-MM）。 */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 账期偏移（月）。跨年安全：2026-12 + 1 = 2027-01。 */
export function shiftPeriod(period: string, months: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) {
    return period;
  }
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const y = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${y}-${String(mm).padStart(2, '0')}`;
}

/** 展示用账期：2026-10 → 2026年10月 */
export function formatPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${m[1]}年${Number(m[2])}月` : period;
}

/** 账期比较：零填充 YYYY-MM 可直接字典序。 */
export function comparePeriod(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ------------------------------------------------------------------ 存取 */

export function emptyState(): RentState {
  return { version: CURRENT_VERSION, locations: [], rooms: [], records: [] };
}

/** 生成记录/房间/位置 id。 */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 读取状态。SSR / 无 localStorage / JSON 损坏 / 结构不对都返回空状态，
 * 绝不让页面白屏 —— 这是「数据全在本地」工具的底线。
 *
 * 读到 version < CURRENT_VERSION 的存档时跑一次迁移（见 CURRENT_VERSION 注释）。
 */
export function loadState(): RentState {
  if (typeof localStorage === 'undefined') {
    return emptyState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed: unknown = JSON.parse(raw);
    const legacy = Number((parsed as { version?: unknown } | null)?.version ?? 1) < CURRENT_VERSION;
    const clean = sanitizeState(parsed);
    return legacy ? migrateFromLegacy(clean) : clean;
  } catch {
    return emptyState();
  }
}

/** 写入状态。配额满等异常静默忽略（与 bmi-calculator 一致）。 */
export function saveState(state: RentState): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * 结构清洗：本地数据可能被手改坏/写一半，加载时统一纠正：
 * - 字段缺失补默认值，数字强制转 Number
 * - 位置被删后的孤儿房间、房间被删后的孤儿记录直接清掉
 * - 同一位置下的同名房间合并到最先那条（其余房间的记录改挂过来），避免列表里出现两个 301
 */
export function sanitizeState(raw: unknown): RentState {
  const obj = (raw ?? {}) as Partial<RentState>;
  const locations = Array.isArray(obj.locations) ? obj.locations : [];
  const rooms = Array.isArray(obj.rooms) ? obj.rooms : [];
  const records = Array.isArray(obj.records) ? obj.records : [];

  const cleanLocations: RentLocation[] = locations
    .filter((l): l is RentLocation => !!l && typeof l === 'object')
    .map((l) => ({
      id: String(l.id ?? uid()),
      name: String(l.name ?? ''),
      elecPrice: toFinite(l.elecPrice),
      waterPrice: toFinite(l.waterPrice),
      ...(l.parentId ? { parentId: String(l.parentId) } : {}),
    }))
    .filter((l) => l.name !== '');

  const locationIds = new Set(cleanLocations.map((l) => l.id));
  const rawRooms: RentRoom[] = rooms
    .filter((r): r is RentRoom => !!r && typeof r === 'object' && locationIds.has(String(r.locationId)))
    .map((r) => ({
      id: String(r.id ?? uid()),
      locationId: String(r.locationId),
      name: String(r.name ?? ''),
      rent: toFinite(r.rent),
      ...(r.elecPrice !== undefined && r.elecPrice !== null ? { elecPrice: toFinite(r.elecPrice) } : {}),
      ...(r.waterPrice !== undefined && r.waterPrice !== null ? { waterPrice: toFinite(r.waterPrice) } : {}),
    }))
    .filter((r) => r.name !== '');

  // 同名房间合并：房间名只在一个位置内有意义，所以按「位置 + 名字」判重
  const dedupedRooms: RentRoom[] = [];
  const roomIdRemap = new Map<string, string>();
  const seenRoom = new Set<string>();
  for (const room of rawRooms) {
    const key = `${room.locationId}\u0000${room.name}`;
    if (seenRoom.has(key)) {
      roomIdRemap.set(room.id, dedupedRooms.find((r) => r.locationId === room.locationId && r.name === room.name)!.id);
      continue;
    }
    seenRoom.add(key);
    dedupedRooms.push(room);
  }

  const roomIds = new Set(dedupedRooms.map((r) => r.id));
  const cleanRecords: RentRecord[] = records
    .map((rec) => (rec && typeof rec === 'object' ? { ...rec, roomId: roomIdRemap.get(String(rec.roomId)) ?? String(rec.roomId) } : rec))
    .filter((rec): rec is RentRecord => !!rec && typeof rec === 'object' && roomIds.has(String(rec.roomId)))
    .map((rec) => ({
      id: String(rec.id ?? uid()),
      roomId: String(rec.roomId),
      period: PERIOD_RE.test(String(rec.period)) ? String(rec.period) : currentPeriod(),
      rent: toFinite(rec.rent),
      elecPrice: toFinite(rec.elecPrice),
      waterPrice: toFinite(rec.waterPrice),
      elecLast: toFinite(rec.elecLast),
      elecNow: toFinite(rec.elecNow),
      waterLast: toFinite(rec.waterLast),
      waterNow: toFinite(rec.waterNow),
      elecFee: toFinite(rec.elecFee),
      waterFee: toFinite(rec.waterFee),
      otherName: String(rec.otherName ?? ''),
      otherAmount: toFinite(rec.otherAmount),
      totalFee: toFinite(rec.totalFee),
      createdAt: String(rec.createdAt ?? new Date().toISOString()),
    }));

  return { version: CURRENT_VERSION, locations: cleanLocations, rooms: dedupedRooms, records: cleanRecords };
}

/**
 * v1 存档迁移：卫生费被删掉了，站在 v2 口径上重算每条记录的电/水费与总费用。
 *
 * 为什么敢直接重算而不是「总费用里减掉卫生费」：记录里存的是当期的读数与单价快照，
 * 用它们重算出来的电/水费和原来一模一样（同一套 round2），只是总价里少了卫生费那一截。
 * 不重算的话，明细表会出现「房租 + 电费 + 水费 + 其他 ≠ 总费用」的自相矛盾行。
 */
export function migrateFromLegacy(state: RentState): RentState {
  return {
    ...state,
    version: CURRENT_VERSION,
    records: state.records.map((rec) => {
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
      return {
        ...rec,
        elecFee: fee.elecFee ?? rec.elecFee,
        waterFee: fee.waterFee ?? rec.waterFee,
        totalFee: fee.totalFee ?? rec.totalFee,
      };
    }),
  };
}

function toFinite(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ 查询 */

/** 某房间的全部记录，按账期倒序（同账期按写入时间倒序）。 */
export function recordsForRoom(records: RentRecord[], roomId: string): RentRecord[] {
  return records
    .filter((r) => r.roomId === roomId)
    .sort((a, b) => comparePeriod(b.period, a.period) || (a.createdAt < b.createdAt ? 1 : -1));
}

/** 某位置的全部记录（经其房间），按账期倒序。 */
export function recordsForLocation(state: RentState, locationId: string): RentRecord[] {
  const roomIds = new Set(state.rooms.filter((r) => r.locationId === locationId).map((r) => r.id));
  return state.records
    .filter((r) => roomIds.has(r.roomId))
    .sort((a, b) => comparePeriod(b.period, a.period) || (a.createdAt < b.createdAt ? 1 : -1));
}

/** 房间最近一期记录（自动衔接读数的数据源）。 */
export function latestRecordForRoom(records: RentRecord[], roomId: string): RentRecord | null {
  return recordsForRoom(records, roomId)[0] ?? null;
}

/** 某位置下的记录条数（删除位置的确认文案要用，页面不自己数）。 */
export function countRecordsForLocation(state: RentState, locationId: string): number {
  const roomIds = new Set(state.rooms.filter((r) => r.locationId === locationId).map((r) => r.id));
  return state.records.filter((r) => roomIds.has(r.roomId)).length;
}

/**
 * 删除位置：连带它下面的房间和这些房间的记录一起清掉。
 *
 * 返回新对象而不是原地改 —— 页面拿返回值替换 `state`，Vue 的响应式链路、
 * 以及「改坏了能不能回滚」都清楚。孤儿数据一律不留在存档里，
 * 否则 sanitizeState 下次加载时也会把它们当垃圾清掉（两处口径必须一致）。
 */
export function removeLocation(state: RentState, locationId: string): RentState {
  const roomIds = new Set(state.rooms.filter((r) => r.locationId === locationId).map((r) => r.id));
  return {
    ...state,
    locations: state.locations.filter((l) => l.id !== locationId),
    rooms: state.rooms.filter((r) => !roomIds.has(r.id)),
    records: state.records.filter((rec) => !roomIds.has(rec.roomId)),
  };
}

/** 删除房间：连带它的记录一起清掉。 */
export function removeRoom(state: RentState, roomId: string): RentState {
  return {
    ...state,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    records: state.records.filter((rec) => rec.roomId !== roomId),
  };
}

/** 导出范围过滤，结果按账期倒序。 */
export function filterRecords(state: RentState, scope: ExportScope, targetId: string | null): RentRecord[] {
  if (scope === 'room' && targetId) {
    return recordsForRoom(state.records, targetId);
  }
  if (scope === 'location' && targetId) {
    return recordsForLocation(state, targetId);
  }
  return [...state.records].sort(
    (a, b) => comparePeriod(b.period, a.period) || (a.createdAt < b.createdAt ? 1 : -1),
  );
}

/* ------------------------------------------------------------------ 导出构建 */

/**
 * CSV/XLSX 表头：前 12 列跟页面「记录明细」表逐列对齐（去掉末尾的删除按钮），
 * 后面补两列对账要用的单价和写入时间。
 * ⚠ 2026-10-18 重排过一次：卫生费删除、读数从「电费在前水费在后」改成
 * 「上次/现在」成对排列。列序动了要同步改 `media-datetime-generators.ts` 的说明。
 */
export const CSV_HEADER = [
  '账期',
  '位置',
  '房间',
  '房租',
  '上次电表',
  '现在电表',
  '上次水表',
  '现在水表',
  '电费',
  '水费',
  '其他费用',
  '总费用',
  '其他费用名称',
  '电费单价',
  '水费单价',
  '写入时间',
];

/** 记录 → CSV/XLSX 数据行（首行为表头；位置/房间名解析后嵌入，快照原样输出）。 */
export function buildCsvRows(records: RentRecord[], state: RentState): string[][] {
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const locById = new Map(state.locations.map((l) => [l.id, l]));
  const rows = records.map((rec) => {
    const room = roomById.get(rec.roomId);
    const loc = room ? locById.get(room.locationId) : undefined;
    return [
      rec.period,
      loc?.name ?? '',
      room?.name ?? '',
      formatMoney(rec.rent),
      formatMoney(rec.elecLast),
      formatMoney(rec.elecNow),
      formatMoney(rec.waterLast),
      formatMoney(rec.waterNow),
      formatMoney(rec.elecFee),
      formatMoney(rec.waterFee),
      rec.otherName ? formatMoney(rec.otherAmount) : '',
      formatMoney(rec.totalFee),
      rec.otherName,
      formatMoney(rec.elecPrice),
      formatMoney(rec.waterPrice),
      formatTimestamp(rec.createdAt),
    ];
  });
  return [CSV_HEADER, ...rows];
}

/** 人读的 TXT 报告（沿用雏形「费用明细」的行文）。 */
export function buildTxtReport(records: RentRecord[], state: RentState, scopeLabel: string): string {
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const locById = new Map(state.locations.map((l) => [l.id, l]));
  const lines: string[] = ['房租水电费记录', `导出范围：${scopeLabel}`, `记录数：${records.length}`, `导出时间：${formatTimestamp(new Date().toISOString())}`, ''];

  for (const rec of records) {
    const room = roomById.get(rec.roomId);
    const loc = room ? locById.get(room.locationId) : undefined;
    lines.push(`[${formatPeriod(rec.period)}] ${loc?.name ?? '?'} / ${room?.name ?? '?'}`);
    lines.push(`  房租费用: ${formatMoney(rec.rent)}`);
    lines.push(`  电表读数: ${formatMoney(rec.elecLast)} → ${formatMoney(rec.elecNow)}`);
    lines.push(`  水表读数: ${formatMoney(rec.waterLast)} → ${formatMoney(rec.waterNow)}`);
    lines.push(`  电费: (${formatMoney(rec.elecNow)} - ${formatMoney(rec.elecLast)}) × ${formatMoney(rec.elecPrice)} = ${formatMoney(rec.elecFee)}`);
    lines.push(`  水费: (${formatMoney(rec.waterNow)} - ${formatMoney(rec.waterLast)}) × ${formatMoney(rec.waterPrice)} = ${formatMoney(rec.waterFee)}`);
    lines.push(`  其他费用: ${rec.otherName ? `${rec.otherName} ${formatMoney(rec.otherAmount)}` : '无'}`);
    lines.push(
      `  总费用: ${formatMoney(rec.rent)} + ${formatMoney(rec.elecFee)} + ${formatMoney(rec.waterFee)} + ${formatMoney(rec.otherAmount)} = ${formatMoney(rec.totalFee)}`,
    );
    lines.push('');
  }
  return lines.join('\n');
}

/** 机器读的 JSON 报告（含工具标识，方便回刮）。 */
export function buildJsonReport(records: RentRecord[], state: RentState, scopeLabel: string): string {
  const roomById = new Map(state.rooms.map((r) => [r.id, r]));
  const locById = new Map(state.locations.map((l) => [l.id, l]));
  const payload = {
    tool: '房租水电计算器',
    url: 'https://gjxtools.com/rent-calculator/',
    scope: scopeLabel,
    generatedAt: new Date().toISOString(),
    count: records.length,
    records: records.map((rec) => {
      const room = roomById.get(rec.roomId);
      const loc = room ? locById.get(room.locationId) : undefined;
      return { ...rec, locationName: loc?.name ?? '', roomName: room?.name ?? '' };
    }),
  };
  return JSON.stringify(payload, null, 2);
}

/** ISO → 'YYYY-MM-DD HH:mm:ss'（本地时区，CSV/TXT 通用，避免 toLocaleString 的环境差异）。 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ------------------------------------------------------------------ 示例数据 */

/**
 * 一键示例的数据（首次打开**不**内置任何内容，用户点「一键示例」才载入）。
 *
 * 账期固定 2026-09 / 2026-10：测试要断言确定性，SEO 正文要引用确定性数字。
 * 数值都用 computeFees 实算，不手编 —— 示例与实现永远不会漂移。
 */
export function createExampleState(): RentState {
  const location: RentLocation = {
    id: 'loc-example-1',
    name: '幸福小区',
    elecPrice: 0.6,
    waterPrice: 3.5,
  };
  const room: RentRoom = {
    id: 'room-example-1',
    locationId: location.id,
    name: '3栋301',
    rent: 1200,
  };

  const makeRecord = (period: string, elecLast: number, elecNow: number, waterLast: number, waterNow: number, createdAt: string): RentRecord => {
    const fee = computeFees({
      rent: room.rent,
      elecPrice: location.elecPrice,
      waterPrice: location.waterPrice,
      elecLast,
      elecNow,
      waterLast,
      waterNow,
      otherAmount: null,
    });
    // computeFees 已保证读数齐全时 totalFee 非 null
    return {
      id: `rec-example-${period}`,
      roomId: room.id,
      period,
      rent: room.rent,
      elecPrice: location.elecPrice,
      waterPrice: location.waterPrice,
      elecLast,
      elecNow,
      waterLast,
      waterNow,
      elecFee: fee.elecFee ?? 0,
      waterFee: fee.waterFee ?? 0,
      otherName: '',
      otherAmount: 0,
      totalFee: fee.totalFee ?? 0,
      createdAt,
    };
  };

  return {
    version: CURRENT_VERSION,
    locations: [location],
    rooms: [room],
    records: [
      makeRecord('2026-09', 980, 1024, 52, 56, '2026-10-01T09:00:00.000Z'),
      makeRecord('2026-10', 1024, 1086, 56, 61, '2026-11-01T09:00:00.000Z'),
    ],
  };
}
