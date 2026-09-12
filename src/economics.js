/**
 * 经济性分析：逐年现金流、静态回收期与平准化度电成本（LCOE）。
 *
 * 发电量直接沿用发电量估算的逐年结果（annual: [{ year, kwh }]），
 * 投资在第 0 年一次性发生，运维费按初投的固定费率每年从收入中扣除，
 * 全周期不考虑资金时间价值（静态口径）。
 *   年净现金流 = 当年发电量 × 上网电价 − 初投 × 年运维费率
 *   静态回收期 = 累计净现金流首次回正的年份，不足一年按月插值
 *   LCOE = (初投 + 运维费总额) / 总发电量（元/kWh）
 */

export const ECONOMICS_LIMITS = {
  unitCostYuanPerW: { min: 0.1, max: 50, label: '单位造价', unit: '元/W', default: 3.5 },
  omRatePercent: { min: 0, max: 20, label: '年运维费率', unit: '%', default: 1 },
  tariffYuanPerKwh: { min: 0.01, max: 5, label: '上网电价', unit: '元/kWh', default: 0.35 }
};

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {object} params
 * @param {number} params.capacityKw 装机容量（kW），与发电量估算同一容量
 * @param {number} params.unitCostYuanPerW 单位造价（元/W）
 * @param {number} params.omRatePercent 年运维费率（占初投百分比，%）
 * @param {number} params.tariffYuanPerKwh 上网电价（元/kWh）
 * @param {Array<{year: number, kwh: number}>} params.annual 发电量逐年结果
 */
export function evaluateEconomics({
  capacityKw,
  unitCostYuanPerW,
  omRatePercent,
  tariffYuanPerKwh,
  annual
}) {
  if (!Array.isArray(annual) || annual.length === 0) {
    throw new Error('缺少发电量逐年结果，无法做经济性分析');
  }

  // 1 kW 装机 × 元/W = 1000 元/kW
  const initialInvestment = capacityKw * 1000 * unitCostYuanPerW;
  const annualOmCost = initialInvestment * (omRatePercent / 100);

  const cashflow = [];
  let cumulative = -initialInvestment;
  let totalKwh = 0;
  let totalOmCost = 0;
  let totalRevenue = 0;
  let paybackYear = null;

  cashflow.push({
    year: 0,
    kwh: 0,
    revenue: 0,
    omCost: 0,
    netCashflow: round(-initialInvestment, 2),
    cumulative: round(-initialInvestment, 2)
  });

  for (const entry of annual) {
    const kwh = entry.kwh;
    const revenue = kwh * tariffYuanPerKwh;
    const netCashflow = revenue - annualOmCost;
    const previousCumulative = cumulative;
    cumulative += netCashflow;
    totalKwh += kwh;
    totalRevenue += revenue;
    totalOmCost += annualOmCost;

    if (paybackYear === null && cumulative >= 0) {
      // 回正在本年：以上一年末累计缺口占本年净现金流的比例做年内插值
      const fraction =
        netCashflow > 0 ? Math.min(1, -previousCumulative / netCashflow) : 1;
      paybackYear = entry.year - 1 + fraction;
    }

    cashflow.push({
      year: entry.year,
      kwh: round(kwh, 1),
      revenue: round(revenue, 2),
      omCost: round(annualOmCost, 2),
      netCashflow: round(netCashflow, 2),
      cumulative: round(cumulative, 2)
    });
  }

  const years = annual.length;
  const lcoeYuanPerKwh = totalKwh > 0 ? (initialInvestment + totalOmCost) / totalKwh : null;
  const totalNetCashflow = cumulative;

  return {
    capacityKw,
    years,
    unitCostYuanPerW,
    omRatePercent,
    tariffYuanPerKwh,
    initialInvestment: round(initialInvestment, 2),
    annualOmCost: round(annualOmCost, 2),
    totalInvestment: round(initialInvestment + totalOmCost, 2),
    totalRevenue: round(totalRevenue, 2),
    totalOmCost: round(totalOmCost, 2),
    totalKwh: round(totalKwh, 1),
    totalNetCashflow: round(totalNetCashflow, 2),
    paybackYears: paybackYear === null ? null : round(paybackYear, 2),
    lcoeYuanPerKwh: lcoeYuanPerKwh === null ? null : round(lcoeYuanPerKwh, 4),
    cashflow
  };
}
