<script setup lang="ts">
/**
 * 房租水电计算器。
 *
 * 行为规格来自用户提供的雏形（repo/server.js + index.html + index.js），架构按本站
 * 现实改写（服务端 lowdb → localStorage，服务端 ExcelJS → 客户端零依赖 xlsx），
 * 逐条决策见 rent-calculator.service.ts 头部注释与 2026-10-17 工作日志第七轮。
 *
 * 页面结构（三卡片，2026-10-18 按用户要求重排）：
 *   ① 配置     —— 页面最上方：位置（新增/改名/默认水电单价）+ 房间（新增/删除）
 *   ② 本期费用 —— 选中房间自动衔接上期读数 + 顺推账期，实时费用明细，保存本期记录
 *   ③ 记录明细 —— 取代原「月度汇总」：全部房间按账期倒序铺平一行一记录 + 房间筛选 +
 *                 四格式导出（范围三档）
 *
 * 2026-10-18 四处改动（用户原文）：
 *   1. 删掉「删除位置」「新增位置」那套分散的管理入口，位置改在配置区统一新增/编辑；
 *      删掉卫生费（它可以由带名称的「其他费用」代替）
 *   2. 页面最上方是配置区，专门配房间名和默认水电单价
 *   3. 月度汇总改成记录明细：账期/位置/房间/房租/电表水表读数（上次+现在）/电费/水费/
 *      其他费用/总费用
 *   4. 费用明细的三个结果框不再撑长：改用固定三列网格（标签｜金额｜算式），
 *      总费用的算式整行放到下方
 *
 * 与静态 HTML 同源红线：本页所有数字都来自 service 层纯函数，构建期不预计算任何
 * 费用值（页面打开时是空表单，没有可预计算的确定性结果）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ToolExampleButton from '@/components/ToolExampleButton.vue';
import InputCopyable from '@/components/InputCopyable.vue';
import CopyExportBar from '@/components/CopyExportBar.vue';
import { downloadBlobFile } from '@/composable/export';
import { gridToXlsx } from '../xlsx-writer/xlsx-export';
import {
  buildCsvRows,
  buildJsonReport,
  buildTxtReport,
  computeFees,
  createExampleState,
  currentPeriod,
  filterRecords,
  formatMoney,
  formatPeriod,
  latestRecordForRoom,
  loadState,
  PERIOD_RE,
  resolvePrices,
  saveState,
  shiftPeriod,
  type ExportScope,
  type RentLocation,
  type RentRecord,
  type RentRoom,
  type RentState,
} from './rent-calculator.service';

const { t } = useI18n();

/* ------------------------------------------------------------------ 全局状态 */

const state = ref<RentState>(loadState());

const selectedLocationId = ref<string | null>(null);
const selectedRoomId = ref<string | null>(null);

/**
 * 位置改名的草稿：输入框绑它，校验通过才写进 store。
 * 直接双向绑 currentLocation.name 的话，改一半（重名 / 清空）会被存进去还不报错。
 */
const locationNameDraft = ref('');

/** 本期账单表单 */
interface BillForm {
  period: string;
  rent: number | null;
  elecPrice: number | null;
  waterPrice: number | null;
  elecLast: number | null;
  elecNow: number | null;
  waterLast: number | null;
  waterNow: number | null;
  otherName: string;
  otherAmount: number | null;
}

function emptyBillForm(): BillForm {
  return {
    period: currentPeriod(),
    rent: null,
    elecPrice: null,
    waterPrice: null,
    elecLast: null,
    elecNow: null,
    waterLast: null,
    waterNow: null,
    otherName: '',
    otherAmount: null,
  };
}

const form = ref<BillForm>(emptyBillForm());

/* ------------------------------------------------------------------ 派生查询 */

const currentLocation = computed<RentLocation | null>(
  () => state.value.locations.find((l) => l.id === selectedLocationId.value) ?? null,
);

const locationRooms = computed<RentRoom[]>(() =>
  currentLocation.value ? state.value.rooms.filter((r) => r.locationId === currentLocation.value!.id) : [],
);

const currentRoom = computed<RentRoom | null>(
  () => locationRooms.value.find((r) => r.id === selectedRoomId.value) ?? null,
);

const fee = computed(() =>
  computeFees({
    rent: form.value.rent,
    elecPrice: form.value.elecPrice,
    waterPrice: form.value.waterPrice,
    elecLast: form.value.elecLast,
    elecNow: form.value.elecNow,
    waterLast: form.value.waterLast,
    waterNow: form.value.waterNow,
    otherAmount: form.value.otherAmount,
  }),
);

const roomRecords = computed<RentRecord[]>(() =>
  currentRoom.value ? state.value.records.filter((r) => r.roomId === currentRoom.value!.id) : [],
);

/* --------------------------------------------------------- 费用明细的算式展示 */

/** 读数/单价的紧凑展示：没填显示破折号，不假装是 0 */
function numOrDash(v: number | null): string {
  return v === null ? '—' : String(v);
}

/** 「(1086 − 1024) × 0.6 = 37.20」，结果算不出来时只给算式不给等号右边 */
const elecFormula = computed(() => {
  const left = `(${numOrDash(form.value.elecNow)} − ${numOrDash(form.value.elecLast)}) × ${numOrDash(form.value.elecPrice)}`;
  return fee.value.elecFee === null ? left : `${left} = ${formatMoney(fee.value.elecFee)}`;
});

const waterFormula = computed(() => {
  const left = `(${numOrDash(form.value.waterNow)} − ${numOrDash(form.value.waterLast)}) × ${numOrDash(form.value.waterPrice)}`;
  return fee.value.waterFee === null ? left : `${left} = ${formatMoney(fee.value.waterFee)}`;
});

/**
 * 总费用算式 —— 单独占一整行放在三个结果框下方（用户明确要求），
 * 形如：总费用 = 房租 1200.00 + 电费 37.20 + 水费 17.50 + 网费 30.00 = 1284.70
 */
const totalFormula = computed(() => {
  if (fee.value.totalFee === null) {
    return '';
  }
  const parts: string[] = [
    `${t('tools.rent-calculator.texts.fee-rent')} ${formatMoney(form.value.rent ?? 0)}`,
    `${t('tools.rent-calculator.texts.fee-elec')} ${formatMoney(fee.value.elecFee ?? 0)}`,
    `${t('tools.rent-calculator.texts.fee-water')} ${formatMoney(fee.value.waterFee ?? 0)}`,
  ];
  if ((form.value.otherAmount ?? 0) !== 0) {
    parts.push(
      `${form.value.otherName.trim() || t('tools.rent-calculator.texts.fee-other-short')} ${formatMoney(form.value.otherAmount ?? 0)}`,
    );
  }
  return `${t('tools.rent-calculator.texts.fee-total')} = ${parts.join(' + ')} = ${formatMoney(fee.value.totalFee)}`;
});

/* ------------------------------------------------------------------ 选择联动 */

/**
 * 切房间 → 预填表单：房租 + 生效单价 + 上期「现在读数」接成本期「上次读数」
 * + 账期顺推一个月。这是雏形 updateFees 的核心便利行为。
 */
function prefillFromRoom(roomId: string | null) {
  const room = state.value.rooms.find((r) => r.id === roomId);
  if (!room) {
    return;
  }
  const loc = state.value.locations.find((l) => l.id === room.locationId);
  if (!loc) {
    return;
  }
  const prices = resolvePrices(room, loc);
  const latest = latestRecordForRoom(state.value.records, room.id);
  form.value = {
    period: latest ? shiftPeriod(latest.period, 1) : currentPeriod(),
    rent: room.rent,
    elecPrice: prices.elecPrice,
    waterPrice: prices.waterPrice,
    elecLast: latest ? latest.elecNow : null,
    elecNow: null,
    waterLast: latest ? latest.waterNow : null,
    waterNow: null,
    otherName: '',
    otherAmount: null,
  };
}

watch(selectedLocationId, (id) => {
  locationNameDraft.value = state.value.locations.find((l) => l.id === id)?.name ?? '';
  const rooms = state.value.rooms.filter((r) => r.locationId === id);
  selectedRoomId.value = rooms.length > 0 ? rooms[0]!.id : null;
});

watch(selectedRoomId, (roomId) => {
  if (roomId) {
    prefillFromRoom(roomId);
  }
});

onMounted(() => {
  if (state.value.locations.length > 0 && !selectedLocationId.value) {
    selectedLocationId.value = state.value.locations[0]!.id;
  } else {
    locationNameDraft.value = currentLocation.value?.name ?? '';
  }
});

/* ----------------------------------------------------- ① 配置区：位置与房间 */

const newLocation = ref({ name: '', elecPrice: null as number | null, waterPrice: null as number | null });
const newRoom = ref({ name: '' });
const manageError = ref('');

function persist() {
  saveState(state.value);
}

function addLocation() {
  manageError.value = '';
  const name = newLocation.value.name.trim();
  if (!name) {
    manageError.value = t('tools.rent-calculator.texts.error-location-name');
    return;
  }
  if (state.value.locations.some((l) => l.name === name)) {
    manageError.value = t('tools.rent-calculator.texts.error-location-duplicate');
    return;
  }
  const location: RentLocation = {
    id: `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    elecPrice: newLocation.value.elecPrice ?? 0,
    waterPrice: newLocation.value.waterPrice ?? 0,
  };
  state.value.locations.push(location);
  selectedLocationId.value = location.id; // 触发 watch → 房间联动 + 改名草稿同步
  newLocation.value = { name: '', elecPrice: null, waterPrice: null };
  persist();
}

/** 位置改名：空值或重名都拒绝写入（store 里永远是合法值，输入框保留用户打的字） */
function commitLocationName(next: string | null) {
  const loc = currentLocation.value;
  if (!loc) {
    return;
  }
  const name = String(next ?? '').trim();
  if (!name) {
    manageError.value = t('tools.rent-calculator.texts.error-location-name');
    return;
  }
  if (state.value.locations.some((l) => l.id !== loc.id && l.name === name)) {
    manageError.value = t('tools.rent-calculator.texts.error-location-duplicate');
    return;
  }
  manageError.value = '';
  loc.name = name;
  locationNameDraft.value = name;
  persist();
}

function addRoom() {
  manageError.value = '';
  if (!currentLocation.value) {
    manageError.value = t('tools.rent-calculator.texts.error-no-location');
    return;
  }
  const name = newRoom.value.name.trim();
  if (!name) {
    manageError.value = t('tools.rent-calculator.texts.error-room-name');
    return;
  }
  if (locationRooms.value.some((r) => r.name === name)) {
    manageError.value = t('tools.rent-calculator.texts.error-room-duplicate');
    return;
  }
  const room: RentRoom = {
    id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    locationId: currentLocation.value.id,
    name,
    rent: 0,
  };
  state.value.rooms.push(room);
  selectedRoomId.value = room.id; // 触发预填
  newRoom.value = { name: '' };
  persist();
}

function deleteRoom(id: string) {
  state.value.rooms = state.value.rooms.filter((r) => r.id !== id);
  state.value.records = state.value.records.filter((rec) => rec.roomId !== id);
  if (selectedRoomId.value === id) {
    selectedRoomId.value = null;
  }
  persist();
}

/** 位置默认单价直接改（绑定 store，改完即存） */
function onLocationPriceUpdate() {
  persist();
}

/* --------------------------------------------------------- ② 保存本期记录 */

const billError = ref('');
const notice = ref('');

function saveRecord() {
  billError.value = '';
  notice.value = '';
  const room = currentRoom.value;
  if (!room) {
    billError.value = t('tools.rent-calculator.texts.error-no-room');
    return;
  }
  if (!PERIOD_RE.test(form.value.period)) {
    billError.value = t('tools.rent-calculator.texts.error-period');
    return;
  }
  if (form.value.elecPrice === null || form.value.waterPrice === null) {
    billError.value = t('tools.rent-calculator.texts.error-price');
    return;
  }
  const { elecLast, elecNow, waterLast, waterNow } = form.value;
  if (elecLast === null || elecNow === null || waterLast === null || waterNow === null) {
    billError.value = t('tools.rent-calculator.texts.error-readings');
    return;
  }
  if (state.value.records.some((r) => r.roomId === room.id && r.period === form.value.period)) {
    billError.value = t('tools.rent-calculator.texts.error-duplicate');
    return;
  }

  const result = computeFees({
    rent: form.value.rent,
    elecPrice: form.value.elecPrice,
    waterPrice: form.value.waterPrice,
    elecLast,
    elecNow,
    waterLast,
    waterNow,
    otherAmount: form.value.otherAmount,
  });
  if (result.totalFee === null) {
    billError.value = t('tools.rent-calculator.texts.error-readings');
    return;
  }

  const record: RentRecord = {
    id: `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    roomId: room.id,
    period: form.value.period,
    rent: form.value.rent ?? 0,
    elecPrice: form.value.elecPrice,
    waterPrice: form.value.waterPrice,
    elecLast,
    elecNow,
    waterLast,
    waterNow,
    elecFee: result.elecFee ?? 0,
    waterFee: result.waterFee ?? 0,
    otherName: form.value.otherName.trim(),
    otherAmount: form.value.otherAmount ?? 0,
    totalFee: result.totalFee,
    createdAt: new Date().toISOString(),
  };
  state.value.records.push(record);
  persist();

  // 保存成功 → 表单顺势滚到下一期：账期 +1，本期「现在读数」变下期「上次读数」
  form.value.period = shiftPeriod(record.period, 1);
  form.value.elecLast = record.elecNow;
  form.value.waterLast = record.waterNow;
  form.value.elecNow = null;
  form.value.waterNow = null;
  form.value.otherName = '';
  form.value.otherAmount = null;
  notice.value = t('tools.rent-calculator.texts.saved', { period: formatPeriod(record.period) });
}

function resetBillForm() {
  if (currentRoom.value) {
    prefillFromRoom(currentRoom.value.id);
  } else {
    form.value = emptyBillForm();
  }
  billError.value = '';
  notice.value = '';
}

/* ------------------------------------------------------------- 示例数据 */

const exampleArmed = ref(false);

function onExampleClick() {
  if (state.value.locations.length > 0) {
    exampleArmed.value = true; // 有数据 → 弹出覆盖确认
    return;
  }
  applyExample();
}

function applyExample() {
  exampleArmed.value = false;
  state.value = createExampleState();
  persist();
  selectedLocationId.value = state.value.locations[0]!.id; // 联动链自动选房并预填
  locationNameDraft.value = state.value.locations[0]!.name;
  notice.value = '';
  billError.value = '';
}

/* --------------------------------------------------------- ③ 记录明细 */

/** 明细表房间筛选：null = 全部房间 */
const detailRoomFilter = ref<string | null>(null);

const roomNameOf = (roomId: string): string => state.value.rooms.find((r) => r.id === roomId)?.name ?? roomId;

const locationNameOf = (roomId: string): string => {
  const room = state.value.rooms.find((r) => r.id === roomId);
  return room ? (state.value.locations.find((l) => l.id === room.locationId)?.name ?? '') : '';
};

/** 明细行：全部房间按账期倒序铺平；房间/位置名现查（记录只存 roomId） */
const detailRows = computed<RentRecord[]>(() => {
  const rows = detailRoomFilter.value
    ? state.value.records.filter((r) => r.roomId === detailRoomFilter.value)
    : [...state.value.records];
  return rows.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : a.createdAt < b.createdAt ? 1 : -1));
});

/** 房间跨位置可能重名，筛选下拉里补上位置名区分；'__all__' 是「全部房间」的哨兵值 */
const detailRoomOptions = computed(() => [
  { label: t('tools.rent-calculator.texts.filter-all-rooms'), value: '__all__' },
  ...state.value.rooms.map((r) => ({ label: `${locationNameOf(r.id)} / ${r.name}`, value: r.id })),
]);

/**
 * 下拉值 ↔ 内部 null 的中转。n-select 不支持 value 为 null 的选项，
 * 所以哨兵 '__all__' 才代表「全部房间」。
 */
const filterValue = computed({
  get: () => detailRoomFilter.value ?? '__all__',
  set: (value: string | null) => {
    detailRoomFilter.value = value === '__all__' ? null : value;
  },
});

function deleteRecord(id: string) {
  state.value.records = state.value.records.filter((r) => r.id !== id);
  persist();
}

/* ------------------------------------------------------------- 导出 */

const exportScope = ref<ExportScope>('location');

const exportTargetId = computed(() => {
  if (exportScope.value === 'room') {
    return selectedRoomId.value;
  }
  if (exportScope.value === 'location') {
    return selectedLocationId.value;
  }
  return null;
});

const exportRecords = computed(() => filterRecords(state.value, exportScope.value, exportTargetId.value));

const exportScopeLabel = computed(() => {
  if (exportScope.value === 'room') {
    return currentRoom.value ? `${t('tools.rent-calculator.texts.scope-room')}「${currentRoom.value.name}」` : t('tools.rent-calculator.texts.scope-room');
  }
  if (exportScope.value === 'location') {
    return currentLocation.value
      ? `${t('tools.rent-calculator.texts.scope-location')}「${currentLocation.value.name}」`
      : t('tools.rent-calculator.texts.scope-location');
  }
  return t('tools.rent-calculator.texts.scope-all');
});

const csvRows = computed(() => buildCsvRows(exportRecords.value, state.value));
const txtReport = computed(() => buildTxtReport(exportRecords.value, state.value, exportScopeLabel.value));

/** 文件名安全化：去掉文件系统保留字符 */
function safeFileName(name: string): string {
  return name.replace(/[\\/?%*:|"<>]/g, '_').slice(0, 60);
}

function exportXlsx() {
  const blob = gridToXlsx(csvRows.value);
  downloadBlobFile(`${safeFileName(`房租记录明细_${exportScopeLabel.value}`)}.xlsx`, blob);
}

function exportJson() {
  const json = buildJsonReport(exportRecords.value, state.value, exportScopeLabel.value);
  downloadBlobFile(
    `${safeFileName(`房租记录明细_${exportScopeLabel.value}`)}.json`,
    new Blob([json], { type: 'application/json;charset=utf-8' }),
  );
}

const locationOptions = computed(() => state.value.locations.map((l) => ({ label: l.name, value: l.id })));
const roomOptions = computed(() => locationRooms.value.map((r) => ({ label: r.name, value: r.id })));

/** 当前房间的读数衔接提示（切房间时自动填了上期读数才显示） */
const carryOverHint = computed(() => {
  if (!currentRoom.value) {
    return '';
  }
  const latest = latestRecordForRoom(state.value.records, currentRoom.value.id);
  if (!latest) {
    return '';
  }
  return t('tools.rent-calculator.texts.hint-auto-filled', { period: formatPeriod(latest.period) });
});

/* --------------------------------------------------- 账期选择器中转 */

/**
 * n-date-picker 的 TS 类型不认 value-format="yyyy-MM"（运行时返回字符串，类型却按
 * timestamp 推），用一个 computed 中转：'2026-10' ↔ 当月 1 号本地 00:00 的 timestamp。
 */
const periodTs = computed(() => {
  const m = /^(\d{4})-(\d{2})$/.exec(form.value.period);
  if (!m) {
    return null;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime();
});

function onPeriodChange(ts: number | null) {
  if (ts === null || ts === undefined) {
    return; // 清空不生效，保持原账期（保存时有校验）
  }
  const d = new Date(ts);
  form.value.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
</script>

<template>
  <div flex flex-col gap-4>
    <!-- ① 配置区（页面最上方） -->
    <c-card :title="t('tools.rent-calculator.texts.card-config')">
      <div mb-3 flex items-center justify-between gap-2>
        <span text-sm op-60>{{ t('tools.rent-calculator.texts.example-hint') }}</span>
        <n-popconfirm
          v-if="exampleArmed"
          @positive-click="applyExample"
        >
          <span>{{ t('tools.rent-calculator.texts.confirm-overwrite-example') }}</span>
          <template #trigger>
            <ToolExampleButton @click="onExampleClick" />
          </template>
        </n-popconfirm>
        <ToolExampleButton v-else @click="onExampleClick" />
      </div>

      <n-alert v-if="manageError" mb-3 type="error" closable @close="manageError = ''">{{ manageError }}</n-alert>

      <!-- 位置：选择 + 新增 -->
      <div mb-3 grid gap-2 md:grid-cols-2>
        <div>
          <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-location') }}</div>
          <n-select
            v-model:value="selectedLocationId"
            :options="locationOptions"
            :placeholder="t('tools.rent-calculator.texts.placeholder-location')"
            clearable
          />
        </div>
        <div v-if="currentLocation">
          <div mb-1 text-sm font-medium>
            {{ t('tools.rent-calculator.texts.label-location-name') }}
            <span ml-1 op-50>{{ t('tools.rent-calculator.texts.hint-location-rename') }}</span>
          </div>
          <n-input v-model:value="locationNameDraft" @update:value="commitLocationName" />
        </div>
      </div>

      <!-- 当前位置的默认水电单价 -->
      <div v-if="currentLocation" mb-3>
        <div mb-1 text-sm font-medium>
          {{ t('tools.rent-calculator.texts.label-location-defaults') }}
          <span ml-1 op-50>{{ t('tools.rent-calculator.texts.hint-location-defaults') }}</span>
        </div>
        <div grid gap-2 md:grid-cols-2>
          <n-input-number-i18n
            v-model:value="currentLocation.elecPrice"
            :min="0"
            :precision="2"
            :step="0.1"
            :placeholder="t('tools.rent-calculator.texts.label-location-elec-price')"
            @update:value="onLocationPriceUpdate"
          />
          <n-input-number-i18n
            v-model:value="currentLocation.waterPrice"
            :min="0"
            :precision="2"
            :step="0.1"
            :placeholder="t('tools.rent-calculator.texts.label-location-water-price')"
            @update:value="onLocationPriceUpdate"
          />
        </div>
      </div>

      <!-- 新增位置 -->
      <div mb-3>
        <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-new-location') }}</div>
        <div flex flex-wrap items-center gap-2>
          <n-input
            v-model:value="newLocation.name"
            :placeholder="t('tools.rent-calculator.texts.placeholder-location-name')"
            class="min-w-40 flex-1"
            @keyup.enter="addLocation"
          />
          <n-input-number-i18n
            v-model:value="newLocation.elecPrice"
            :min="0"
            :precision="2"
            :step="0.1"
            :placeholder="t('tools.rent-calculator.texts.label-location-elec-price')"
            class="w-32"
          />
          <n-input-number-i18n
            v-model:value="newLocation.waterPrice"
            :min="0"
            :precision="2"
            :step="0.1"
            :placeholder="t('tools.rent-calculator.texts.label-location-water-price')"
            class="w-32"
          />
          <c-button size="small" secondary @click="addLocation">{{ t('tools.rent-calculator.texts.button-add-location') }}</c-button>
        </div>
      </div>

      <n-divider v-if="currentLocation" />

      <!-- 房间：选择 + 新增 + 删除 -->
      <template v-if="currentLocation">
        <div mb-3 grid gap-2 md:grid-cols-2>
          <div>
            <div mb-1 text-sm font-medium>
              {{ t('tools.rent-calculator.texts.label-room') }}
              <span ml-1 op-50>（{{ currentLocation.name }}）</span>
            </div>
            <n-select
              v-model:value="selectedRoomId"
              :options="roomOptions"
              :placeholder="t('tools.rent-calculator.texts.placeholder-room')"
              clearable
            />
          </div>
        </div>

        <div mb-3>
          <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-new-room') }}</div>
          <div flex flex-wrap items-center gap-2>
            <n-input
              v-model:value="newRoom.name"
              :placeholder="t('tools.rent-calculator.texts.placeholder-room-name')"
              class="min-w-40 flex-1"
              @keyup.enter="addRoom"
            />
            <c-button size="small" secondary @click="addRoom">{{ t('tools.rent-calculator.texts.button-add-room') }}</c-button>
          </div>
        </div>

        <div v-if="currentRoom">
          <n-popconfirm @positive-click="deleteRoom(currentRoom.id)">
            <span>{{ t('tools.rent-calculator.texts.confirm-delete-room', { name: currentRoom.name, count: roomRecords.length }) }}</span>
            <template #trigger>
              <c-button size="small" secondary>{{ t('tools.rent-calculator.texts.button-delete-room', { name: currentRoom.name }) }}</c-button>
            </template>
          </n-popconfirm>
        </div>
      </template>

      <p v-if="state.locations.length === 0" mt-3 text-sm op-60>
        {{ t('tools.rent-calculator.texts.empty-locations') }}
      </p>

      <p mt-3 text-sm op-60>{{ t('tools.rent-calculator.texts.config-hint') }}</p>
      <p mt-2 text-sm op-60>{{ t('tools.rent-calculator.texts.privacy-note') }}</p>
    </c-card>

    <!-- ② 本期费用 -->
    <c-card :title="t('tools.rent-calculator.texts.card-bill')">
      <p v-if="!currentRoom" mb-3 text-sm op-60>{{ t('tools.rent-calculator.texts.empty-bill') }}</p>

      <template v-if="currentRoom">
        <div mb-3 grid gap-2 md:grid-cols-2>
          <div>
            <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-period') }}</div>
            <n-date-picker
              v-model:value="periodTs"
              type="month"
              format="yyyy 年 MM 月"
              class="w-full"
              @update:value="onPeriodChange"
            />
          </div>
          <div>
            <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-rent') }}</div>
            <n-input-number-i18n v-model:value="form.rent" :min="0" :precision="2" :step="100" class="w-full" />
          </div>
        </div>

        <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-meters') }}</div>
        <div mb-3 grid gap-2 md:grid-cols-2>
          <n-input-number-i18n
            v-model:value="form.elecLast"
            :precision="2"
            :step="1"
            :placeholder="t('tools.rent-calculator.texts.placeholder-elec-last')"
          />
          <n-input-number-i18n
            v-model:value="form.elecNow"
            :precision="2"
            :step="1"
            :placeholder="t('tools.rent-calculator.texts.placeholder-elec-now')"
          />
          <n-input-number-i18n
            v-model:value="form.waterLast"
            :precision="2"
            :step="1"
            :placeholder="t('tools.rent-calculator.texts.placeholder-water-last')"
          />
          <n-input-number-i18n
            v-model:value="form.waterNow"
            :precision="2"
            :step="1"
            :placeholder="t('tools.rent-calculator.texts.placeholder-water-now')"
          />
        </div>

        <!-- 本期单价 / 其他费用：默认不需动，收进折叠里 -->
        <n-collapse class="mb-3">
          <n-collapse-item :title="t('tools.rent-calculator.texts.label-price-collapsed')">
            <p mb-2 text-sm op-60>{{ t('tools.rent-calculator.texts.hint-price-inherit') }}</p>
            <div mb-3 grid gap-2 md:grid-cols-2>
              <div>
                <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-elec-price') }}</div>
                <n-input-number-i18n v-model:value="form.elecPrice" :min="0" :precision="2" :step="0.1" class="w-full" />
              </div>
              <div>
                <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-water-price') }}</div>
                <n-input-number-i18n v-model:value="form.waterPrice" :min="0" :precision="2" :step="0.1" class="w-full" />
              </div>
            </div>
            <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-other') }}</div>
            <div flex flex-wrap items-center gap-2>
              <n-input
                v-model:value="form.otherName"
                :placeholder="t('tools.rent-calculator.texts.placeholder-other-name')"
                class="min-w-32 flex-1"
              />
              <n-input-number-i18n
                v-model:value="form.otherAmount"
                :min="0"
                :precision="2"
                :step="10"
                :placeholder="t('tools.rent-calculator.texts.label-other-amount')"
                class="w-32"
              />
            </div>
          </n-collapse-item>
        </n-collapse>

        <p v-if="carryOverHint" mb-3 text-sm op-60>{{ carryOverHint }}</p>

        <n-alert v-if="fee.reversedElec || fee.reversedWater" mb-3 type="warning">
          <span v-if="fee.reversedElec">{{ t('tools.rent-calculator.texts.warning-reversed-elec') }}</span>
          <span v-if="fee.reversedWater" :class="fee.reversedElec ? 'block' : ''">{{ t('tools.rent-calculator.texts.warning-reversed-water') }}</span>
        </n-alert>

        <!-- 费用明细：三列网格（标签｜金额｜算式），总费用算式整行在下。
             金额列 7rem 实测放得下「-1234.56」（需 53px，框内 66px）；
             再宽就回到用户抱怨的「文本框太长、算式被挤」。 -->
        <div mb-1 text-sm font-medium>{{ t('tools.rent-calculator.texts.label-fee-detail') }}</div>
        <div
          mb-3
          style="display: grid; grid-template-columns: max-content 7rem minmax(0, 1fr); gap: 0.5rem 0.75rem; align-items: center"
        >
          <span text-sm op-70>{{ t('tools.rent-calculator.texts.fee-elec') }}</span>
          <InputCopyable :value="fee.elecFee === null ? '' : formatMoney(fee.elecFee)" readonly />
          <span text-xs op-60 style="word-break: break-word">{{ elecFormula }}</span>

          <span text-sm op-70>{{ t('tools.rent-calculator.texts.fee-water') }}</span>
          <InputCopyable :value="fee.waterFee === null ? '' : formatMoney(fee.waterFee)" readonly />
          <span text-xs op-60 style="word-break: break-word">{{ waterFormula }}</span>

          <span text-sm font-bold>{{ t('tools.rent-calculator.texts.fee-total') }}</span>
          <InputCopyable :value="fee.totalFee === null ? '' : formatMoney(fee.totalFee)" readonly />
          <span v-if="fee.totalFee === null" text-xs op-60>{{ t('tools.rent-calculator.texts.hint-incomplete') }}</span>
          <span v-else />
          <span v-if="totalFormula" text-xs op-60 style="grid-column: 1 / -1; word-break: break-word">
            {{ totalFormula }}
          </span>
        </div>

        <n-alert v-if="billError" mb-3 type="error" closable @close="billError = ''">{{ billError }}</n-alert>
        <n-alert v-if="notice" mb-3 type="success" closable @close="notice = ''">{{ notice }}</n-alert>

        <div flex gap-2>
          <c-button @click="saveRecord">{{ t('tools.rent-calculator.texts.button-save') }}</c-button>
          <c-button secondary @click="resetBillForm">{{ t('tools.rent-calculator.texts.button-reset-form') }}</c-button>
        </div>
      </template>
    </c-card>

    <!-- ③ 记录明细（原月度汇总） -->
    <c-card :title="t('tools.rent-calculator.texts.card-detail')">
      <div mb-3 flex flex-wrap items-center gap-2>
        <span text-sm>{{ t('tools.rent-calculator.texts.label-filter-room') }}</span>
        <n-select
          v-model:value="filterValue"
          :options="detailRoomOptions"
          size="small"
          class="w-56"
        />
        <span text-sm op-60>
          {{ t('tools.rent-calculator.texts.detail-count', { count: detailRows.length }) }}
        </span>
      </div>

      <div v-if="detailRows.length === 0" mb-4 text-sm op-60>
        {{ t('tools.rent-calculator.texts.empty-detail') }}
      </div>
      <div v-else mb-4 overflow-x-auto>
        <table class="detail-table" w-full border-collapse>
          <thead>
            <tr>
              <th text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-period') }}</th>
              <th text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-location') }}</th>
              <th text-left p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-room') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-rent') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-elec-last') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-elec-now') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-water-last') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-water-now') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-elec') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-water') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-other') }}</th>
              <th text-right p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ t('tools.rent-calculator.texts.col-total') }}</th>
              <th w-16 p-2 border border-gray-300 dark:border-gray-600 />
            </tr>
          </thead>
          <tbody>
            <tr v-for="rec in detailRows" :key="rec.id">
              <td p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ formatPeriod(rec.period) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ locationNameOf(rec.roomId) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 whitespace-nowrap>{{ roomNameOf(rec.roomId) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.rent) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.elecLast) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.elecNow) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.waterLast) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.waterNow) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.elecFee) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>{{ formatMoney(rec.waterFee) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right>
                <span v-if="rec.otherName">{{ rec.otherName }} {{ formatMoney(rec.otherAmount) }}</span>
                <span v-else op-50>—</span>
              </td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-right font-bold>{{ formatMoney(rec.totalFee) }}</td>
              <td p-2 border border-gray-300 dark:border-gray-600 text-center>
                <n-popconfirm @positive-click="deleteRecord(rec.id)">
                  <span>{{ t('tools.rent-calculator.texts.confirm-delete-record') }}</span>
                  <template #trigger>
                    <c-button size="small" secondary>{{ t('tools.rent-calculator.texts.button-delete-record') }}</c-button>
                  </template>
                </n-popconfirm>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 导出 -->
      <div mb-2 flex flex-wrap items-center justify-between gap-2>
        <div flex items-center gap-2>
          <span text-sm>{{ t('tools.rent-calculator.texts.label-export-scope') }}</span>
          <n-select
            v-model:value="exportScope"
            :options="[
              { label: t('tools.rent-calculator.texts.scope-room'), value: 'room' },
              { label: t('tools.rent-calculator.texts.scope-location'), value: 'location' },
              { label: t('tools.rent-calculator.texts.scope-all'), value: 'all' },
            ]"
            size="small"
            class="w-32"
          />
        </div>
        <div flex flex-wrap items-center gap-2>
          <CopyExportBar :text="txtReport" filename="rent-records" :rows="csvRows" :disabled="exportRecords.length === 0" />
          <c-button size="small" secondary :disabled="exportRecords.length === 0" @click="exportXlsx">
            {{ t('tools.rent-calculator.texts.button-export-xlsx') }}
          </c-button>
          <c-button size="small" secondary :disabled="exportRecords.length === 0" @click="exportJson">
            {{ t('tools.rent-calculator.texts.button-export-json') }}
          </c-button>
        </div>
      </div>
      <p text-sm op-60>{{ t('tools.rent-calculator.texts.label-export-hint') }}</p>
    </c-card>
  </div>
</template>
