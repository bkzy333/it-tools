<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { CornerDotType, CornerSquareType, DotType, ErrorCorrectionLevel, FileExtension } from 'pp-qr-code';
import { useQRCodeStyling } from './useQRCode';
import { useDownloadFileFromBase64 } from '@/composable/downloadBase64';
import { useCopy } from '@/composable/copy';
import { useQueryParam, useQueryParamOrStorage } from '@/composable/queryParams';
import {
  buildCalendar,
  buildEmail,
  buildGeo,
  buildSms,
  buildTel,
  buildVcard,
  buildWifi,
  type GeneratorDataType,
} from './qr-code-generator.service';

const { t } = useI18n();

const foreground = useQueryParamOrStorage({ name: 'fg', storageName: 'qr-code-gen:fg', defaultValue: '#000000ff' });
const background = useQueryParamOrStorage({ name: 'bg', storageName: 'qr-code-gen:bg', defaultValue: '#ffffffff' });
const errorCorrectionLevelSelectValue = useQueryParamOrStorage<string>({
  name: 'level',
  storageName: 'qr-code-gen:level',
  defaultValue: 'medium',
});
const errorCorrectionLevel = computed(
  () => errorCorrectionLevelSelectValue.value.toString()[0].toUpperCase() as ErrorCorrectionLevel,
);
const width = useQueryParamOrStorage({ name: 'width', storageName: 'qr-code-gen:width', defaultValue: 1024 });
const margin = useQueryParamOrStorage({ name: 'margin', storageName: 'qr-code-gen:margin', defaultValue: 10 });
const imageSize = useQueryParamOrStorage({ name: 'imgsize', storageName: 'qr-code-gen:imsz', defaultValue: 0.4 });
const imageMargin = useQueryParamOrStorage({ name: 'imgmargin', storageName: 'qr-code-gen:immg', defaultValue: 20 });
const outputType = useQueryParamOrStorage<FileExtension>({
  name: 'out',
  storageName: 'qr-code-gen:out',
  defaultValue: 'png',
});
const dotType = useQueryParamOrStorage<DotType>({
  name: 'dot',
  storageName: 'qr-code-gen:dot',
  defaultValue: 'square',
});
const dotColor = useQueryParamOrStorage<string>({
  name: 'dotc',
  storageName: 'qr-code-gen:dotc',
  defaultValue: '#ffffffff',
});
const cornersDotType = useQueryParamOrStorage<CornerDotType>({
  name: 'cdt',
  storageName: 'qr-code-gen:cdt',
  defaultValue: 'square',
});
const cornersDotColor = useQueryParamOrStorage<string>({
  name: 'cdtc',
  storageName: 'qr-code-gen:cdtc',
  defaultValue: '#ffffffff',
});
const cornersSquareType = useQueryParamOrStorage<CornerSquareType>({
  name: 'cst',
  storageName: 'qr-code-gen:cst',
  defaultValue: 'square',
});
const cornersSquareColor = useQueryParamOrStorage<string>({
  name: 'cstc',
  storageName: 'qr-code-gen:cstc',
  defaultValue: '#ffffffff',
});
const fileInput = ref() as Ref<File>;
const { base64: imageBase64 } = useBase64(fileInput);
async function onUpload(file: File) {
  if (file) {
    fileInput.value = file;
  }
}

const errorCorrectionLevels = ['low', 'medium', 'quartile', 'high'];
const outputTypes = ['svg', 'png', 'jpeg', 'webp'];
const dotTypes = [
  'dots',
  'random-dots',
  'rounded',
  'vertical-lines',
  'horizontal-lines',
  'classy',
  'classy-rounded',
  'square',
  'extra-rounded',
];
const cornersDotTypes = ['dot', 'square', 'heart'];
const cornersSquareTypes = ['dot', 'square', 'extra-rounded'];

// ---- 结构化数据类型（对齐 QR Studio 的数据类型，但用本站更强的渲染引擎） ----
const dataType = useQueryParamOrStorage<GeneratorDataType>({
  name: 'type',
  storageName: 'qr-code-gen:type',
  defaultValue: 'text',
});
const dataTypeOptions: { label: string; value: GeneratorDataType }[] = [
  { label: t('tools.qrcode-generator.texts.data-type-text'), value: 'text' },
  { label: t('tools.qrcode-generator.texts.data-type-url'), value: 'url' },
  { label: t('tools.qrcode-generator.texts.data-type-wifi'), value: 'wifi' },
  { label: t('tools.qrcode-generator.texts.data-type-vcard'), value: 'vcard' },
  { label: t('tools.qrcode-generator.texts.data-type-email'), value: 'email' },
  { label: t('tools.qrcode-generator.texts.data-type-sms'), value: 'sms' },
  { label: t('tools.qrcode-generator.texts.data-type-tel'), value: 'tel' },
  { label: t('tools.qrcode-generator.texts.data-type-geo'), value: 'geo' },
  { label: t('tools.qrcode-generator.texts.data-type-event'), value: 'event' },
];
const wifiEncryptions = ['WPA', 'WEP', 'nopass'];
const isStructured = computed(() => !['text', 'url'].includes(dataType.value));

// 结构化表单字段
const wifi = reactive({ ssid: '', password: '', encryption: 'WPA' as 'WPA' | 'WEP' | 'nopass', hidden: false });
const vcard = reactive({
  firstName: '',
  lastName: '',
  org: '',
  title: '',
  phone: '',
  email: '',
  url: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  country: '',
});
const emailForm = reactive({ to: '', subject: '', body: '' });
const smsForm = reactive({ to: '', body: '' });
const telForm = reactive({ number: '' });
const geoForm = reactive({ lat: '', lon: '' });
const eventForm = reactive({ title: '', location: '', description: '' });
const eventStart = ref<number | null>(null);
const eventEnd = ref<number | null>(null);

// 根据当前类型与表单拼出编码串；text/url 返回 null（由用户直接编辑 raw text）
const generated = computed<string | null>(() => {
  switch (dataType.value) {
    case 'wifi':
      return buildWifi(wifi);
    case 'vcard':
      return buildVcard(vcard);
    case 'email':
      return buildEmail(emailForm);
    case 'sms':
      return buildSms(smsForm);
    case 'tel':
      return buildTel(telForm);
    case 'geo':
      return buildGeo(geoForm);
    case 'event':
      return buildCalendar({ ...eventForm, start: eventStart.value ?? '', end: eventEnd.value ?? '' });
    default:
      return null;
  }
});

const text = useQueryParam({
  tool: 'qr-code-gen',
  name: 'text',
  defaultValue: 'https://gjxtools.com',
});
// 结构化模式下，把拼好的串写回渲染用的 text；text/url 模式不动（用户自由编辑）
watch(
  generated,
  (val) => {
    if (val !== null) {
      text.value = val;
    }
  },
  { immediate: true },
);

const { qrcode } = useQRCodeStyling({
  text,
  color: { background, foreground },
  errorCorrectionLevel,
  imageBase64,
  imageOptions: { imageSize, margin: imageMargin },
  dotOptions: { type: dotType, color: dotColor },
  cornersSquareOptions: { type: cornersSquareType, color: cornersSquareColor },
  cornersDotOptions: { type: cornersDotType, color: cornersDotColor },
  outputType,
  width,
  margin,
});

const filename = useQueryParam({ tool: 'qr-code-gen', name: 'file', defaultValue: 'qr-code' });
const extension = computed(() => {
  // Explicitly access the reactive value
  const type = outputType.value;
  return type.toString();
});
const { download } = useDownloadFileFromBase64({ source: qrcode, filename, extension });

// 复制当前二维码所「编码的内容」（纯文本），比复制图片可靠，且在非安全上下文也能用。
// 用 useCopy 兜底 execCommand，避免 navigator.clipboard 缺失导致点了没反应。
const { copy: copyText, isJustCopied: isCopied } = useCopy({ source: text });
</script>

<template>
  <c-card>
    <n-grid x-gap="12" y-gap="12" cols="1 600:3">
      <n-gi span="2">
        <c-select
          v-model:value="dataType"
          :label="t('tools.qrcode-generator.texts.label-data-type')"
          label-position="left"
          label-width="130px"
          label-align="right"
          :options="dataTypeOptions"
        />

        <!-- 文本 / 网址：直接编辑裸文本（原行为保留） -->
        <c-input-text
          v-if="!isStructured"
          v-model:value="text"
          label-position="left"
          label-width="130px"
          label-align="right"
          multiline
          :label="dataType === 'url' ? t('tools.qrcode-generator.texts.label-url') : t('tools.qrcode-generator.texts.label-text')"
          :placeholder="dataType === 'url' ? 'https://example.com' : t('tools.qrcode-generator.texts.placeholder')"
          autosize
          mb-6
        />

        <!-- WiFi -->
        <n-form v-if="dataType === 'wifi'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.wifi-ssid')">
            <c-input-text v-model:value="wifi.ssid" :placeholder="t('tools.qrcode-generator.texts.wifi-ssid-ph')" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.wifi-password')">
            <c-input-text v-model:value="wifi.password" type="password" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.wifi-encryption')">
            <c-select v-model:value="wifi.encryption" :options="wifiEncryptions.map((v) => ({ label: v, value: v }))" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.wifi-hidden')">
            <n-checkbox v-model:checked="wifi.hidden" />
          </n-form-item>
        </n-form>

        <!-- 名片 vCard -->
        <n-form v-if="dataType === 'vcard'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-first')">
            <c-input-text v-model:value="vcard.firstName" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-last')">
            <c-input-text v-model:value="vcard.lastName" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-org')">
            <c-input-text v-model:value="vcard.org" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-title')">
            <c-input-text v-model:value="vcard.title" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-phone')">
            <c-input-text v-model:value="vcard.phone" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-email')">
            <c-input-text v-model:value="vcard.email" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-url')">
            <c-input-text v-model:value="vcard.url" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-street')">
            <c-input-text v-model:value="vcard.street" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-city')">
            <c-input-text v-model:value="vcard.city" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-state')">
            <c-input-text v-model:value="vcard.state" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-zip')">
            <c-input-text v-model:value="vcard.zip" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.vcard-country')">
            <c-input-text v-model:value="vcard.country" />
          </n-form-item>
        </n-form>

        <!-- 邮件 -->
        <n-form v-if="dataType === 'email'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.email-to')">
            <c-input-text v-model:value="emailForm.to" placeholder="name@example.com" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.email-subject')">
            <c-input-text v-model:value="emailForm.subject" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.email-body')">
            <c-input-text v-model:value="emailForm.body" multiline autosize />
          </n-form-item>
        </n-form>

        <!-- 短信 -->
        <n-form v-if="dataType === 'sms'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.sms-to')">
            <c-input-text v-model:value="smsForm.to" placeholder="+8613800138000" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.sms-body')">
            <c-input-text v-model:value="smsForm.body" multiline autosize />
          </n-form-item>
        </n-form>

        <!-- 电话 -->
        <n-form v-if="dataType === 'tel'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.tel-number')">
            <c-input-text v-model:value="telForm.number" placeholder="+8613800138000" />
          </n-form-item>
        </n-form>

        <!-- 定位 -->
        <n-form v-if="dataType === 'geo'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.geo-lat')">
            <c-input-text v-model:value="geoForm.lat" placeholder="39.9042" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.geo-lon')">
            <c-input-text v-model:value="geoForm.lon" placeholder="116.4074" />
          </n-form-item>
        </n-form>

        <!-- 日历事件 -->
        <n-form v-if="dataType === 'event'" label-width="130" label-placement="left">
          <n-form-item :label="t('tools.qrcode-generator.texts.event-title')">
            <c-input-text v-model:value="eventForm.title" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.event-start')">
            <n-date-picker v-model:value="eventStart" type="datetime" clearable />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.event-end')">
            <n-date-picker v-model:value="eventEnd" type="datetime" clearable />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.event-location')">
            <c-input-text v-model:value="eventForm.location" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.event-description')">
            <c-input-text v-model:value="eventForm.description" multiline autosize />
          </n-form-item>
        </n-form>

        <!-- 结构化模式：展示已生成的编码串（可复制，对齐 QR Studio 的 copyable encoded data） -->
        <n-form-item
          v-if="isStructured"
          :label="t('tools.qrcode-generator.texts.label-encoded-payload')"
          label-width="130"
          label-placement="left"
        >
          <InputCopyable :value="text" multiline />
        </n-form-item>

        <n-form label-width="130" label-placement="left" mt-3>
          <n-form-item :label="t('tools.qrcode-generator.texts.label-foreground-color')">
            <n-color-picker v-model:value="foreground" :modes="['hex']" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.label-background-color')">
            <n-color-picker v-model:value="background" :modes="['hex']" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.label-width')">
            <n-input-number-i18n v-model:value="width" :min="0" />
          </n-form-item>
          <n-form-item :label="t('tools.qrcode-generator.texts.label-margin')">
            <n-input-number-i18n v-model:value="margin" :min="0" />
          </n-form-item>
          <c-select
            v-model:value="errorCorrectionLevelSelectValue"
            :label="t('tools.qrcode-generator.texts.label-error-resistance')"
            label-position="left"
            label-width="130px"
            label-align="right"
            :options="errorCorrectionLevels.map((value) => ({ label: value, value }))"
          />
          <c-select
            v-model:value="outputType"
            mt-3
            :label="t('tools.qrcode-generator.texts.label-output-format')"
            label-position="left"
            label-width="130px"
            label-align="right"
            :options="outputTypes.map((value) => ({ label: value.toUpperCase(), value }))"
          />
        </n-form>
        <c-card :title="t('tools.qrcode-generator.texts.title-image')" mt-3>
          <c-file-upload
            :title="t('tools.qrcode-generator.texts.title-drag-and-drop-an-image-here-or-click-to-select-an-image')"
            @file-upload="onUpload"
          />

          <n-form label-width="130" label-placement="left" mt-3>
            <n-form-item :label="t('tools.qrcode-generator.texts.label-size')">
              <n-input-number-i18n v-model:value="imageSize" :min="0" step="0.1" />
            </n-form-item>
            <n-form-item :label="t('tools.qrcode-generator.texts.label-margin')">
              <n-input-number-i18n v-model:value="imageMargin" :min="0" />
            </n-form-item>
          </n-form>
        </c-card>
        <c-card mt-3>
          <details>
            <summary>{{ t('tools.qrcode-generator.texts.tag-dots-options') }}</summary>
            <n-form label-width="130" label-placement="left">
              <n-form-item :label="t('tools.qrcode-generator.texts.label-color')">
                <n-color-picker v-model:value="dotColor" :modes="['hex']" />
              </n-form-item>
              <c-select
                v-model:value="dotType"
                :label="t('tools.qrcode-generator.texts.label-type')"
                label-position="left"
                label-width="130px"
                label-align="right"
                :options="dotTypes.map((value) => ({ label: value, value }))"
              />
            </n-form>
          </details>
        </c-card>
        <c-card mt-3>
          <details>
            <summary>{{ t('tools.qrcode-generator.texts.tag-corners-dots-options') }}</summary>
            <n-form label-width="130" label-placement="left">
              <n-form-item :label="t('tools.qrcode-generator.texts.label-color')">
                <n-color-picker v-model:value="cornersDotColor" :modes="['hex']" />
              </n-form-item>
              <c-select
                v-model:value="cornersDotType"
                :label="t('tools.qrcode-generator.texts.label-type')"
                label-position="left"
                label-width="130px"
                label-align="right"
                :options="cornersDotTypes.map((value) => ({ label: value, value }))"
              />
            </n-form>
          </details>
        </c-card>
        <c-card mt-3>
          <details>
            <summary>{{ t('tools.qrcode-generator.texts.tag-corners-square-options') }}</summary>
            <n-form label-width="130" label-placement="left">
              <n-form-item :label="t('tools.qrcode-generator.texts.label-color')">
                <n-color-picker v-model:value="cornersSquareColor" :modes="['hex']" />
              </n-form-item>
              <c-select
                v-model:value="cornersSquareType"
                :label="t('tools.qrcode-generator.texts.label-type')"
                label-position="left"
                label-width="130px"
                label-align="right"
                :options="cornersSquareTypes.map((value) => ({ label: value, value }))"
              />
            </n-form>
          </details>
        </c-card>
      </n-gi>
      <n-gi>
        <div flex flex-col items-center gap-3>
          <n-image :src="qrcode" width="250" class="qrcode" />
          <div flex gap-3>
            <c-button @click="copyText">
              {{ isCopied ? 'Copied!' : 'Copy' }}
              <icon-mdi-check v-if="isCopied" ml-2 style="color: #10b981" />
              <icon-mdi-content-copy v-else ml-2 />
            </c-button>
            <c-button @click="download">
              Download ({{ outputType.toString().toUpperCase() }})
              <icon-mdi-download ml-2 />
            </c-button>
          </div>
        </div>
      </n-gi>
    </n-grid>
  </c-card>
</template>
