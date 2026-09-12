import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHADING_MODES,
  arrayPlan,
  resolveShadingMode,
  rowPitch,
  shadowRatio,
  solarNoonAltitude,
  sunPosition
} from '../src/layout.js';

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

test('间距口径解析：noon/window 可用，未知口径返回空', () => {
  assert.equal(resolveShadingMode('noon'), SHADING_MODES.noon);
  assert.equal(resolveShadingMode('window'), SHADING_MODES.window);
  assert.equal(resolveShadingMode(' Window '), SHADING_MODES.window);
  assert.equal(resolveShadingMode('evening'), null);
  assert.equal(resolveShadingMode(undefined), null);
});

test('太阳位置：时角为 0 时退化为正午公式，方位角为 0', () => {
  const noon = sunPosition(32, 0);
  closeTo(noon.altitudeDeg, solarNoonAltitude(32), 0.001);
  closeTo(noon.azimuthDeg, 0, 0.001);
});

test('太阳位置：9:00/15:00 高度角低于正午，方位角相对正南约 44°', () => {
  const morning = sunPosition(32, -45);
  const afternoon = sunPosition(32, 45);
  closeTo(morning.altitudeDeg, 19.83, 0.01);
  closeTo(morning.azimuthDeg, 43.6, 0.05);
  assert.ok(morning.altitudeDeg < solarNoonAltitude(32));
  // 9:00 与 15:00 关于正午对称，高度角与方位角绝对值一致
  closeTo(afternoon.altitudeDeg, morning.altitudeDeg, 0.0001);
  closeTo(afternoon.azimuthDeg, morning.azimuthDeg, 0.0001);
});

test('时段口径排距大于正午口径，阴影取南北向分量', () => {
  const noon = rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 32 });
  const windowed = rowPitch({
    tiltDeg: 25,
    moduleLengthMm: module620.lengthMm,
    latitude: 32,
    shadingMode: 'window'
  });

  assert.equal(windowed.shadingMode, 'window');
  closeTo(windowed.altitudeDeg, 19.83, 0.01);
  closeTo(windowed.azimuthDeg, 43.6, 0.05);
  closeTo(windowed.shadowLengthMm, 2021.5, 1);
  closeTo(windowed.rowPitchMm, 4180.3, 1);
  assert.ok(windowed.rowPitchMm > noon.rowPitchMm);
  // 时段口径的投影与阵列高度与正午口径一致，差异全部来自阴影
  closeTo(windowed.projectionMm, noon.projectionMm, 0.001);
  closeTo(windowed.arrayHeightMm, noon.arrayHeightMm, 0.001);
});

test('时段口径与 GB 50797 系数公式结果一致', () => {
  // GB 50797 系数法：阴影比 = (0.707·tanφ + 0.4338) / (0.707 − 0.4338·tanφ)
  const latitude = 32;
  const tanPhi = Math.tan((latitude * Math.PI) / 180);
  const gbRatio = (0.707 * tanPhi + 0.4338) / (0.707 - 0.4338 * tanPhi);

  const windowed = rowPitch({
    tiltDeg: 25,
    moduleLengthMm: module620.lengthMm,
    latitude,
    shadingMode: 'window'
  });
  const actualRatio = windowed.shadowLengthMm / windowed.arrayHeightMm;
  closeTo(actualRatio, gbRatio, 0.01);
});

test('缺省口径为正午，与显式传 noon 结果一致', () => {
  const implicitNoon = rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 32 });
  const explicitNoon = rowPitch({
    tiltDeg: 25,
    moduleLengthMm: module620.lengthMm,
    latitude: 32,
    shadingMode: 'noon'
  });
  assert.equal(implicitNoon.shadingMode, 'noon');
  assert.deepEqual(implicitNoon, explicitNoon);
});

test('未知口径直接抛错，而不是悄悄退回正午', () => {
  assert.throws(
    () => rowPitch({ tiltDeg: 25, moduleLengthMm: module620.lengthMm, latitude: 32, shadingMode: 'dusk' }),
    /未知间距口径/
  );
});

test('时段口径下零倾角阵列阴影仍为零', () => {
  const pitch = rowPitch({
    tiltDeg: 0,
    moduleLengthMm: module620.lengthMm,
    latitude: 32,
    shadingMode: 'window'
  });
  assert.equal(pitch.shadowLengthMm, 0);
  closeTo(pitch.rowPitchMm, module620.lengthMm, 0.5);
});

test('场地排布：时段口径排距变大，同场地排数与容量下降', () => {
  const base = {
    siteWidthMm: 50000,
    siteDepthMm: 30000,
    tiltDeg: 25,
    latitude: 32,
    gapMm: 20,
    moduleLengthMm: module620.lengthMm,
    moduleWidthMm: module620.widthMm,
    pmax: module620.pmax
  };
  const noon = arrayPlan(base);
  const windowed = arrayPlan({ ...base, shadingMode: 'window' });

  assert.equal(windowed.shadingMode, 'window');
  assert.equal(windowed.rows, 7);
  assert.equal(windowed.totalModules, 301);
  assert.equal(windowed.capacityKw, 186.62);
  closeTo(windowed.usedDepthMm, 27241, 5);
  assert.ok(windowed.usedDepthMm <= 30000);
  // 每排块数只取决于场地宽度与组件宽度，不随口径变化
  assert.equal(windowed.modulesPerRow, noon.modulesPerRow);
  assert.ok(windowed.rows < noon.rows);
  assert.ok(windowed.capacityKw < noon.capacityKw);
});
