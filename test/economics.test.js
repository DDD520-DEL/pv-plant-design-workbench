import test from 'node:test';
import assert from 'node:assert/strict';

import { energyEstimate } from '../src/yield.js';
import { evaluateEconomics } from '../src/economics.js';

function closeTo(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected} ± ${tolerance}，实际 ${actual}`);
}

function flatAnnual(kwhPerYear, years) {
  return Array.from({ length: years }, (_, index) => ({ year: index + 1, kwh: kwhPerYear }));
}

test('初始投资 = 容量(kW) × 1000 × 单位造价(元/W)，第 0 年为投资流出', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual: flatAnnual(100000, 3)
  });

  assert.equal(result.initialInvestment, 350000);
  assert.equal(result.annualOmCost, 3500);
  assert.equal(result.cashflow[0].year, 0);
  assert.equal(result.cashflow[0].netCashflow, -350000);
  assert.equal(result.cashflow[0].cumulative, -350000);
});

test('年净现金流 = 发电量 × 电价 − 年运维费，累计逐年累加', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual: flatAnnual(100000, 3)
  });

  const [, y1, y2, y3] = result.cashflow;
  assert.equal(y1.revenue, 35000);
  assert.equal(y1.omCost, 3500);
  assert.equal(y1.netCashflow, 31500);
  assert.equal(y1.cumulative, -318500);
  assert.equal(y2.cumulative, -287000);
  assert.equal(y3.cumulative, -255500);
});

test('静态回收期在回正年内按比例插值', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual: flatAnnual(100000, 12)
  });

  // 年净现金流 31,500，第 12 年回正：11 + 3,500/31,500 = 11.11 年
  assert.equal(result.paybackYears, 11.11);
  assert.equal(result.cashflow[11].cumulative, -3500);
  assert.equal(result.cashflow[12].cumulative, 28000);
});

test('累计恰好在年末回零时回收期取整年', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 1,
    omRatePercent: 0,
    tariffYuanPerKwh: 0.25,
    annual: flatAnnual(100000, 10)
  });

  // 初投 100,000，年净 25,000，第 4 年末恰好回正
  assert.equal(result.paybackYears, 4);
  assert.equal(result.cashflow[4].cumulative, 0);
});

test('周期内未回本时回收期为 null', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual: flatAnnual(100000, 3)
  });

  assert.equal(result.paybackYears, null);
  assert.equal(result.totalNetCashflow, -255500);
});

test('LCOE = (初投 + 运维总额) / 周期总发电量，不折现', () => {
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual: flatAnnual(100000, 12)
  });

  // (350,000 + 12×3,500) / 1,200,000 = 0.3267 元/kWh
  assert.equal(result.totalOmCost, 42000);
  assert.equal(result.totalKwh, 1200000);
  closeTo(result.lcoeYuanPerKwh, 0.3267, 0.00005);
});

test('发电量直接取自传入的逐年结果：衰减年收入同步递减', () => {
  const { annual } = energyEstimate({
    capacityKw: 100,
    peakSunHours: 3.8,
    performanceRatio: 0.8,
    years: 25
  });
  const result = evaluateEconomics({
    capacityKw: 100,
    unitCostYuanPerW: 3.5,
    omRatePercent: 1,
    tariffYuanPerKwh: 0.35,
    annual
  });

  assert.equal(result.cashflow.length, 26);
  assert.equal(result.cashflow[1].kwh, annual[0].kwh);
  assert.ok(result.cashflow[2].revenue < result.cashflow[1].revenue);
  assert.equal(result.years, 25);
  // 与手算口径一致：总成本约 43.75 万元 / 约 254.6 万 kWh ≈ 0.172 元/kWh
  closeTo(result.lcoeYuanPerKwh, 0.1718, 0.0005);
  assert.ok(result.paybackYears > 10 && result.paybackYears < 12);
});

test('缺少逐年发电量时直接报错', () => {
  assert.throws(
    () =>
      evaluateEconomics({
        capacityKw: 100,
        unitCostYuanPerW: 3.5,
        omRatePercent: 1,
        tariffYuanPerKwh: 0.35,
        annual: []
      }),
    /发电量/
  );
});
