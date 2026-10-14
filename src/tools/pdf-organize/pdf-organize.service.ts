// PDF 页面整理 / 拆分 —— 后端用已自托管的 qpdf-wasm（Apache-2.0，同域加载，中国可用）
// 仅暴露 CLI：createQPDFModule -> FS.writeFile -> callMain(argv) -> FS.readFile
import createQPDFModule from 'qpdf-wasm-esm-embedded';

export interface SplitFile {
  name: string;
  bytes: Uint8Array;
}

async function runQpdf(
  inputName: string,
  inputBytes: Uint8Array,
  args: string[],
  outputName: string,
): Promise<Uint8Array> {
  const mod = await createQPDFModule({
    print() {},
    printErr() {},
  });
  mod.FS.writeFile(inputName, inputBytes);
  const ret = mod.callMain(args);
  if (ret !== 0) {
    throw new Error('PDF 处理失败（qpdf 退出码 ' + ret + '）');
  }
  return mod.FS.readFile(outputName);
}

function fmtRotate(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) {
    return '';
  }
  return (d > 0 && d < 180 ? '+' : '') + d;
}

/**
 * 整理：按最终顺序输出，删除项已在前端排除；rotation 按原始页码施加。
 * order = 最终输出顺序（原始页码数组）；rotations = { 原始页码: 角度 }
 */
export async function organizePdf(
  bytes: Uint8Array,
  order: number[],
  rotations: Record<number, number>,
): Promise<Uint8Array> {
  if (!order.length) {
    throw new Error('请至少保留一页');
  }
  // 注意：--rotate 等通用选项必须放在 --pages 之前，否则会被当成 --pages 的文件参数而失败
  const args: string[] = [];
  for (const key of Object.keys(rotations)) {
    const deg = rotations[Number(key)];
    const r = fmtRotate(deg);
    if (r) {
      args.push(`--rotate=${r}:${key}`);
    }
  }
  args.push('--empty', '--pages', 'in.pdf', order.join(','), '--', 'out.pdf');
  return runQpdf('in.pdf', bytes, args, 'out.pdf');
}

/** 拆分：every=每 N 页一组；each=选中页各成一文件 */
export async function splitPdf(
  bytes: Uint8Array,
  totalPages: number,
  mode: 'every' | 'each',
  everyN: number,
  selected: number[],
): Promise<SplitFile[]> {
  const groups: number[][] = [];
  if (mode === 'every') {
    const n = Math.max(1, everyN);
    for (let i = 1; i <= totalPages; i += n) {
      const g: number[] = [];
      for (let j = 0; j < n && i + j <= totalPages; j++) {
        g.push(i + j);
      }
      groups.push(g);
    }
  } else {
    for (const p of selected) {
      groups.push([p]);
    }
  }
  if (!groups.length) {
    throw new Error('没有可拆分的内容');
  }
  const out: SplitFile[] = [];
  for (let i = 0; i < groups.length; i++) {
    const args = ['--empty', '--pages', 'in.pdf', groups[i].join(','), '--', `o${i}.pdf`];
    const b = await runQpdf('in.pdf', bytes, args, `o${i}.pdf`);
    out.push({ name: `split-${String(i + 1).padStart(2, '0')}.pdf`, bytes: b });
  }
  return out;
}
