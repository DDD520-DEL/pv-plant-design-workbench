import { escapeHtml, formatNumber } from '../format.js';

const STATUS_TEXT = {
  pass: '接地电阻满足限值',
  fail: '接地电阻不满足，需降阻处理'
};

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

function checkRow(check) {
  const rowClass = check.pass ? 'is-pass' : 'is-fail';
  const verdict = check.pass ? '满足' : '不满足';
  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(check.label)}</td>
      <td class="num">${formatNumber(check.actual, 2)} Ω</td>
      <td class="num">≤ ${formatNumber(check.limit, 0)} Ω</td>
      <td class="num">${check.pass ? `富余 ${formatNumber(check.marginPercent, 1)}%` : `超出 ${formatNumber(-check.marginPercent, 1)}%`}</td>
      <td><span class="tag tag--${rowClass}">${verdict}</span></td>
    </tr>
  `;
}

export function renderGroundingPanel(container, { module, plan, result }) {
  const { site, environment, gridType, base, design, vertical, horizontal, lightning, checks, advice, notes } = result;
  const densified = design.rodsAdded > 0 || design.innerGridsAdded > 0;

  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>防雷与接地设计</h3>
        <p class="card__sub">${escapeHtml(module.brand)} ${escapeHtml(module.model)} · ${escapeHtml(
          gridType.label
        )} · ${escapeHtml(environment.zone.label)}（${escapeHtml(lightning.classLabel)}防雷）</p>
      </div>
      <span class="badge badge--${result.status}">${STATUS_TEXT[result.status]}</span>
    </header>

    <div class="metrics">
      ${metric('阵列外缘（宽 × 进深）', `${formatNumber(site.widthM, 1)} × ${formatNumber(site.depthM, 1)}`, ' m')}
      ${metric('阵列占地 / 排数', `${formatNumber(site.areaM2, 0)} / ${site.rows}`, ' m² / 排')}
      ${metric('外缘周长', formatNumber(site.perimeterM, 1), 'm')}
      ${metric('年平均雷暴日 / 土壤电阻率', `${formatNumber(environment.thunderDays, 0)} / ${formatNumber(
        environment.soilResistivityOhmM,
        0
      )}`, ' d / Ω·m')}
      ${metric('初估接地电阻', formatNumber(base.resistanceOhm, 2), 'Ω')}
      ${metric('设计接地电阻', formatNumber(design.resistanceOhm, 2), 'Ω')}
    </div>

    <table class="check-table">
      <thead>
        <tr><th>校核项</th><th class="num">估算值</th><th class="num">限值</th><th class="num">裕量</th><th>判定</th></tr>
      </thead>
      <tbody>
        ${checkRow(checks.working)}
        ${checkRow(checks.lightning)}
      </tbody>
    </table>

    <h4 class="table-title">接地体规格与数量建议（热镀锌钢材）</h4>
    <div class="metrics">
      ${metric('垂直接地极', `${vertical.specLabel} × ${vertical.count} 根`, `（间距 ${formatNumber(
        vertical.spacingMm / 1000,
        0
      )} m，极长 ${vertical.lengthMm / 1000} m）`)}
      ${metric('水平接地带', `${horizontal.specLabel} · 共 ${formatNumber(horizontal.totalLengthM, 1)} m`, `（埋深 ${
        horizontal.burialDepthMm / 1000
      } m${horizontal.innerGrids > 0 ? `，含 ${horizontal.innerGrids} 组内部均压带` : ''}）`)}
      ${metric(
        '引下 / 等电位连接点',
        `${lightning.downConductorCount} 处`,
        `（沿外缘约 25 m 一处，${lightning.downConductorSpec}）`
      )}
      ${metric(
        '加密增补',
        densified ? `+${design.rodsAdded} 根垂直接地极、+${design.innerGridsAdded} 道均压带` : '无需加密',
        densified ? `（+${formatNumber(design.stripAddedM, 1)} m 扁钢）` : ''
      )}
    </div>

    ${
      lightning.meshCellM
        ? `<p class="card__note">网格接地网内部均压带按约 ${lightning.meshCellM.width} m（横向）× ${lightning.meshCellM.depth} m（进深）模数布置，组件边框与支架就近接至网格交点。</p>`
        : ''
    }
    ${
      horizontal.bondingOnly
        ? '<p class="card__note">分散垂直接地极之间的扁钢仅作等电位连通，散流电阻按垂直接地极并联估算；建议优先改用环形接地网。</p>'
        : ''
    }
    ${
      densified
        ? `<p class="card__note">按外缘常规间距布置 ${base.rodCount} 根时初估电阻 ${formatNumber(
            base.resistanceOhm,
            2
          )} Ω，不满足要求；加密至 ${design.rodCount} 根（利用系数 ${formatNumber(
            design.components.etaV,
            2
          )}）后为 ${formatNumber(design.resistanceOhm, 2)} Ω。</p>`
        : `<p class="card__note">${base.rodCount} 根垂直接地极利用系数 ${formatNumber(
            base.components.etaV,
            2
          )}：垂直接地极并联约 ${formatNumber(base.components.rodParallelOhm, 2)} Ω${
            base.components.stripOhm !== null
              ? `，水平接地网约 ${formatNumber(base.components.stripOhm, 2)} Ω`
              : ''
          }，合成 ${formatNumber(base.resistanceOhm, 2)} Ω。</p>`
    }
    ${advice.map((text) => `<p class="hint hint--warn field-note">${escapeHtml(text)}</p>`).join('')}

    <p class="card__note">
      排布口径：${plan.totalModules} 块 / ${formatNumber(plan.capacityKw, 1)} kW，${plan.rows} 排。
      ${notes.map((note) => escapeHtml(note)).join('')}
    </p>
  `;
}
