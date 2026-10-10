import { getITToolsSetting, useITStorage } from '@/composable/queryParams';
import { ref } from 'vue';

export function useNetworkUtilsConfig({
  urlStorageKey,
  authStorageKey,
  defaultUrl = 'http://localhost:8000',
}: {
  urlStorageKey: string;
  authStorageKey: string;
  defaultUrl?: string;
}) {
  // 设置项来源是 JSON，取值可能是字符串也可能是对象/数字。
  // 只有字符串才当配置用，否则会拿 "[object Object]" 去当服务地址。
  const asConfigText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const fixedUrl = asConfigText(getITToolsSetting(urlStorageKey, '') || '');
  const fixedAuth = asConfigText(getITToolsSetting(authStorageKey, '') || '');
  const hasFixedConfig = Boolean(fixedUrl);

  return {
    serverHost: hasFixedConfig ? ref(fixedUrl) : useITStorage(urlStorageKey, defaultUrl),
    serverAuth: hasFixedConfig ? ref(fixedAuth) : useITStorage(authStorageKey, ''),
    hasFixedConfig,
  };
}
