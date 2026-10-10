<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessage } from 'naive-ui';
import { useQueryParamOrStorage } from '@/composable/queryParams';
import TextareaCopyable from '@/components/TextareaCopyable.vue';
import { useCopy } from '@/composable/copy';
import {
  CODE_LANGS,
  type ApiRequest,
  type BodyMode,
  type KeyValue,
  type CodeLang,
  parseCurl,
  parseFetch,
  parseHeadersText,
  parseKeyValueText,
  parseMap,
  parsePowerShell,
  generateCode,
  emptyRequest,
} from './api-tester.service';

const { t } = useI18n();
const message = useMessage();
const { copy: copyText } = useCopy();

// ---- 持久化状态 ----
const baseUrl = useQueryParamOrStorage({ name: 'url', storageName: 'api-tester:url', defaultValue: '' });
const method = useQueryParamOrStorage({ name: 'method', storageName: 'api-tester:m', defaultValue: 'POST' });
const queryParams = useQueryParamOrStorage<KeyValue[]>({
  name: 'params',
  storageName: 'api-tester:params',
  defaultValue: [],
});
const headers = useQueryParamOrStorage<KeyValue[]>({
  name: 'headers',
  storageName: 'api-tester:headers',
  defaultValue: [],
});
const contentType = useQueryParamOrStorage({
  name: 'ct',
  storageName: 'api-tester:ct',
  defaultValue: 'application/json',
});
const body = useQueryParamOrStorage({ name: 'body', storageName: 'api-tester:body', defaultValue: '' });

// ---- 本地状态 ----
const bodyMode = ref<BodyMode>(body.value ? 'raw' : 'none');
const formParams = ref<KeyValue[]>([]);
const useProxy = ref(true);

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
  'text/xml',
  'application/xml',
  'multipart/form-data',
];

function emptyKeyPair(): KeyValue {
  return { key: '', value: '' };
}

// ---- 批量添加面板 ----
const showBatchQuery = ref(false);
const batchQueryText = ref('');
function applyBatchQuery() {
  queryParams.value = [...queryParams.value, ...parseKeyValueText(batchQueryText.value)];
  batchQueryText.value = '';
  showBatchQuery.value = false;
}

const showBatchHeaders = ref(false);
const batchHeadersText = ref('');
function applyBatchHeaders() {
  headers.value = [...headers.value, ...parseHeadersText(batchHeadersText.value)];
  batchHeadersText.value = '';
  showBatchHeaders.value = false;
}

// ---- 请求体 JSON 美化 / 压缩 ----
function formatJson() {
  try {
    body.value = JSON.stringify(JSON.parse(body.value), null, 2);
  } catch {
    message.warning(t('tools.api-tester.texts.msg-json-invalid'));
  }
}
function compressJson() {
  try {
    body.value = JSON.stringify(JSON.parse(body.value));
  } catch {
    message.warning(t('tools.api-tester.texts.msg-json-invalid'));
  }
}

// ---- 导入 ----
const importTab = ref<'curl' | 'powershell' | 'fetch' | 'map'>('curl');
const importText = ref('');
function doImport() {
  if (!importText.value.trim()) return;
  // Map 导入的是键值对，直接当作请求头填充
  if (importTab.value === 'map') {
    const kv = parseMap(importText.value);
    headers.value = [...headers.value, ...kv];
    message.success(t('tools.api-tester.texts.msg-import-ok'));
    return;
  }
  let req: ReturnType<typeof parseCurl>;
  try {
    if (importTab.value === 'curl') req = parseCurl(importText.value);
    else if (importTab.value === 'powershell') req = parsePowerShell(importText.value);
    else req = parseFetch(importText.value);
  } catch {
    message.error(t('tools.api-tester.texts.msg-import-fail'));
    return;
  }
  applyParsed(req);
  message.success(t('tools.api-tester.texts.msg-import-ok'));
}

function applyParsed(req: ReturnType<typeof parseCurl>) {
  if (req.method) method.value = req.method;
  if (req.baseUrl) baseUrl.value = req.baseUrl;
  if (req.queryParams.length) queryParams.value = req.queryParams;
  if (req.headers.length) headers.value = req.headers;
  if (req.contentType) contentType.value = req.contentType;
  bodyMode.value = req.bodyMode;
  if (req.bodyMode === 'form') {
    formParams.value = req.formParams;
    body.value = '';
  } else if (req.bodyMode === 'raw') {
    body.value = req.body;
    formParams.value = [];
  } else {
    body.value = '';
    formParams.value = [];
  }
}

// ---- 组装请求 ----
function buildRequest(): ApiRequest {
  let finalUrl = (baseUrl.value || '').trim();
  try {
    const u = new URL(finalUrl);
    for (const p of queryParams.value) if (p.key) u.searchParams.append(p.key, p.value || '');
    finalUrl = u.toString();
  } catch {
    // 非法 URL 由发送时统一捕获
  }
  const hdrs: KeyValue[] = headers.value.filter((h) => h.key).map((h) => ({ key: h.key, value: h.value || '' }));
  let bodyStr: string | null = null;
  if (method.value !== 'GET' && method.value !== 'HEAD') {
    if (bodyMode.value === 'form') {
      const parts = formParams.value
        .filter((p) => p.key)
        .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value || '')}`);
      bodyStr = parts.join('&');
      if (!hdrs.some((h) => h.key.toLowerCase() === 'content-type')) {
        hdrs.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
      }
    } else if (bodyMode.value === 'raw' && body.value) {
      bodyStr = body.value;
      if (!hdrs.some((h) => h.key.toLowerCase() === 'content-type')) {
        hdrs.push({ key: 'Content-Type', value: contentType.value });
      }
    }
  }
  return { method: method.value, url: finalUrl, headers: hdrs, body: bodyStr };
}

// ---- 发送 ----
const inprogress = ref(false);
const error = ref('');
const result = ref<{
  status: number;
  statusText: string;
  elapsedMs: number | null;
  requestHeaders: KeyValue[];
  responseHeaders: [string, string][];
  body: string;
  proxy: boolean;
} | null>(null);

async function callAPI() {
  inprogress.value = true;
  error.value = '';
  result.value = null;
  try {
    const req = buildRequest();
    // 提前校验 URL（原 bug：new URL 在 try 外，空/非法 URL 直接崩）
    new URL(req.url);

    if (useProxy.value) {
      const r = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers.map((h) => [h.key, h.value] as [string, string]),
          body: req.body,
        }),
      });
      if (!r.ok) {
        if (r.status === 404) {
          throw new Error(t('tools.api-tester.texts.msg-proxy-unavailable'));
        }
        const e = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(e.error || `代理请求失败: ${r.status}`);
      }
      const data = await r.json();
      let bodyText = data.body || '';
      if (data.bodyEncoding === 'base64') {
        try {
          bodyText = atob(bodyText);
        } catch {
          bodyText = `(${t('tools.api-tester.texts.binary-content')})`;
        }
      }
      const respHeaders: [string, string][] = Object.entries(data.headers || {}).map(([k, v]) => [k, String(v)]);
      result.value = {
        status: data.status,
        statusText: data.statusText,
        elapsedMs: data.elapsedMs ?? null,
        requestHeaders: req.headers,
        responseHeaders: respHeaders,
        body: bodyText,
        proxy: true,
      };
    } else {
      const r = await fetch(req.url, {
        method: req.method,
        headers: req.headers.map((h) => [h.key, h.value] as [string, string]),
        body: req.body,
        mode: 'cors',
      });
      const respHeaders: [string, string][] = [];
      r.headers.forEach((v, k) => respHeaders.push([k, v]));
      const bodyText = await r.text();
      result.value = {
        status: r.status,
        statusText: r.statusText,
        elapsedMs: null,
        requestHeaders: req.headers,
        responseHeaders: respHeaders,
        body: bodyText,
        proxy: false,
      };
    }
  } catch (e: any) {
    // 请求本身失败（网络 / 跨域 / URL 非法 / 代理不可用）才进这里
    error.value = e?.message || String(e);
  } finally {
    inprogress.value = false;
  }
}

// ---- 响应展示 ----
const responseView = ref<'pretty' | 'raw'>('pretty');
const displayBody = computed(() => {
  const b = result.value?.body ?? '';
  if (responseView.value === 'pretty') {
    try {
      return JSON.stringify(JSON.parse(b), null, 2);
    } catch {
      return b;
    }
  }
  return b;
});
function headersToText(list: [string, string][]): string {
  return list.map(([k, v]) => `${k}: ${v}`).join('\n');
}
function reqHeadersToText(): string {
  return (result.value?.requestHeaders ?? []).map((h) => `${h.key}: ${h.value}`).join('\n');
}
const statusType = computed(() => {
  const s = result.value?.status ?? 0;
  if (s >= 200 && s < 300) return 'success';
  if (s >= 300 && s < 400) return 'warning';
  if (s >= 400) return 'error';
  return 'info';
});

// ---- 代码生成 ----
const codeLang = ref<CodeLang>('python');
const codeOutput = computed(() => generateCode(codeLang.value, buildRequest()));

// ---- 场景示例（中文说明，主站以中文为主） ----
const examples = [
  {
    title: 'GET 公开 JSON 接口',
    desc: 'JSONPlaceholder 单条待办，支持浏览器直连（已允许跨域）',
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/todos/1',
    headers: [],
    query: [],
    body: '',
    bodyMode: 'none' as BodyMode,
  },
  {
    title: 'POST 创建资源',
    desc: 'JSONPlaceholder 新建帖子，Content-Type 为 application/json',
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    query: [],
    body: '{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}',
    bodyMode: 'raw' as BodyMode,
  },
  {
    title: 'GET GitHub API',
    desc: '获取仓库信息，带 Accept 头；需服务端代理或 GitHub 允许跨域',
    method: 'GET',
    url: 'https://api.github.com/repos/bkzy333/it-tools',
    headers: [{ key: 'Accept', value: 'application/vnd.github+json' }],
    query: [],
    body: '',
    bodyMode: 'none' as BodyMode,
  },
  {
    title: 'GET 回显请求头',
    desc: 'httpbin 返回本次请求携带的头，便于调试',
    method: 'GET',
    url: 'https://httpbin.org/headers',
    headers: [],
    query: [],
    body: '',
    bodyMode: 'none' as BodyMode,
  },
  {
    title: 'POST 回显请求体',
    desc: 'httpbin 原样返回请求体，验证 JSON 发送是否正确',
    method: 'POST',
    url: 'https://httpbin.org/post',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    query: [],
    body: '{"hello": "world"}',
    bodyMode: 'raw' as BodyMode,
  },
];
function loadExample(eg: (typeof examples)[number]) {
  method.value = eg.method;
  baseUrl.value = eg.url;
  headers.value = eg.headers.map((h) => ({ ...h }));
  queryParams.value = [];
  contentType.value = 'application/json';
  bodyMode.value = eg.bodyMode;
  body.value = eg.body;
  formParams.value = [];
}
</script>

<template>
  <div>
    <!-- 请求配置 -->
    <c-card :title="t('tools.api-tester.texts.section-request')">
      <c-input-text
        v-model:value="baseUrl"
        :label="t('tools.api-tester.texts.label-url')"
        :placeholder="t('tools.api-tester.texts.placeholder-url')"
        mb-2
      />

      <div flex items-center gap-3 mb-2>
        <c-select
          v-model:value="method"
          :label="t('tools.api-tester.texts.label-method')"
          :options="METHODS"
          w-40
        />
        <c-select
          v-if="bodyMode === 'raw'"
          v-model:value="contentType"
          :label="t('tools.api-tester.texts.label-content-type')"
          :options="CONTENT_TYPES"
          flex-1
        />
      </div>

      <n-switch v-model:value="useProxy" mb-1>
        <template #checked> {{ t('tools.api-tester.texts.label-use-proxy-on') }} </template>
        <template #unchecked> {{ t('tools.api-tester.texts.label-use-proxy-off') }} </template>
      </n-switch>
      <p text-13px op-70 mb-2>{{ t('tools.api-tester.texts.tip-proxy') }}</p>

      <n-tabs type="line" animated>
        <!-- 查询参数 -->
        <n-tab-pane name="query" :tab="t('tools.api-tester.texts.tab-query')">
          <n-dynamic-input v-model:value="queryParams" :on-create="emptyKeyPair">
            <template #create-button-default>
              {{ t('tools.api-tester.texts.tag-add-param') }}
            </template>
            <template #default="{ value }">
              <div v-if="value" w-100 flex justify-center gap-2>
                <c-input-text v-model:value="value.key" :placeholder="t('tools.api-tester.texts.placeholder-param-name')" />
                <c-input-text v-model:value="value.value" :placeholder="t('tools.api-tester.texts.placeholder-value')" />
              </div>
            </template>
          </n-dynamic-input>
          <n-button text type="primary" mt-2 @click="showBatchQuery = !showBatchQuery">
            {{ t('tools.api-tester.texts.btn-batch-add') }}
          </n-button>
          <div v-if="showBatchQuery" mt-2>
            <c-input-text
              v-model:value="batchQueryText"
              :placeholder="t('tools.api-tester.texts.placeholder-batch-kv')"
              multiline
              monospace
              rows="4"
            />
            <div flex gap-2 mt-2>
              <c-button secondary @click="applyBatchQuery">{{ t('tools.api-tester.texts.btn-apply') }}</c-button>
              <c-button secondary @click="showBatchQuery = false">{{ t('tools.api-tester.texts.btn-cancel') }}</c-button>
            </div>
          </div>
        </n-tab-pane>

        <!-- 请求头 -->
        <n-tab-pane name="headers" :tab="t('tools.api-tester.texts.tab-headers')">
          <n-dynamic-input v-model:value="headers" :on-create="emptyKeyPair">
            <template #create-button-default>
              {{ t('tools.api-tester.texts.tag-add-header') }}
            </template>
            <template #default="{ value }">
              <div v-if="value" w-100 flex justify-center gap-2>
                <c-input-text v-model:value="value.key" :placeholder="t('tools.api-tester.texts.placeholder-header-name')" />
                <c-input-text v-model:value="value.value" :placeholder="t('tools.api-tester.texts.placeholder-value')" />
              </div>
            </template>
          </n-dynamic-input>
          <n-button text type="primary" mt-2 @click="showBatchHeaders = !showBatchHeaders">
            {{ t('tools.api-tester.texts.btn-batch-add') }}
          </n-button>
          <div v-if="showBatchHeaders" mt-2>
            <c-input-text
              v-model:value="batchHeadersText"
              :placeholder="t('tools.api-tester.texts.placeholder-batch-headers')"
              multiline
              monospace
              rows="4"
            />
            <div flex gap-2 mt-2>
              <c-button secondary @click="applyBatchHeaders">{{ t('tools.api-tester.texts.btn-apply') }}</c-button>
              <c-button secondary @click="showBatchHeaders = false">{{ t('tools.api-tester.texts.btn-cancel') }}</c-button>
            </div>
          </div>
        </n-tab-pane>

        <!-- 请求体 -->
        <n-tab-pane name="body" :tab="t('tools.api-tester.texts.tab-body')">
          <c-select
            v-model:value="bodyMode"
            :label="t('tools.api-tester.texts.label-body-mode')"
            :options="[
              { label: t('tools.api-tester.texts.body-mode-none'), value: 'none' },
              { label: t('tools.api-tester.texts.body-mode-form'), value: 'form' },
              { label: t('tools.api-tester.texts.body-mode-raw'), value: 'raw' },
            ]"
            mb-2
          />
          <n-dynamic-input v-if="bodyMode === 'form'" v-model:value="formParams" :on-create="emptyKeyPair">
            <template #create-button-default>
              {{ t('tools.api-tester.texts.tag-add-param') }}
            </template>
            <template #default="{ value }">
              <div v-if="value" w-100 flex justify-center gap-2>
                <c-input-text v-model:value="value.key" :placeholder="t('tools.api-tester.texts.placeholder-param-name')" />
                <c-input-text v-model:value="value.value" :placeholder="t('tools.api-tester.texts.placeholder-value')" />
              </div>
            </template>
          </n-dynamic-input>
          <template v-else-if="bodyMode === 'raw'">
            <div flex justify-end gap-2 mb-2>
              <c-button secondary @click="formatJson">{{ t('tools.api-tester.texts.btn-format-json') }}</c-button>
              <c-button secondary @click="compressJson">{{ t('tools.api-tester.texts.btn-compress-json') }}</c-button>
            </div>
            <c-input-text
              v-model:value="body"
              :label="t('tools.api-tester.texts.label-body')"
              :placeholder="t('tools.api-tester.texts.placeholder-body')"
              multiline
              monospace
              rows="8"
            />
          </template>
          <p v-else text-13px op-70>{{ t('tools.api-tester.texts.body-mode-none-hint') }}</p>
        </n-tab-pane>

        <!-- 导入 -->
        <n-tab-pane name="import" :tab="t('tools.api-tester.texts.tab-import')">
          <n-tabs type="segment" v-model:value="importTab" size="small" mb-2>
            <n-tab-pane name="curl" :tab="t('tools.api-tester.texts.import-curl')" />
            <n-tab-pane name="powershell" :tab="t('tools.api-tester.texts.import-powershell')" />
            <n-tab-pane name="fetch" :tab="t('tools.api-tester.texts.import-fetch')" />
            <n-tab-pane name="map" :tab="t('tools.api-tester.texts.import-map')" />
          </n-tabs>
          <c-input-text
            v-model:value="importText"
            :placeholder="t('tools.api-tester.texts.placeholder-import')"
            multiline
            monospace
            rows="6"
          />
          <p text-13px op-70 mt-1 mb-2>{{ t('tools.api-tester.texts.tip-import-map') }}</p>
          <c-button secondary @click="doImport">{{ t('tools.api-tester.texts.btn-parse-import') }}</c-button>
        </n-tab-pane>
      </n-tabs>

      <div mt-5 flex justify-center>
        <c-button secondary :disabled="inprogress" @click="callAPI">
          {{ t('tools.api-tester.texts.btn-send') }}
        </c-button>
      </div>
    </c-card>

    <n-spin v-if="inprogress" size="small" />

    <!-- 错误 -->
    <c-alert
      v-if="!inprogress && error"
      type="error"
      mt-12
      :title="t('tools.api-tester.texts.title-error')"
    >
      <p>{{ error }}</p>
    </c-alert>

    <!-- 响应结果 -->
    <c-card v-if="!inprogress && result" mt-12 :title="t('tools.api-tester.texts.title-response')">
      <n-space align="center" mb-3>
        <n-tag :type="statusType" size="large">{{ result.status }} {{ result.statusText }}</n-tag>
        <n-tag v-if="result.elapsedMs != null" :bordered="false">{{ result.elapsedMs }} ms</n-tag>
        <n-tag v-if="result.proxy" :bordered="false">{{ t('tools.api-tester.texts.tag-proxy') }}</n-tag>
      </n-space>

      <n-tabs type="line" animated>
        <n-tab-pane :tab="t('tools.api-tester.texts.tab-response-headers')" name="resp">
          <div flex justify-end mb-2>
            <c-button secondary @click="copyText(headersToText(result.responseHeaders))">
              {{ t('tools.api-tester.texts.btn-copy') }}
            </c-button>
          </div>
          <TextareaCopyable :value="headersToText(result.responseHeaders)" word-wrap />
        </n-tab-pane>

        <n-tab-pane :tab="t('tools.api-tester.texts.tab-request-headers')" name="req">
          <div flex justify-end mb-2>
            <c-button secondary @click="copyText(reqHeadersToText())">
              {{ t('tools.api-tester.texts.btn-copy') }}
            </c-button>
          </div>
          <TextareaCopyable :value="reqHeadersToText()" word-wrap />
        </n-tab-pane>

        <n-tab-pane :tab="t('tools.api-tester.texts.tab-response-body')" name="body">
          <div flex justify-end gap-2 mb-2>
            <n-radio-group v-model:value="responseView" size="small">
              <n-radio value="pretty">{{ t('tools.api-tester.texts.response-view-pretty') }}</n-radio>
              <n-radio value="raw">{{ t('tools.api-tester.texts.response-view-raw') }}</n-radio>
            </n-radio-group>
            <c-button secondary @click="copyText(displayBody)">{{ t('tools.api-tester.texts.btn-copy') }}</c-button>
          </div>
          <TextareaCopyable :value="displayBody" word-wrap download-file-name="response.txt" />
        </n-tab-pane>
      </n-tabs>
    </c-card>

    <!-- 代码生成 -->
    <c-card mt-12 :title="t('tools.api-tester.texts.title-codegen')">
      <p text-13px op-70 mb-2>{{ t('tools.api-tester.texts.tip-codegen') }}</p>
      <n-tabs type="segment" v-model:value="codeLang" size="small">
        <n-tab-pane v-for="lang in CODE_LANGS" :key="lang.value" :name="lang.value" :tab="lang.label" />
      </n-tabs>
      <TextareaCopyable :value="codeOutput" word-wrap />
    </c-card>

    <!-- 场景示例 / 操作说明 / 跨域说明 -->
    <c-card mt-12 :title="t('tools.api-tester.texts.title-examples')">
      <n-collapse :default-expanded-names="['eg']">
        <n-collapse-item :title="t('tools.api-tester.texts.collapse-examples')" name="eg">
          <n-space vertical>
            <div v-for="(eg, i) in examples" :key="i" border rounded p-3>
              <div flex items-center justify-between>
                <div>
                  <strong>{{ eg.title }}</strong>
                  <div text-13px op-70>{{ eg.desc }}</div>
                </div>
                <c-button secondary @click="loadExample(eg)">{{ t('tools.api-tester.texts.btn-load-example') }}</c-button>
              </div>
            </div>
          </n-space>
        </n-collapse-item>
        <n-collapse-item :title="t('tools.api-tester.texts.title-guide')" name="guide">
          <pre whitespace-pre-wrap text-13px>{{ t('tools.api-tester.texts.guide-text') }}</pre>
        </n-collapse-item>
        <n-collapse-item :title="t('tools.api-tester.texts.title-cors')" name="cors">
          <pre whitespace-pre-wrap text-13px>{{ t('tools.api-tester.texts.cors-text') }}</pre>
        </n-collapse-item>
      </n-collapse>
    </c-card>
  </div>
</template>
