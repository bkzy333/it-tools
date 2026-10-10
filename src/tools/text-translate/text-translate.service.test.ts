import { describe, expect, it } from 'vitest';
import { LANG_LABELS, TARGETS_FOR } from './text-translate.service';

describe('text-translate language matrix', () => {
  it('TARGETS_FOR 里的每个目标语言都有中文标签', () => {
    for (const targets of Object.values(TARGETS_FOR)) {
      for (const code of targets) {
        expect(LANG_LABELS[code], `缺少语言标签: ${code}`).toBeTruthy();
      }
    }
  });

  it('自动检测不能作为目标语言', () => {
    expect(TARGETS_FOR.auto).not.toContain('auto');
  });

  it('每种源语言的合法目标都不为空', () => {
    for (const [source, targets] of Object.entries(TARGETS_FOR)) {
      expect(targets.length, `${source} 的目标语言为空`).toBeGreaterThan(0);
    }
  });
});
