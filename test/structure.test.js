import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STABILITY_LIMITS,
  STRUCTURE_LIMITS,
  SOIL_TYPES,
  evaluateFoundation,
  evaluateLoads,
  evaluateStructure,
  rackGeometry,
  recommendPost,
  recommendPurlin,
  resolveSoilType,
  round,
  snowDistributionFactor,
  windHeightFactor,
  windShapeFactor
} from '../src/structure.js';

const baseArgs = {
  windPressure: 0.4,
  snowPressure: 0.4,
  tiltDeg: 25,
  arrayHeightMm: 500,
  modulesAlongSlope: 2,
  moduleLengthMm: 2382,
  postSpacingMm: 2268
};

test('风压/雪压系数：体型系数随倾角增大，积雪分布系数 25° 后递减并封底 0.6', () => {
  assert.equal(windShapeFactor(0), 0.9);
  assert.equal(windShapeFactor(25), 1.1);
  assert.equal(windShapeFactor(40), 1.22);
  assert.equal(windShapeFactor(60), 1.38);

  assert.equal(snowDistributionFactor(0), 1.0);
  assert.equal(snowDistributionFactor(25), 1.0);
  assert.equal(snowDistributionFactor(40), 0.85);
  assert.ok(Math.abs(snowDistributionFactor(60) - 0.65) < 1e-9);
  assert.equal(snowDistributionFactor(70), 0.6);
});

test('风压高度变化系数：10m 以下取 1.0，15m 按 B 类幂律插值', () => {
  assert.equal(windHeightFactor(1.5), 1.0);
  assert.equal(windHeightFactor(10), 1.0);
  assert.ok(Math.abs(windHeightFactor(15) - 1.5 ** 0.3) < 1e-9);
  assert.equal(round(windHeightFactor(15), 4), 1.1293);
});

test('断面几何：斜长、水平投影、顶端与合力点高度', () => {
  const g = rackGeometry({
    modulesAlongSlope: 2,
    moduleLengthMm: 2382,
    tiltDeg: 25,
    arrayHeightMm: 500
  });
  assert.equal(g.slopeLengthMm, 4764);
  // 4764 × cos25° ≈ 4317.4
  assert.ok(Math.abs(g.projectionMm - 4317) <= 1);
  // 500 + 4764 × sin25° ≈ 2513
  assert.ok(Math.abs(g.topHeightMm - 2513) <= 1);
  assert.equal(g.centroidHeightMm, Math.round((500 + g.topHeightMm) / 2));
});

test('荷载标准值：w_k=βz·μs·μz·w0，雪荷载按水平投影面积', () => {
  const loads = evaluateLoads(baseArgs);
  assert.equal(loads.wind.shapeFactor, 1.1);
  assert.equal(loads.wind.heightFactor, 1);
  assert.equal(loads.wind.standardKpa, 0.44);
  // 受风面积 4.764 × 2.268 ≈ 10.80 m²
  assert.ok(Math.abs(loads.slopeAreaM2 - 10.805) < 0.01);
  assert.equal(loads.wind.forceKn, 4.75);
  // 水平力 = 4.75 × cos25°，上拔力 = 4.75 × sin25°
  assert.ok(Math.abs(loads.wind.horizontalKn - 4.31) < 0.01);
  assert.ok(Math.abs(loads.wind.upliftKn - 2.01) < 0.01);

  assert.equal(loads.snow.distributionFactor, 1);
  assert.equal(loads.snow.standardKpa, 0.4);
  assert.equal(loads.snow.forceKn, 3.92);
});

test('立柱选型：按风水平力底部弯矩选方矩管，默认工况选 □80×80×3', () => {
  const post = recommendPost(evaluateLoads(baseArgs));
  assert.equal(post.count, 2);
  // M = 4.31/2 × 1.507 ≈ 3.25 kN·m
  assert.ok(Math.abs(post.baseMomentKnM - 3.25) < 0.01);
  assert.ok(Math.abs(post.requiredSectionModulusCm3 - 17.77) < 0.05);
  assert.equal(post.size.label, '□80×80×3');
  assert.ok(post.candidates[0].pass === false);
  assert.ok(post.candidates.every((item) => item.pass === (item.sectionModulusCm3 >= post.requiredSectionModulusCm3)));
});

test('檩条选型：雪压 0.4 时檩距 1.0m，选 C80 规格并给出道数', () => {
  const purlin = recommendPurlin(evaluateLoads(baseArgs));
  assert.equal(purlin.spacingMm, 1000);
  assert.equal(purlin.spanMm, 2268);
  assert.equal(purlin.count, 6);
  // M = 0.55 × 2.268² / 8 ≈ 0.354 kN·m
  assert.ok(Math.abs(purlin.midMomentKnM - 0.354) < 0.005);
  assert.equal(purlin.size.model, 'C80×40×20×2.0');
});

test('檩距随雪压分档：无雪 1.2m、中雪 1.0m、大雪 0.8m', () => {
  const noSnow = recommendPurlin(evaluateLoads({ ...baseArgs, snowPressure: 0 }));
  const heavySnow = recommendPurlin(evaluateLoads({ ...baseArgs, snowPressure: 0.9 }));
  assert.equal(noSnow.spacingMm, 1200);
  assert.equal(noSnow.count, 5);
  assert.equal(heavySnow.spacingMm, 800);
  assert.equal(heavySnow.count, 7);
});

test('基础选型与稳定：默认工况 1300×350 方板，抗倾覆与抗滑移均满足', () => {
  const foundation = evaluateFoundation(evaluateLoads(baseArgs), SOIL_TYPES.silt);
  assert.equal(foundation.status, 'pass');
  assert.equal(foundation.slab.sideMm, 1300);
  assert.equal(foundation.slab.thicknessMm, 350);
  assert.ok(Math.abs(foundation.slab.weightKn - 14.2) < 0.05);

  const { overturning, sliding } = foundation.checks;
  assert.equal(overturning.limit, STABILITY_LIMITS.overturning);
  assert.ok(Math.abs(overturning.actual - 1.81) < 0.02);
  assert.equal(overturning.pass, true);
  assert.equal(sliding.limit, STABILITY_LIMITS.sliding);
  assert.ok(Math.abs(sliding.actual - 1.68) < 0.02);
  assert.equal(sliding.pass, true);
});

test('大风压 + 黏性土：抗倾覆可通过但抗滑移不足，整体判 fail', () => {
  const loads = evaluateLoads({ ...baseArgs, windPressure: 1.2, snowPressure: 0.8 });
  const foundation = evaluateFoundation(loads, SOIL_TYPES.clay);
  assert.equal(foundation.soil.friction, 0.3);
  assert.equal(foundation.checks.overturning.pass, true);
  assert.equal(foundation.checks.sliding.pass, false);
  assert.ok(foundation.checks.sliding.actual < STABILITY_LIMITS.sliding);
  assert.equal(foundation.status, 'fail');
});

test('碎石土地基摩擦系数高，抗滑移富余更大', () => {
  const silt = evaluateFoundation(evaluateLoads(baseArgs), SOIL_TYPES.silt);
  const gravel = evaluateFoundation(evaluateLoads(baseArgs), SOIL_TYPES.gravel);
  assert.ok(gravel.checks.sliding.actual > silt.checks.sliding.actual);
  assert.equal(gravel.status, 'pass');
});

test('主入口：默认工况整体通过并返回荷载、立柱、檩条、基础与说明', () => {
  const result = evaluateStructure({ ...baseArgs, soilType: 'silt' });
  assert.equal(result.status, 'pass');
  assert.ok(result.notes.length >= 3);
  assert.ok(result.post.size.label.includes('80'));
  assert.equal(result.purlin.size.model, 'C80×40×20×2.0');
  assert.equal(result.foundation.status, 'pass');
  assert.equal(result.loads.geometry.tiltDeg, 25);
});

test('主入口：土类别缺省按粉土/砂土，非法土类别或非法参数返回 null', () => {
  const defaults = evaluateStructure(baseArgs);
  assert.equal(defaults.foundation.soil.id, 'silt');
  assert.equal(evaluateStructure({ ...baseArgs, soilType: 'rock' }), null);
  assert.equal(evaluateStructure({ ...baseArgs, windPressure: 0 }), null);
  assert.equal(evaluateStructure({ ...baseArgs, modulesAlongSlope: 0 }), null);
  assert.equal(evaluateStructure({ ...baseArgs, snowPressure: Number.NaN }), null);
});

test('土类别解析大小写不敏感，输入限值与默认值齐备', () => {
  assert.equal(resolveSoilType('CLAY').id, 'clay');
  assert.equal(resolveSoilType(' gravel ').id, 'gravel');
  assert.equal(resolveSoilType('sand'), null);
  assert.equal(resolveSoilType(123), null);

  assert.equal(STRUCTURE_LIMITS.windPressure.default, 0.4);
  assert.equal(STRUCTURE_LIMITS.snowPressure.default, 0.4);
  assert.equal(STRUCTURE_LIMITS.modulesAlongSlope.default, 2);
  assert.equal(STRUCTURE_LIMITS.postSpacingMm.default, 2268);
});
