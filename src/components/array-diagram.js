/**
 * 阵列排布的俯视示意图：按算出的排数、每排组件数画方块。
 * 为了可读性，最多画 6 排、每排最多 24 块，超出部分用文字说明。
 */

const MAX_ROWS = 6;
const MAX_PER_ROW = 24;

export function arrayDiagramSvg(plan) {
  const rows = Math.min(plan.rows, MAX_ROWS);
  const perRow = Math.min(plan.modulesPerRow, MAX_PER_ROW);

  if (rows === 0 || perRow === 0) {
    return '<p class="diagram-empty">当前场地放不下完整阵列，请调整场地尺寸或倾角。</p>';
  }

  const blockWidth = 26;
  const blockHeight = 14;
  const gap = 3;
  const rowGap = 22;
  const padding = 14;
  const width = padding * 2 + perRow * (blockWidth + gap) - gap;
  const height = padding * 2 + rows * (blockHeight + rowGap) - rowGap;

  const blocks = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < perRow; column += 1) {
      const x = padding + column * (blockWidth + gap);
      const y = padding + row * (blockHeight + rowGap);
      blocks.push(
        `<rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" rx="2" class="module-block" />`
      );
    }
  }

  const truncated = [];
  if (plan.rows > MAX_ROWS) truncated.push(`排数 ${plan.rows}（示意前 ${MAX_ROWS} 排）`);
  if (plan.modulesPerRow > MAX_PER_ROW) {
    truncated.push(`每排 ${plan.modulesPerRow} 块（示意前 ${MAX_PER_ROW} 块）`);
  }
  const note = truncated.length > 0 ? `<p class="diagram-note">${truncated.join('，')}</p>` : '';

  return `
    <svg class="array-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="阵列排布俯视示意图">
      ${blocks.join('')}
    </svg>
    <p class="diagram-caption">俯视示意：共 ${plan.rows} 排，每排 ${plan.modulesPerRow} 块，合计 ${plan.totalModules} 块</p>
    ${note}
  `;
}
