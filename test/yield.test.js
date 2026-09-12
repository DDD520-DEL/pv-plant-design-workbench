import test from 'node:test';
import assert from 'node:assert/strict';

import { energyEstimate } from '../src/yield.js';

function closeTo(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected} ± ${tolerance}，实际 ${actual}`);
}

test('首年发电量 = 容量 × 峰值日照小时 × 365 × PR × (1 − 首年衰减)', () => {
  const estimate = energyEstimate({ capacityKw: 100, peakSunHours: 3.8, performanceRatio: 0.8 });
  assert.equal(estimate.idealKwh, 138700);
  assert.equal(estimate.firstYearKwh, 108740.8);
  assert.equal(estimate.equivalentHours, 1087.4);
  assert.equal(estimate.annual.length, 25);
  assert.equal(estimate.annual[0].kwh, 108740.8);
});

test('逐年衰减按指数递减，末年发电量小于首年', () => {
  const estimate = energyEstimate({
    capacityKw: 100,
    peakSunHours: 3.8,
    performanceRatio: 0.8,
    years: 25,
    firstYearDegradation: 2,
    annualDegradation: 0.55
  });
  closeTo(estimate.lastYearKwh, 95254.6, 5);
  closeTo(estimate.totalKwh, 2546406, 200);
  assert.ok(estimate.lastYearKwh < estimate.firstYearKwh);
  assert.ok(estimate.annual.every((entry, index) => index === 0 || entry.kwh < estimate.annual[index - 1].kwh));
});

test('衰减率为零时各年发电量相同', () => {
  const estimate = energyEstimate({
    capacityKw: 50,
    peakSunHours: 4,
    performanceRatio: 0.75,
    years: 10,
    firstYearDegradation: 2,
    annualDegradation: 0
  });
  const expected = 50 * 4 * 365 * 0.75 * 0.98;
  assert.equal(estimate.annual.length, 10);
  assert.equal(estimate.firstYearKwh, Math.round(expected * 10) / 10);
  assert.equal(estimate.totalKwh, Math.round(expected * 10 * 10) / 10);
  assert.equal(estimate.averageKwh, estimate.firstYearKwh);
});

test('测算一年时总发电量等于首年发电量', () => {
  const estimate = energyEstimate({ capacityKw: 10, peakSunHours: 3, performanceRatio: 0.8, years: 1 });
  assert.equal(estimate.annual.length, 1);
  assert.equal(estimate.totalKwh, estimate.firstYearKwh);
  assert.equal(estimate.lastYearKwh, estimate.firstYearKwh);
});
