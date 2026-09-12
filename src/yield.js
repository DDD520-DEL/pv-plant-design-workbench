/**
 * 发电量估算。
 *
 * 首年发电量按「装机容量 × 峰值日照小时数 × 365 × 系统效率」计算，
 * 再扣掉首年衰减；此后每年按固定衰减率递减。
 *   E1 = P × H × 365 × PR × (1 − d1)
 *   En = E1 × (1 − dy)^(n−1)
 */

export const ENERGY_LIMITS = {
  capacityKw: { min: 0.1, max: 100000, label: '装机容量', unit: 'kW', default: 100 },
  peakSunHours: { min: 1, max: 8, label: '峰值日照小时数', unit: 'h', default: 3.8 },
  performanceRatio: { min: 0.5, max: 1, label: '系统效率 PR', unit: '', default: 0.8 },
  years: { min: 1, max: 30, label: '测算年限', unit: '年', default: 25 },
  firstYearDegradation: { min: 0, max: 10, label: '首年衰减', unit: '%', default: 2 },
  annualDegradation: { min: 0, max: 3, label: '逐年衰减', unit: '%', default: 0.55 }
};

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function energyEstimate({
  capacityKw,
  peakSunHours,
  performanceRatio = 0.8,
  years = 25,
  firstYearDegradation = 2,
  annualDegradation = 0.55
}) {
  const idealKwh = capacityKw * peakSunHours * 365;
  const firstYearKwh = idealKwh * performanceRatio * (1 - firstYearDegradation / 100);
  const decayRate = 1 - annualDegradation / 100;

  const annual = [];
  let totalKwh = 0;
  for (let year = 1; year <= years; year += 1) {
    const kwh = firstYearKwh * decayRate ** (year - 1);
    annual.push({ year, kwh: round(kwh, 1) });
    totalKwh += kwh;
  }

  const lastYearKwh = annual.length > 0 ? annual[annual.length - 1].kwh : 0;

  return {
    idealKwh: round(idealKwh, 1),
    firstYearKwh: round(firstYearKwh, 1),
    lastYearKwh: round(lastYearKwh, 1),
    totalKwh: round(totalKwh, 1),
    averageKwh: round(totalKwh / years, 1),
    equivalentHours: round(firstYearKwh / capacityKw, 1),
    performanceRatio,
    years,
    annual
  };
}
