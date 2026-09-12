import { escapeHtml, formatMmToM, formatNumber } from '../format.js';
import { arrayDiagramSvg } from './array-diagram.js';

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

export function renderLayoutPanel(container, { module, plan }) {
  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>阵列排布与阴影间距</h3>
        <p class="card__sub">${escapeHtml(module.brand)} ${escapeHtml(module.model)} · 冬至日正午不遮挡口径</p>
      </div>
      <span class="badge badge--info">${formatNumber(plan.altitudeDeg, 2)}° 太阳高度角</span>
    </header>

    <div class="metrics">
      ${metric('冬至日正午太阳高度角', formatNumber(plan.altitudeDeg, 2), '°')}
      ${metric('阵列顶端高度', formatMmToM(plan.arrayHeightMm, 3))}
      ${metric('阴影长度', formatMmToM(plan.shadowLengthMm, 3))}
      ${metric('理论排距', formatMmToM(plan.rowPitchMm, 3))}
      ${metric('每排组件数', String(plan.modulesPerRow), '块')}
      ${metric('可排排数', String(plan.rows), '排')}
      ${metric('可装组件', String(plan.totalModules), '块')}
      ${metric('可装容量', formatNumber(plan.capacityKw, 2), 'kW')}
      ${metric('装机密度', formatNumber(plan.capacityDensityWPerM2, 1), 'W/m²')}
    </div>

    <div class="diagram-wrap">${arrayDiagramSvg(plan)}</div>

    <p class="card__note">
      场地进深占用 ${formatMmToM(plan.usedDepthMm, 2)}，占可用进深 ${formatNumber(plan.usageRatio, 1)}%；
      单排水平投影 ${formatMmToM(plan.projectionMm, 3)}。
    </p>
  `;
}
