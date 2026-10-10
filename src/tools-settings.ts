import { appBaseUrl as base } from '@/utils/base-url';

// Optional per-deployment settings. Lives in its own top-level-await module so the
// fetch runs concurrently with the config fetches in src/tools/index.ts (sibling async
// module subgraphs evaluate in parallel) instead of serially after them.
// `Record<string, any> | any` 中的 any 会吞掉整个联合，统一写成 any
export const toolsSettings: Record<string, any> = await fetch(`${base}tools-settings.json`)
  .then((response) => (response.ok ? (response.json() as Promise<Record<string, any>>) : {}))
  .catch(() => ({}));
