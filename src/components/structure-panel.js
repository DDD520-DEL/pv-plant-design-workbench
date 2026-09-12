import { escapeHtml, formatMmToM, formatNumber } from '../format.js';

const STATUS_TEXT = {
  pass: '支架与基础校核通过',
  fail: '稳定或选型不满足'
};

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

function checkRow(label, item, unit = '') {
  const verdict = item.pass ? '满足' : '不满足';
  const rowClass = item.pass ? 'is-pass' : 'is-fail';
  const actual = Number.isFinite(item.actual) ? formatNumber(item.actual, 3) : '∞';
  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(label)}</td>
      <td class="num">${actual}${unit}</td>
      <td class="num">≥ ${formatNumber(item.limit, 2)}${unit}</td>
      <td class="num">${item.pass ? `富余 ${formatNumber(item.marginPercent, 1)}%` : `不足 ${formatNumber(-item.marginPercent, 1)}%`}</td>
      <td><span class="tag tag--${rowClass}">${verdict}</span></td>
    </tr>
  `;
}

function sizeCandidateLine(candidates, pickedKey, pickedValue, nameFn) {
  const firstFail = candidates.findIndex((item) => !item.pass);
  const firstPass = candidates.findIndex((item) => item.pass);
  const start = Math.max(0, Math.min(firstFail, firstPass) - 1);
  const rows = candidates.slice(start, start + 4);
  return rows
    .map((item) => {
      const picked = item[pickedKey] === pickedValue;
      return `<span class="chip ${picked ? 'chip--pick' : item.pass ? 'chip--ok' : 'chip--no'}">${escapeHtml(
        nameFn(item)
      )}${picked ? ' ★' : ''}</span>`;
    })
    .join('');
}

export function renderStructurePanel(container, { module, result }) {
  const { loads, post, purlin, foundation, notes } = result;
  const { wind, snow, deadWeightKn, geometry } = loads;
  const postText = post.size ? post.size.label : '标准系列内无解，需专项设计';
  const purlinText = purlin.size ? purlin.size.model : '标准系列内无解，需专项设计';

  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>支架与基础选型校核</h3>
        <p class="card__sub">${escapeHtml(module.brand)} ${escapeHtml(module.model)}（组件长 ${formatMmToM(
          module.lengthMm,
          3
        )}）· 倾角 ${formatNumber(geometry.tiltDeg, 0)}° · 沿斜向 ${
          geometry.modulesAlongSlope
        } 块 · 立柱跨距 ${formatMmToM(loads.postSpacingM * 1000, 2)}</p>
      </div>
      <span class="badge badge--${result.status}">${STATUS_TEXT[result.status]}</span>
    </header>

    <div class="metrics">
      ${metric('风荷载标准值 w_k', formatNumber(wind.standardKpa, 3), 'kN/m²')}
      ${metric('单断面风荷载', formatNumber(wind.forceKn, 2), 'kN')}
      ${metric('风水平力 / 上拔力', `${formatNumber(wind.horizontalKn, 2)} / ${formatNumber(wind.upliftKn, 2)}`, 'kN')}
      ${metric('雪荷载标准值 s_k', formatNumber(snow.standardKpa, 3), 'kN/m²')}
      ${metric('单断面雪荷载', formatNumber(snow.forceKn, 2), 'kN')}
      ${metric('结构自重', formatNumber(deadWeightKn.total, 2), 'kN')}
    </div>

    <table class="check-table">
      <thead>
        <tr><th>荷载系数</th><th class="num">取值</th><th class="num">系数</th><th class="num">基本值</th><th>口径</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>风荷载 w_k = βz·μs·μz·w0</td>
          <td class="num">${formatNumber(wind.standardKpa, 3)} kN/m²</td>
          <td class="num">${formatNumber(wind.shapeFactor, 2)} / ${formatNumber(wind.heightFactor, 2)}</td>
          <td class="num">${formatNumber(wind.basicKpa, 2)} kN/m²</td>
          <td><span class="tag tag--is-pass">μs 体型 / μz 高度</span></td>
        </tr>
        <tr>
          <td>雪荷载 s_k = μr·s0</td>
          <td class="num">${formatNumber(snow.standardKpa, 3)} kN/m²</td>
          <td class="num">${formatNumber(snow.distributionFactor, 2)}</td>
          <td class="num">${formatNumber(snow.basicKpa, 2)} kN/m²</td>
          <td><span class="tag tag--is-pass">μr 积雪分布</span></td>
        </tr>
      </tbody>
    </table>

    <h4 class="table-title">构件选型建议（Q235 镀锌型钢）</h4>
    <div class="metrics">
      ${metric('立柱（前后各一根）', postText, post.size ? ' mm 方矩管' : '')}
      ${metric('立柱底弯矩 / 需 W', `${formatNumber(post.baseMomentKnM, 2)} / ${formatNumber(
        post.requiredSectionModulusCm3,
        1
      )}`, ' kN·m / cm³')}
      ${metric('檩条型号', purlinText)}
      ${metric('檩距 / 道数', `${formatNumber(purlin.spacingMm / 1000, 2)} m × ${purlin.count} 道`)}
      ${metric('檩条跨中弯矩 / 需 W', `${formatNumber(purlin.midMomentKnM, 2)} / ${formatNumber(
        purlin.requiredSectionModulusCm3,
        1
      )}`, ' kN·m / cm³')}
      ${metric(
        '基础底板（每立柱）',
        `${foundation.slab.sideMm}×${foundation.slab.sideMm}×${foundation.slab.thicknessMm}`,
        ' mm'
      )}
      ${metric('基础混凝土量 / 自重', `${formatNumber(foundation.slab.volumeM3, 3)} / ${formatNumber(
        foundation.slab.weightKn,
        1
      )}`, ' m³ / kN')}
      ${metric('地基土类别', foundation.soil.label, `（μ=${formatNumber(foundation.soil.friction, 1)}）`)}
    </div>

    <h4 class="table-title">规格候选（★ 为所选规格）</h4>
    <div class="chip-row">
      <span class="chip-row__label">立柱</span>
      ${sizeCandidateLine(post.candidates, 'label', post.size?.label, (item) => item.label)}
    </div>
    <div class="chip-row">
      <span class="chip-row__label">檩条</span>
      ${sizeCandidateLine(purlin.candidates, 'model', purlin.size?.model, (item) => item.model)}
    </div>

    <h4 class="table-title">基础稳定校核（荷载标准值）</h4>
    <table class="check-table">
      <thead>
        <tr><th>校核项</th><th class="num">实际值</th><th class="num">限值</th><th class="num">裕量</th><th>判定</th></tr>
      </thead>
      <tbody>
        ${checkRow(
          `抗倾覆（M稳 ${formatNumber(foundation.loads.stabilizingMomentKnM, 2)} / M倾 ${formatNumber(
            foundation.loads.overturningMomentKnM,
            2
          )}，kN·m）`,
          foundation.checks.overturning
        )}
        ${checkRow(
          `抗滑移（摩擦 ${formatNumber(foundation.loads.frictionKn, 2)} / 风水平力 ${formatNumber(
            foundation.loads.windHorizontalKn,
            2
          )}，kN）`,
          foundation.checks.sliding
        )}
      </tbody>
    </table>

    <p class="card__note">
      支架顶端高度约 ${formatMmToM(geometry.topHeightMm, 2)}，斜面合力点高 ${formatMmToM(
        geometry.centroidHeightMm,
        2
      )}；竖向力合计 ${formatNumber(
        foundation.loads.verticalTotalKn,
        2
      )} kN（含基础自重，已扣除风吸上拔 ${formatNumber(
        foundation.loads.windUpliftKn,
        2
      )} kN）。${notes.map((note) => escapeHtml(note)).join('')}
    </p>
  `;
}
