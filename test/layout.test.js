import test from 'node:test';
import assert from 'node:assert/strict';

import { arrayPlan, rowPitch, shadowRatio, solarNoonAltitude } from '../src/layout.js';

const module620 = { lengthMm: 2382, widthMm: 1134, pmax: 620 };

function closeTo(actual, expected, tolerance = 1) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `期望 ${expected} ± ${tolerance}，实际 ${actual}`);
}

test('冬至日正午太阳高度角随纬度升高而降低', () => {
  closeTo(solarNoonAltitude(32), 34.55, 0.001);
  closeTo(solarNoonAltitude(0), 66.55, 0.001);
  closeTo(solarNoonAltitude(45), 21.55, 0.001);
  assert.ok(solarNoonAltitude(45) < solarNoonAltitude(32));
});

test('太阳高度角低于或等于零度时影子长度比为无穷大', () => {
  assert.equal(shadowRatio(0), Number.POSITIVE_INFINITY);
  assert.equal(shadowRatio(-3), Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(shadowRatio(20)));
});

test('排距 = 单排水平投影 + 阴影长度', () => {
  const pitch = rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 32 });
  closeTo(pitch.altitudeDeg, 34.55, 0.01);
  closeTo(pitch.arrayHeightMm, 1006.7, 0.5);
  closeTo(pitch.projectionMm, 2158.8, 0.5);
  closeTo(pitch.shadowLengthMm, 1461.8, 1);
  closeTo(pitch.rowPitchMm, 3620.7, 1);
  closeTo(pitch.rowPitchMm, pitch.projectionMm + pitch.shadowLengthMm, 0.2);
});

test('纬度越高排距越大', () => {
  const low = rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 20 });
  const high = rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 45 });
  assert.ok(high.rowPitchMm > low.rowPitchMm);
  closeTo(low.rowPitchMm, 3112.5, 2);
  closeTo(high.rowPitchMm, 4707.9, 3);
});

test('零倾角时阵列高度与阴影长度都为零', () => {
  const pitch = rowPitch({ tiltDeg: 0, moduleLengthMm: module620.lengthMm, latitude: 32 });
  assert.equal(pitch.arrayHeightMm, 0);
  assert.equal(pitch.shadowLengthMm, 0);
  closeTo(pitch.rowPitchMm, module620.lengthMm, 0.5);
});

test('场地排布：50m × 30m 场地在默认参数下的排数与容量', () => {
  const plan = arrayPlan({
    siteWidthMm: 50000,
    siteDepthMm: 30000,
    tiltDeg: 25,
    latitude: 32,
    gapMm: 20,
    moduleLengthMm: module620.lengthMm,
    moduleWidthMm: module620.widthMm,
    pmax: module620.pmax
  });

  assert.equal(plan.modulesPerRow, 43);
  assert.equal(plan.rows, 8);
  assert.equal(plan.totalModules, 344);
  assert.equal(plan.capacityKw, 213.28);
  closeTo(plan.usedDepthMm, 27504, 5);
  closeTo(plan.usageRatio, 91.7, 0.2);
  closeTo(plan.siteAreaM2, 1500, 0.1);
  closeTo(plan.capacityDensityWPerM2, 142.2, 0.5);
  assert.ok(plan.usedDepthMm <= 30000);
});

test('场地排布：进深不足一排时排数为零', () => {
  const plan = arrayPlan({
    siteWidthMm: 50000,
    siteDepthMm: 1000,
    tiltDeg: 25,
    latitude: 32,
    gapMm: 20,
    moduleLengthMm: module620.lengthMm,
    moduleWidthMm: module620.widthMm,
    pmax: module620.pmax
  });

  assert.equal(plan.rows, 0);
  assert.equal(plan.totalModules, 0);
  assert.equal(plan.capacityKw, 0);
  assert.equal(plan.usedDepthMm, 0);
});

test('场地排布：倾角越大排距越大、同场地可排排数越少', () => {
  const flat = arrayPlan({
    siteWidthMm: 50000,
    siteDepthMm: 30000,
    tiltDeg: 10,
    latitude: 32,
    gapMm: 20,
    moduleLengthMm: module620.lengthMm,
    moduleWidthMm: module620.widthMm,
    pmax: module620.pmax
  });
  const steep = arrayPlan({
    siteWidthMm: 50000,
    siteDepthMm: 30000,
    tiltDeg: 35,
    latitude: 32,
    gapMm: 20,
    moduleLengthMm: module620.lengthMm,
    moduleWidthMm: module620.widthMm,
    pmax: module620.pmax
  });

  assert.ok(steep.rowPitchMm > flat.rowPitchMm);
  assert.ok(steep.rows <= flat.rows);
});
