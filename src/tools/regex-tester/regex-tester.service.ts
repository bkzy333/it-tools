interface RegExpGroupIndices {
  [name: string]: [number, number];
}
interface RegExpIndices extends Array<[number, number]> {
  groups: RegExpGroupIndices;
}
interface RegExpExecArrayWithIndices extends RegExpExecArray {
  indices: RegExpIndices;
}
interface GroupCapture {
  name: string;
  value: string;
  start: number;
  end: number;
}

/**
 * 逐条跑出所有匹配。
 *
 * limit 是给超大文本兜底的上限：一万条以上的匹配列表既渲染不动也没人看，
 * 与其让主线程卡住，不如截断（页面会提示「仅显示前 N 条」）。
 */
export function matchRegex(regex: string, text: string, flags: string, limit = 5000) {
  // if (regex === '' || text === '') {
  //   return [];
  // }

  let lastIndex = -1;
  const re = new RegExp(regex, flags);
  const results = [];
  let match = re.exec(text) as RegExpExecArrayWithIndices;
  while (match !== null) {
    if (re.lastIndex === lastIndex || match[0] === '') {
      break;
    }
    const indices = match.indices;
    const captures: Array<GroupCapture> = [];
    Object.entries(match).forEach(([captureName, captureValue]) => {
      if (captureName !== '0' && captureName.match(/\d+/)) {
        const captureIndices = indices[Number(captureName)] || [-1, -1];
        captures.push({
          name: captureName,
          value: captureValue,
          start: captureIndices[0],
          end: captureIndices[1],
        });
      }
    });
    const groups: Array<GroupCapture> = [];
    Object.entries(match.groups || {}).forEach(([groupName, groupValue]) => {
      const groupIndices = indices.groups[groupName] || [-1, -1];
      groups.push({
        name: groupName,
        value: groupValue,
        start: groupIndices[0],
        end: groupIndices[1],
      });
    });
    results.push({
      index: match.index,
      value: match[0],
      captures,
      groups,
    });
    if (results.length >= limit) {
      break;
    }
    lastIndex = re.lastIndex;
    match = re.exec(text) as RegExpExecArrayWithIndices;
  }
  return results;
}
