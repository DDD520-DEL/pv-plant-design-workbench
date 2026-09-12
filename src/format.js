/**
 * 数值与单位的展示格式化，前端与测试共用。
 */

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function formatMmToM(mm, digits = 2) {
  if (!Number.isFinite(mm)) return '—';
  return `${formatNumber(mm / 1000, digits)} m`;
}

export function formatEnergy(kwh) {
  if (!Number.isFinite(kwh)) return '—';
  if (Math.abs(kwh) >= 10000) return `${formatNumber(kwh / 10000, 2)} 万kWh`;
  return `${formatNumber(kwh, 1)} kWh`;
}

export function formatPercent(ratio, digits = 1) {
  if (!Number.isFinite(ratio)) return '—';
  return `${formatNumber(ratio * 100, digits)}%`;
}

export function formatRatio(value, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}`;
}

/** 拼接 HTML 片段时对用户可编辑字段（品牌、型号）做转义。 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
