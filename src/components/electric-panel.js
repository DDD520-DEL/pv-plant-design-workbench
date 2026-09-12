import { escapeHtml, formatNumber } from '../format.js';

const STATUS_TEXT = {
  pass: '全部通过',
  warn: '通过，有提示项',
  fail: '存在不通过项'
};

function checkRow(item) {
  const compare = item.compare === 'lte' ? '≤' : '≥';
  const verdict = item.pass ? '通过' : item.level === 'warn' ? '提示' : '不通过';
  const rowClass = item.pass ? 'is-pass' : item.level === 'warn' ? 'is-warn' : 'is-fail';
  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(item.label)}</td>
      <td class="num">${formatNumber(item.actual, 2)}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}</td>
      <td class="num">${compare} ${formatNumber(item.limit, 2)}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}</td>
      <td class="num">${item.pass ? '—' : `${item.margin}%`}</td>
      <td><span class="tag tag--${rowClass}">${verdict}</span></td>
    </tr>
  `;
}

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

export function renderElectricPanel(container, { module, inverter, result }) {
  const { metrics, advice } = result;
  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>组串电气校核</h3>
        <p class="card__sub">${escapeHtml(module.brand)} ${escapeHtml(module.model)} · ${escapeHtml(
          inverter.brand
        )} ${escapeHtml(inverter.model)}</p>
      </div>
      <span class="badge badge--${result.status}">${STATUS_TEXT[result.status]}</span>
    </header>

    <div class="metrics">
      ${metric('低温开路电压', formatNumber(metrics.vocCold, 2), 'V')}
      ${metric('高温工作电压', formatNumber(metrics.vmpHot, 2), 'V')}
      ${metric('组串低温开路电压', formatNumber(metrics.stringVoltageCold, 1), 'V')}
      ${metric('组串高温工作电压', formatNumber(metrics.stringVmpHot, 1), 'V')}
      ${metric('每路工作电流', formatNumber(metrics.mpptCurrent, 2), 'A')}
      ${metric('组串数', String(metrics.stringCount), '串')}
      ${metric('总组件数', String(metrics.totalModules), '块')}
      ${metric('直流装机', formatNumber(metrics.dcKw, 2), 'kW')}
      ${metric('容配比', formatNumber(metrics.dcAcRatio, 3))}
    </div>

    <table class="check-table">
      <thead>
        <tr><th>校核项</th><th class="num">实际值</th><th class="num">限值</th><th class="num">余量</th><th>判定</th></tr>
      </thead>
      <tbody>${result.checks.map(checkRow).join('')}</tbody>
    </table>

    <p class="card__note">
      建议串联数 ${advice.series.min}–${advice.series.max} 块（当前可行区间上限由最大直流电压与 MPPT 上限共同决定）；
      每路最多 ${advice.parallel.max} 串并联。
    </p>
  `;
}
