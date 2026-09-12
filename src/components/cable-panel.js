import { escapeHtml, formatNumber } from '../format.js';

const STATUS_TEXT = {
  pass: '压降合格（≤2%）',
  warn: '可接受（2%–3%）',
  fail: '压降过大（＞3%）'
};

function metric(label, value, unit = '') {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <span class="metric__value">${escapeHtml(value)}${unit ? `<small>${escapeHtml(unit)}</small>` : ''}</span>
    </div>
  `;
}

function limitRow(label, item) {
  const verdict = item.pass ? '满足' : '超出';
  const rowClass = item.pass ? 'is-pass' : 'is-fail';
  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(label)}</td>
      <td class="num">${formatNumber(item.actualPercent, 3)} %</td>
      <td class="num">≤ ${formatNumber(item.limitPercent, 0)} %</td>
      <td class="num">${item.pass ? '—' : `超 ${formatNumber(item.actualPercent - item.limitPercent, 3)}%`}</td>
      <td><span class="tag tag--${rowClass}">${verdict}</span></td>
    </tr>
  `;
}

/** 只截取推荐截面附近的几个标准规格，避免候选表过长。 */
function nearbyCandidates(candidates, recommendedArea) {
  if (recommendedArea == null) {
    return { rows: candidates.slice(-3), recommendedIndex: -1 };
  }
  const index = candidates.findIndex((item) => item.area === recommendedArea);
  const start = Math.max(0, index - 2);
  const end = Math.min(candidates.length, index + 3);
  return { rows: candidates.slice(start, end), recommendedIndex: index };
}

function candidateRow(item, isRecommended) {
  return `
    <tr class="${isRecommended ? 'is-pass' : item.pass ? '' : 'is-warn'}">
      <td class="num">${formatNumber(item.area, item.area >= 10 ? 0 : 1)} mm²${
        isRecommended ? ' ★' : ''
      }</td>
      <td class="num">${formatNumber(item.dropPercent, 3)} %</td>
      <td class="num">${formatNumber(item.lossWatt, 1)} W</td>
      <td><span class="tag tag--${item.pass ? 'is-pass' : 'is-fail'}">${item.pass ? '满足' : '超出'}</span></td>
    </tr>
  `;
}

function linkBanner(link) {
  if (!link?.notice) return '';
  return `
    <p class="card__banner card__banner--warn">${escapeHtml(link.notice)}</p>
  `;
}

function sourceTag(source) {
  if (source === 'manual') return '（手填覆盖）';
  return '';
}

export function renderCablePanel(container, { result }, options = {}) {
  const { checks, recommendation } = result;
  const { rows, recommendedIndex } = nearbyCandidates(recommendation.candidates, recommendation.recommendedArea);
  const recommendedText =
    recommendation.recommendedArea != null
      ? `${formatNumber(recommendation.recommendedArea, recommendation.recommendedArea >= 10 ? 0 : 1)} mm²`
      : '标准系列内无解';
  const link = options.link ?? null;

  container.hidden = false;
  container.innerHTML = `
    <header class="card__head">
      <div>
        <h3>直流电缆选型校核</h3>
        <p class="card__sub">${escapeHtml(result.materialLabel)} · 单程 ${formatNumber(
          result.lengthM,
          1
        )} m（回路 ${formatNumber(result.loopLengthM, 1)} m）· ${formatNumber(
          result.area,
          result.area >= 10 ? 0 : 1
        )} mm² · 工作电压 ${formatNumber(result.voltage, 1)} V${escapeHtml(
          sourceTag(link?.fields?.voltage?.source)
        )} · 工作电流 ${formatNumber(result.current, 2)} A${escapeHtml(
          sourceTag(link?.fields?.current?.source)
        )}</p>
      </div>
      <span class="badge badge--${result.status}">${STATUS_TEXT[result.status]}</span>
    </header>

    ${linkBanner(link)}

    <div class="metrics">
      ${metric('回路电阻', formatNumber(result.resistance, 4), 'Ω')}
      ${metric('直流压降', formatNumber(result.dropVoltage, 2), 'V')}
      ${metric('压降百分比', formatNumber(result.dropPercent, 3), '%')}
      ${metric('线损功率', formatNumber(result.lossWatt, 1), 'W')}
      ${metric('理论最小截面', formatNumber(recommendation.theoreticalMinArea, 2), 'mm²')}
      ${metric(
        `推荐截面（≤${formatNumber(recommendation.allowedPercent, 0)}%）`,
        recommendedText
      )}
    </div>

    <table class="check-table">
      <thead>
        <tr><th>校核项</th><th class="num">实际压降</th><th class="num">限值</th><th class="num">偏差</th><th>判定</th></tr>
      </thead>
      <tbody>
        ${limitRow('压降百分比（推荐档）', checks.drop2)}
        ${limitRow('压降百分比（放宽档）', checks.drop3)}
      </tbody>
    </table>

    <h4 class="table-title">标准截面候选（推荐值附近）</h4>
    <table class="check-table">
      <thead>
        <tr><th class="num">标称截面</th><th class="num">压降百分比</th><th class="num">线损</th><th>按 ${formatNumber(
          recommendation.allowedPercent,
          0
        )}% 判定</th></tr>
      </thead>
      <tbody>${rows
        .map((item) =>
          candidateRow(item, recommendedIndex !== -1 && item.area === recommendation.recommendedArea)
        )
        .join('')}</tbody>
    </table>

    <p class="card__note">
      ${
        recommendation.recommendedArea == null
          ? `即便采用最大标准截面 ${formatNumber(
              recommendation.candidates[recommendation.candidates.length - 1].area,
              0
            )} mm² 仍超过 ${formatNumber(
              recommendation.allowedPercent,
              0
            )}% 允许压降，应缩短电缆路径、提高组串工作电压或改用汇流后集中逆变方案。`
          : `按允许压降 ${formatNumber(
              recommendation.allowedPercent,
              0
            )}% 反推理论最小截面 ${formatNumber(
              recommendation.theoreticalMinArea,
              2
            )} mm²，上靠标准规格取 ${recommendedText}；电阻率按 90℃ 工作温度取值，结果偏保守。`
      }
    </p>
  `;
}
