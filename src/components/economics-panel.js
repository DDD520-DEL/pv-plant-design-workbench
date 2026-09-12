import { escapeHtml, formatEnergy, formatMoney, formatNumber } from '../format.js';

const HIGHLIGHT_YEARS = [0, 1, 5, 10, 15, 20, 25];

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

function signedMoney(value) {
  const text = formatMoney(Math.abs(value));
  return value < 0 ? `−${text}` : text;
}

function cashflowRow(entry) {
  const isInvestment = entry.year === 0;
  const cumulativeNegative = entry.cumulative < 0;
  return `
    <tr class="${isInvestment ? 'is-warn' : ''}">
      <td>${isInvestment ? '第 0 年（初投）' : `第 ${entry.year} 年`}</td>
      <td class="num">${entry.kwh ? formatEnergy(entry.kwh) : '—'}</td>
      <td class="num">${entry.revenue ? formatMoney(entry.revenue) : '—'}</td>
      <td class="num">${entry.omCost ? formatMoney(entry.omCost) : '—'}</td>
      <td class="num">${signedMoney(entry.netCashflow)}</td>
      <td class="num ${cumulativeNegative ? 'money-negative' : 'money-positive'}">${signedMoney(entry.cumulative)}</td>
    </tr>
  `;
}

export function renderEconomicsPanel(container, { result }) {
  const highlightYears = [
    ...HIGHLIGHT_YEARS.filter((year) => year <= result.years),
    result.years
  ];
  const rows = result.cashflow
    .filter((entry) => highlightYears.includes(entry.year))
    .map(cashflowRow)
    .join('');

  const recovered = result.paybackYears !== null;
  const badge = recovered
    ? `<span class="badge badge--pass">${formatNumber(result.paybackYears, 1)} 年回本</span>`
    : `<span class="badge badge--fail">${result.years} 年内未回本</span>`;

  const lcoeVsTariff = result.lcoeYuanPerKwh <= result.tariffYuanPerKwh;
  const banner = lcoeVsTariff
    ? ''
    : `
      <p class="card__banner card__banner--warn">
        平准化度电成本 ${formatNumber(result.lcoeYuanPerKwh, 3)} 元/kWh 高于上网电价
        ${formatNumber(result.tariffYuanPerKwh, 2)} 元/kWh，全周期电费收入覆盖不了投资与运维。
      </p>`;

  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>经济性分析</h3>
        <p class="card__sub">
          静态口径（不折现）· 造价 ${formatNumber(result.unitCostYuanPerW, 2)} 元/W ·
          运维 ${formatNumber(result.omRatePercent, 1)}%/年 · 电价 ${formatNumber(result.tariffYuanPerKwh, 2)} 元/kWh
        </p>
      </div>
      ${badge}
    </header>

    ${banner}

    <div class="metrics">
      ${metric('静态投资回收期', recovered ? formatNumber(result.paybackYears, 2) : '未回本', '年')}
      ${metric('平准化度电成本 LCOE', formatNumber(result.lcoeYuanPerKwh, 3), '元/kWh')}
      ${metric('初始投资', formatMoney(result.initialInvestment))}
      ${metric('年均运维费', formatMoney(result.annualOmCost))}
      ${metric(`${result.years} 年总电费收入`, formatMoney(result.totalRevenue))}
      ${metric(`${result.years} 年累计净收益`, signedMoney(result.totalNetCashflow))}
    </div>

    <p class="table-title">逐年现金流（节选关键年份）</p>
    <table class="check-table">
      <thead>
        <tr>
          <th>年份</th>
          <th class="num">发电量</th>
          <th class="num">售电收入</th>
          <th class="num">运维费</th>
          <th class="num">净现金流</th>
          <th class="num">累计净现金流</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="card__note">
      净现金流 = 当年发电量 × 上网电价 − 初始投资 × 年运维费率；LCOE =（初始投资 + 运维费总额）/ 周期总发电量。
      回收期在回正年内按净现金流比例插值，未考虑资金时间价值、税费与残值。
    </p>
  `;
}
