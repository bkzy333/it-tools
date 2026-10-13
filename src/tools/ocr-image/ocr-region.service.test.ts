import { describe, it, expect } from 'vitest';
import { computeInkBBox, clampRect } from './ocr-region.service';

// 构造一张 RGBA 图：fill 为填充色，marks 为需要点亮的像素坐标（置为 ink 色）
function makeImage(width: number, height: number, fill: [number, number, number], marks?: Map<string, [number, number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = 255;
  }
  if (marks) {
    for (const [key, color] of marks) {
      const [x, y] = key.split(',').map(Number);
      const o = (y * width + x) * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }
  }
  return data;
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe('computeInkBBox', () => {
  it('在亮底上检测到单个暗点，返回其包围盒', () => {
    const marks = new Map<string, [number, number, number]>([['1,1', BLACK]]);
    const r = computeInkBBox(makeImage(4, 4, WHITE, marks), 4, 4);
    expect(r).not.toBeNull();
    // 4x4、margin 四舍五入为 0，暗点(1,1) → 中心 0.25
    expect(r!.x).toBeCloseTo(0.25, 5);
    expect(r!.y).toBeCloseTo(0.25, 5);
    expect(r!.w).toBeCloseTo(0.25, 5);
    expect(r!.h).toBeCloseTo(0.25, 5);
  });

  it('全白图（无墨迹）返回 null', () => {
    expect(computeInkBBox(makeImage(4, 4, WHITE), 4, 4)).toBeNull();
  });

  it('全黑图（暗底无亮字）返回 null', () => {
    expect(computeInkBBox(makeImage(4, 4, BLACK), 4, 4)).toBeNull();
  });

  it('暗底上的亮字也能检测（反向墨迹）', () => {
    const marks = new Map<string, [number, number, number]>([['2,2', WHITE]]);
    const r = computeInkBBox(makeImage(4, 4, BLACK, marks), 4, 4);
    expect(r).not.toBeNull();
    expect(r!.x).toBeCloseTo(0.5, 5);
    expect(r!.y).toBeCloseTo(0.5, 5);
  });

  it('居中小块会外扩 margin（100x100，块 40~59）', () => {
    const marks = new Map<string, [number, number, number]>();
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) {
        marks.set(`${x},${y}`, BLACK);
      }
    }
    const r = computeInkBBox(makeImage(100, 100, WHITE, marks), 100, 100)!;
    // margin = round(100*0.02) = 2 → 38~61，宽 = (61-38+1)/100 = 0.24
    expect(r.x).toBeCloseTo(0.38, 2);
    expect(r.y).toBeCloseTo(0.38, 2);
    expect(r.w).toBeCloseTo(0.24, 2);
    expect(r.h).toBeCloseTo(0.24, 2);
  });

  it('墨迹占比过低（稀疏噪点）回退 null，避免框选到无意义小点', () => {
    const marks = new Map<string, [number, number, number]>([['50,50', BLACK]]);
    // 100x100 上仅 1 个暗点 → 占比 0.0001 < 0.002 下限 → null
    expect(computeInkBBox(makeImage(100, 100, WHITE, marks), 100, 100)).toBeNull();
  });
});

describe('clampRect', () => {
  it('把越界矩形夹回合法范围', () => {
    const r = clampRect({ x: -0.1, y: 0.5, w: 1.5, h: 0.02 });
    expect(r.x).toBe(0);
    expect(r.w).toBe(1);
    expect(r.h).toBeGreaterThanOrEqual(0.05);
  });
});
