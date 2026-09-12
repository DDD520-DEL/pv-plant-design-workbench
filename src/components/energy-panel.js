import { escapeHtml, formatEnergy, formatNumber } from '../format.js';

const HIGHLIGHT_YEARS = [1, 5, 10, 15, 20, 25];

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

function barRow(entry, firstYearKwh) {
  const ratio = firstYearKwh === 0 ? 0 : Math.max(2, (entry.kwh / firstYearKwh) * 100);
  return `
    <div class="bar-row">
      <span class="bar-row__label">第 ${entry.year} 年</span>
      <span class="bar-row__track"><span class="bar-row__fill" style="width:${ratio.toFixed(1)}%"></span></span>
      <span class="bar-row__value">${formatEnergy(entry.kwh)}</span>
    </div>
  `;
}

export function renderEnergyPanel(container, { estimate }) {
  const firstYearKwh = estimate.firstYearKwh;
  const highlights = HIGHLIGHT_YEARS.filter((year) => year <= estimate.years).map(
    (year) => estimate.annual[year - 1]
  );

  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>发电量估算</h3>
        <p class="card__sub">首年衰减后逐年递减，PR ${formatNumber(estimate.performanceRatio, 2)}</p>
      </div>
      <span class="badge badge--info">${estimate.years} 年</span>
    </header>

    <div class="metrics">
      ${metric('首年发电量', formatEnergy(estimate.firstYearKwh))}
      ${metric(`${estimate.years} 年总发电量`, formatEnergy(estimate.totalKwh))}
      ${metric('年均发电量', formatEnergy(estimate.averageKwh))}
      ${metric('首年等效利用小时', formatNumber(estimate.equivalentHours, 1), 'h')}
      ${metric('末段年份发电量', formatEnergy(estimate.lastYearKwh))}
      ${metric('理论辐照发电量', formatEnergy(estimate.idealKwh))}
    </div>

    <div class="bars">${highlights.map((entry) => barRow(entry, firstYearKwh)).join('')}</div>
    <p class="card__note">条形长度以首年发电量为基准，未列出的年份见年度明细。</p>
  `;
}
