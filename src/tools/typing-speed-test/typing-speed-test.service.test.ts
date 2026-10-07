import { expect, describe, it } from 'vitest';
import {
  bestAccuracy,
  bestWpm,
  buildTargetText,
  collectErrorKeys,
  computeMetrics,
  countCorrect,
  getLevel,
  isCompletedEarly,
  MAX_RECORDS,
  metricsFromCounts,
  pickSample,
  progressPercent,
  pushRecord,
  resolveDurationSeconds,
  SAMPLES_EN,
  SAMPLES_ZH,
  topErrorKeys,
  type TypingRecord,
} from './typing-speed-test.service';

/**
 * 这些用例直接对应参考站 gjupai.com/tools/typing_speed 的行为规格
 * （从它的前端 chunk 反编译得来）。期望值都是按它的公式手算的，
 * 不是"跑一遍看输出对不对"倒推出来的。
 */
describe('typing-speed-test', () => {
  describe('resolveDurationSeconds', () => {
    it('固定档位换算成秒', () => {
      expect(resolveDurationSeconds(1, 999)).toBe(60);
      expect(resolveDurationSeconds(3, 999)).toBe(180);
      expect(resolveDurationSeconds(5, 999)).toBe(300);
    });

    it('自定义时长夹在 10~1800 秒', () => {
      expect(resolveDurationSeconds('custom', 5)).toBe(10);
      expect(resolveDurationSeconds('custom', 60)).toBe(60);
      expect(resolveDurationSeconds('custom', 9999)).toBe(1800);
    });

    it('非法值退化成 60 秒', () => {
      expect(resolveDurationSeconds('custom', Number.NaN)).toBe(60);
      expect(resolveDurationSeconds('custom', 0)).toBe(60);
    });
  });

  describe('buildTargetText', () => {
    it('自定义模式截断到 1000 字，且不做任何清洗', () => {
      const input = 'A'.repeat(1200);
      expect(buildTargetText({
        mode: 'custom',
        sample: '不会用到',
        customText: input,
        lang: 'zh',
        includePunctuation: false,
        includeUppercase: false,
      })).toHaveLength(1000);
    });

    it('中文去标点：只删中文标点，保留文字', () => {
      expect(buildTargetText({
        mode: 'random',
        sample: '不积跬步，无以至千里。',
        customText: '',
        lang: 'zh',
        includePunctuation: false,
        includeUppercase: true,
      })).toBe('不积跬步无以至千里');
    });

    it('英文去标点：顺带把连续空白压成一个空格并 trim', () => {
      expect(buildTargetText({
        mode: 'random',
        sample: 'Hello,  World! ',
        customText: '',
        lang: 'en',
        includePunctuation: false,
        includeUppercase: true,
      })).toBe('Hello World');
    });

    it('英文取消「包含大写」时整体转小写；中文不受这个选项影响', () => {
      expect(buildTargetText({
        mode: 'random',
        sample: 'The Quick Fox',
        customText: '',
        lang: 'en',
        includePunctuation: true,
        includeUppercase: false,
      })).toBe('the quick fox');

      expect(buildTargetText({
        mode: 'random',
        sample: '中文ABC',
        customText: '',
        lang: 'zh',
        includePunctuation: true,
        includeUppercase: false,
      })).toBe('中文ABC');
    });
  });

  describe('pickSample', () => {
    it('注入的随机数可复现，且落在语料范围内', () => {
      expect(pickSample('zh', () => 0)).toBe(SAMPLES_ZH[0]);
      expect(pickSample('en', () => 0.999)).toBe(SAMPLES_EN[SAMPLES_EN.length - 1]);
      expect(SAMPLES_ZH).toContain(pickSample('zh', () => 0.5));
    });
  });

  describe('countCorrect', () => {
    it('只比到较短的长度', () => {
      expect(countCorrect('abcdef', 'abc')).toBe(3);
      expect(countCorrect('abc', 'abcdef')).toBe(3);
    });

    it('错位即判错，不会因为后面又对上而补回来', () => {
      expect(countCorrect('abcd', 'abxd')).toBe(3);
    });
  });

  describe('computeMetrics', () => {
    it('未开始：全 0，准确率 100', () => {
      expect(computeMetrics('不积跬步无以至千里', '', 0)).toEqual({
        correct: 0,
        errors: 0,
        wpm: 0,
        cpm: 0,
        accuracy: 100,
      });
    });

    it('60 秒打对 60 个字符：WPM 12 / CPM 60 / 准确率 100', () => {
      const target = 'x'.repeat(60);
      expect(computeMetrics(target, target, 60)).toEqual({
        correct: 60,
        errors: 0,
        wpm: 12,
        cpm: 60,
        accuracy: 100,
      });
    });

    it('30 秒打对 50 个字符：WPM 20 / CPM 100（分钟数 = 0.5）', () => {
      const target = 'x'.repeat(50);
      expect(computeMetrics(target, target, 30)).toEqual({
        correct: 50,
        errors: 0,
        wpm: 20,
        cpm: 100,
        accuracy: 100,
      });
    });

    it('打了 20 个其中错 2 个：错误数 2、准确率 90%', () => {
      const target = 'a'.repeat(20);
      const typed = `${'a'.repeat(10)}XX${'a'.repeat(8)}`;
      const m = computeMetrics(target, typed, 20);
      expect(m.correct).toBe(18);
      expect(m.errors).toBe(2);
      expect(m.accuracy).toBe(90);
    });

    it('第 0 秒按 1 秒算，不会出现除零（max(q,1)）', () => {
      const m = computeMetrics('abcde', 'abcde', 0);
      expect(Number.isFinite(m.wpm)).toBe(true);
      // correct=5, minutes=1/60 → wpm = 5/5*60 = 60
      expect(m.wpm).toBe(60);
    });

    it('准确率的分母是已输入长度而不是目标长度', () => {
      // 目标 100 字，只打了 10 个全对 → 准确率 100%，不是 10%
      expect(computeMetrics('a'.repeat(100), 'a'.repeat(10), 10).accuracy).toBe(100);
    });
  });

  describe('metricsFromCounts', () => {
    it('绕过文本比对，直接用已结算的正确数与长度算（输入法组合期用这个）', () => {
      // 20 秒打了 20 个字符，对 18 个 → 分钟数 1/3 → wpm = 18/5*3 = 10.8
      expect(metricsFromCounts(18, 20, 20)).toEqual({
        correct: 18,
        errors: 2,
        wpm: 11,
        cpm: 54,
        accuracy: 90,
      });
    });

    it('和 computeMetrics 口径一致：两者对同一组输入必须算出同一个结果', () => {
      // 目标 18 字，打入了 18 个，其中第 11、12 位打错 → 正确 16
      const target = 'a'.repeat(18);
      const typed = `${'a'.repeat(10)}XX${'a'.repeat(6)}`;
      const m = computeMetrics(target, typed, 20);
      expect(m.correct).toBe(16);
      expect(m).toEqual(metricsFromCounts(16, 18, 20));
      expect(m.accuracy).toBe(89);
    });
  });

  describe('getLevel', () => {
    it('中文阈值：40 / 80 / 120', () => {
      expect(getLevel(0, 'zh').label).toBe('入门');
      expect(getLevel(39, 'zh').label).toBe('入门');
      expect(getLevel(40, 'zh').label).toBe('熟练');
      expect(getLevel(79, 'zh').label).toBe('熟练');
      expect(getLevel(80, 'zh').label).toBe('快速');
      expect(getLevel(119, 'zh').label).toBe('快速');
      expect(getLevel(120, 'zh').label).toBe('专业');
    });

    it('英文阈值：20 / 40 / 60 / 80，比中文低一档', () => {
      expect(getLevel(19, 'en').label).toBe('入门');
      expect(getLevel(20, 'en').label).toBe('熟练');
      expect(getLevel(40, 'en').label).toBe('快速');
      expect(getLevel(60, 'en').label).toBe('专业');
      expect(getLevel(80, 'en').label).toBe('精英');
    });

    it('同样 45 WPM，中文评「熟练」、英文评「快速」', () => {
      expect(getLevel(45, 'zh').label).toBe('熟练');
      expect(getLevel(45, 'en').label).toBe('快速');
    });
  });

  describe('collectErrorKeys / topErrorKeys', () => {
    it('中文只记目标字', () => {
      expect(collectErrorKeys('不积跬步', '不积快步', 'zh')).toEqual({ 跬: 1 });
    });

    it('英文记「期望→实际」', () => {
      expect(collectErrorKeys('abc', 'axc', 'en')).toEqual({ 'b→x': 1 });
    });

    it('同一个错重复出现会累加，并按次数降序取 Top N', () => {
      const map = collectErrorKeys('aaaab', 'xxxxb', 'en');
      expect(map['a→x']).toBe(4);
      expect(topErrorKeys({ 'a→x': 4, 'c→y': 9, 'd→z': 1 }, 2)).toEqual([
        ['c→y', 9],
        ['a→x', 4],
      ]);
    });
  });

  describe('progressPercent', () => {
    it('取时间进度与输入进度的较大值', () => {
      // 时间过了 30%，但只打了 10% → 显示 30%
      expect(progressPercent(30, 100, 10, 100)).toBeCloseTo(30);
      // 打了 80%，时间才过 20% → 显示 80%
      expect(progressPercent(20, 100, 80, 100)).toBeCloseTo(80);
    });

    it('上限 100%，目标为空时是 0', () => {
      expect(progressPercent(200, 100, 100, 100)).toBe(100);
      expect(progressPercent(5, 60, 5, 0)).toBe(0);
    });
  });

  describe('isCompletedEarly', () => {
    it('打完且全对才算提前完成', () => {
      expect(isCompletedEarly('abc', 'abc', 3)).toBe(true);
      expect(isCompletedEarly('abc', 'abd', 2)).toBe(false);
      expect(isCompletedEarly('abc', 'ab', 2)).toBe(false);
    });

    it('目标为空时不算完成（否则自定义文本没填就会立刻结算）', () => {
      expect(isCompletedEarly('', '', 0)).toBe(false);
    });
  });

  describe('历史成绩', () => {
    const rec = (wpm: number, accuracy: number): TypingRecord => ({
      date: '2026-10-07T00:00:00.000Z',
      lang: 'zh',
      wpm,
      cpm: wpm * 5,
      accuracy,
      duration: 60,
    });

    it('新成绩插在最前面', () => {
      const list = pushRecord([rec(10, 90)], rec(20, 95));
      expect(list[0].wpm).toBe(20);
    });

    it('最多保留 20 条', () => {
      let list: TypingRecord[] = [];
      for (let i = 0; i < 30; i += 1) {
        list = pushRecord(list, rec(i, 90));
      }
      expect(list).toHaveLength(MAX_RECORDS);
      expect(list[0].wpm).toBe(29);
    });

    it('历史最佳取最大值，空列表是 0', () => {
      expect(bestWpm([rec(10, 90), rec(30, 80), rec(20, 99)])).toBe(30);
      expect(bestAccuracy([rec(10, 90), rec(30, 80), rec(20, 99)])).toBe(99);
      expect(bestWpm([])).toBe(0);
      expect(bestAccuracy([])).toBe(0);
    });
  });
});
