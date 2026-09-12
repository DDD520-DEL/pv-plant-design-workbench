import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GROUNDING_LIMITS,
  GRID_TYPES,
  LIGHTNING_ZONES,
  RESISTANCE_LIMITS,
  estimateGroundingCounts,
  evaluateGrounding,
  horizontalStripResistance,
  resolveGridType,
  resolveThunderZone,
  round,
  verticalRodResistance,
  verticalUtilization
} from '../src/grounding.js';

const baseArgs = {
  thunderDays: 30,
  soilResistivity: 100,
  gridType: 'ring',
  // 与默认排布结果一致的阵列外缘：50m × 约26.6m，8 排
  widthM: 50,
  depthM: 26.6,
  rows: 8
};

test('雷暴分区：少雷/中雷/多雷/强雷分界与极间距、网格模数', () => {
  assert.equal(resolveThunderZone(0).id, 'light');
  assert.equal(resolveThunderZone(15).id, 'light');
  assert.equal(resolveThunderZone(15.1).id, 'normal');
  assert.equal(resolveThunderZone(40).id, 'normal');
  assert.equal(resolveThunderZone(41).id, 'heavy');
  assert.equal(resolveThunderZone(90).id, 'heavy');
  assert.equal(resolveThunderZone(91).id, 'extreme');
  assert.equal(resolveThunderZone(200).id, 'extreme');
  assert.equal(resolveThunderZone(-1), null);
  assert.equal(resolveThunderZone(Number.NaN), null);

  assert.equal(LIGHTNING_ZONES.light.rodSpacingM, 5);
  assert.equal(LIGHTNING_ZONES.normal.rodSpacingM, 5);
  assert.equal(LIGHTNING_ZONES.heavy.rodSpacingM, 4);
  assert.equal(LIGHTNING_ZONES.extreme.rodSpacingM, 4);
  assert.equal(LIGHTNING_ZONES.normal.lightningClass, '第三类');
  assert.equal(LIGHTNING_ZONES.heavy.lightningClass, '第二类');
});

test('接地网形式解析：大小写空白不敏感，非法形式返回 null', () => {
  assert.equal(resolveGridType(' RING ').id, 'ring');
  assert.equal(resolveGridType('MESH').id, 'mesh');
  assert.equal(resolveGridType('rods').id, 'rods');
  assert.equal(resolveGridType('star'), null);
  assert.equal(resolveGridType(123), null);
  assert.deepEqual(Object.keys(GRID_TYPES).sort(), ['mesh', 'ring', 'rods']);
});

test('单根垂直接地极：R 与 ρ 成正比，2.5m 角钢 ρ=100 时约 34.8Ω', () => {
  const r100 = verticalRodResistance(100);
  assert.ok(Math.abs(r100 - 34.84) < 0.01);
  assert.ok(Math.abs(verticalRodResistance(1000) - 348.4) < 0.1);
  assert.ok(Math.abs(verticalRodResistance(3000) - 1045.2) < 0.1);
  // 加长极体可降阻
  assert.ok(verticalRodResistance(100, 3.0) < r100);
  assert.equal(Number.isNaN(verticalRodResistance(0)), true);
  assert.equal(Number.isNaN(verticalRodResistance(100, 0)), true);
});

test('水平接地带：长度越长电阻越低，埋深加大电阻略降，非法入参 NaN', () => {
  const r153 = horizontalStripResistance(100, 153.2);
  assert.ok(Math.abs(r153 - 1.475) < 0.01);
  assert.ok(horizontalStripResistance(100, 300) < r153);
  assert.ok(horizontalStripResistance(100, 153.2, 1.0) < r153);
  assert.equal(Number.isNaN(horizontalStripResistance(100, 0)), true);
  assert.equal(Number.isNaN(horizontalStripResistance(100, 100, 0)), true);
});

test('利用系数：极数越多屏蔽越强，网格最低封底 0.4', () => {
  assert.equal(verticalUtilization('rods', 4), 0.8);
  assert.equal(verticalUtilization('rods', 24), 0.76);
  assert.equal(verticalUtilization('rods', 400), 0.45);
  assert.equal(verticalUtilization('ring', 20), 0.78);
  assert.ok(Math.abs(verticalUtilization('ring', 32) - 0.738) < 1e-9);
  assert.ok(Math.abs(verticalUtilization('ring', 32, 4) - 0.658) < 1e-9);
  assert.equal(verticalUtilization('ring', 400), 0.4);
  assert.equal(verticalUtilization('mesh', 30), 0.72);
  assert.equal(verticalUtilization('mesh', 400), 0.4);
});

test('接地体数量结合阵列外缘尺寸与排数，而非按孤立点 1 根估算', () => {
  const zone = resolveThunderZone(30);
  const full = estimateGroundingCounts({ widthM: 50, depthM: 26.6, rows: 8, gridType: 'ring', zone });
  // 长边 11 极（含两端）×2 + 短边扣除两角各 5 极 ×2 = 32
  assert.equal(full.rodCount, 32);
  assert.equal(full.rodSpacingM, 5);
  assert.equal(full.perimeterM, 153.2);
  assert.equal(full.stripLengthM, 153.2);
  assert.equal(full.rows, 8);

  // 占地变小，极数与周长同步减少；rows=0（排布无解）拒绝估算
  const small = estimateGroundingCounts({ widthM: 50, depthM: 6, rows: 2, gridType: 'ring', zone });
  assert.equal(small.rodCount, 24);
  assert.equal(small.perimeterM, 112);
  assert.equal(estimateGroundingCounts({ widthM: 50, depthM: 26.6, rows: 0, gridType: 'ring', zone }), null);
});

test('三种接地网形式：rods 仅等电位连通、ring 走外缘、mesh 补内部网格', () => {
  const normal = resolveThunderZone(30);
  const rods = estimateGroundingCounts({ ...baseArgs, gridType: 'rods', zone: normal });
  const ring = estimateGroundingCounts({ ...baseArgs, gridType: 'ring', zone: normal });
  const mesh = estimateGroundingCounts({ ...baseArgs, gridType: 'mesh', zone: normal });

  assert.equal(rods.rodCount, 32);
  assert.equal(rods.bondingOnly, true);
  assert.equal(ring.rodCount, 32);
  assert.equal(ring.bondingOnly, false);
  // 中雷区网格模数 15m：横向 3 条线 × 长边 11 极 = 33 根；带长 = 周长 + 50 + 2×26.6
  assert.equal(mesh.rodCount, 33);
  assert.equal(mesh.stripLengthM, 283);
  assert.equal(mesh.innerGrids, 4);

  // 多雷区极间距加密到 4m、网格模数 10m，极数显著增加
  const heavy = resolveThunderZone(60);
  const dense = estimateGroundingCounts({ ...baseArgs, gridType: 'mesh', zone: heavy });
  assert.equal(dense.rodSpacingM, 4);
  assert.equal(dense.rodCount, 56);
  assert.equal(dense.stripLengthM, 359.6);
});

test('默认工况（ρ=100、中雷区、环形网、50×26.6m）：接地电阻约 0.83Ω，两档限值均满足', () => {
  const r = evaluateGrounding(baseArgs);
  assert.equal(r.status, 'pass');
  assert.equal(r.base.rodCount, 32);
  assert.equal(r.base.resistanceOhm, 0.83);
  assert.equal(r.design.rodsAdded, 0);
  assert.equal(r.design.innerGridsAdded, 0);
  assert.equal(r.design.stripAddedM, 0);
  assert.equal(r.checks.working.limit, RESISTANCE_LIMITS.working);
  assert.equal(r.checks.lightning.limit, RESISTANCE_LIMITS.lightning);
  assert.equal(r.checks.working.pass, true);
  assert.equal(r.checks.lightning.pass, true);
  assert.ok(r.checks.working.marginPercent > 70);
  assert.equal(r.environment.zone.id, 'normal');
  assert.equal(r.lightning.classLabel, '第三类');
  assert.equal(r.gridType.id, 'ring');
});

test('材料规格建议：L50×5×2500 角钢垂直极 + -40×4 扁钢埋深 0.8m', () => {
  const r = evaluateGrounding(baseArgs);
  assert.equal(r.vertical.specLabel, 'L50×5×2500');
  assert.equal(r.vertical.lengthMm, 2500);
  assert.equal(r.vertical.spacingMm, 5000);
  assert.equal(r.vertical.count, 32);
  assert.equal(r.horizontal.specLabel, '-40×4');
  assert.equal(r.horizontal.burialDepthMm, 800);
  assert.equal(r.horizontal.totalLengthM, 153.2);
  assert.equal(r.horizontal.bondingOnly, false);
  // 引下/连接点按外缘周长每 25m 一处，不少于 4 处
  assert.equal(r.lightning.downConductorCount, 7);

  const rods = evaluateGrounding({ ...baseArgs, gridType: 'rods' });
  assert.equal(rods.horizontal.bondingOnly, true);
  assert.ok(rods.advice.some((text) => text.includes('首尾焊通')));
});

test('高电阻率 ρ=1000：初估 8.25Ω 不满足 4Ω，自动加密到约 3.94Ω 并补内部均压带', () => {
  const r = evaluateGrounding({ ...baseArgs, soilResistivity: 1000 });
  assert.equal(r.base.resistanceOhm, 8.25);
  assert.equal(r.status, 'pass');
  assert.equal(r.design.rodCount, 152);
  assert.equal(r.design.rodsAdded, 120);
  assert.equal(r.design.innerGridsAdded, 4);
  assert.equal(r.design.stripAddedM, 306.4);
  assert.ok(Math.abs(r.design.resistanceOhm - 3.94) < 0.01);
  assert.equal(r.checks.working.pass, true);
  assert.equal(r.checks.lightning.pass, true);
});

test('ρ=3000：加密到上限仍达不到 4Ω，判 fail 但满足 10Ω，并给降阻剂/换土建议', () => {
  const r = evaluateGrounding({ ...baseArgs, soilResistivity: 3000 });
  assert.equal(r.status, 'fail');
  assert.ok(r.design.rodCount <= 200);
  assert.equal(r.design.rodsAdded, 168);
  assert.equal(r.checks.working.pass, false);
  assert.equal(r.checks.lightning.pass, true);
  assert.ok(r.design.resistanceOhm > 4);
  assert.ok(r.design.resistanceOhm <= 10);
  assert.ok(r.advice.some((text) => text.includes('工作与保护接地 4')));
  assert.ok(r.advice.some((text) => text.includes('降阻剂') || text.includes('换土')));
});

test('同工况下网格接地网比环形网初估电阻更低，多雷区触发第二类防雷说明', () => {
  const ring = evaluateGrounding({ ...baseArgs, thunderDays: 60, soilResistivity: 1000 });
  const mesh = evaluateGrounding({ ...baseArgs, thunderDays: 60, soilResistivity: 1000, gridType: 'mesh' });
  assert.ok(mesh.base.rodCount > ring.base.rodCount);
  assert.ok(mesh.base.resistanceOhm < ring.base.resistanceOhm);
  assert.ok(mesh.advice.some((text) => text.includes('第二类防雷')));
  assert.equal(mesh.lightning.meshCellM.depth, 10);
  assert.equal(mesh.lightning.meshCellM.width, 10);
});

test('主入口：非法入参返回 null，入限值与默认值齐备', () => {
  assert.equal(evaluateGrounding({ ...baseArgs, gridType: 'star' }), null);
  assert.equal(evaluateGrounding({ ...baseArgs, thunderDays: -1 }), null);
  assert.equal(evaluateGrounding({ ...baseArgs, soilResistivity: 0 }), null);
  assert.equal(evaluateGrounding({ ...baseArgs, widthM: 0 }), null);
  assert.equal(evaluateGrounding({ ...baseArgs, rows: 0 }), null);
  // gridType 缺省按环形网
  const { gridType, ...rest } = baseArgs;
  assert.equal(evaluateGrounding(rest).gridType.id, 'ring');

  assert.equal(GROUNDING_LIMITS.thunderDays.default, 30);
  assert.equal(GROUNDING_LIMITS.soilResistivity.default, 100);
  assert.deepEqual([GROUNDING_LIMITS.thunderDays.min, GROUNDING_LIMITS.thunderDays.max], [0, 200]);
  assert.deepEqual([GROUNDING_LIMITS.soilResistivity.min, GROUNDING_LIMITS.soilResistivity.max], [1, 5000]);

  const r = evaluateGrounding(baseArgs);
  assert.ok(r.notes.length >= 3);
  assert.ok(r.notes.some((text) => text.includes('利用系数')));
});

test('round 工具函数与既有模块同口径', () => {
  assert.equal(round(3.14159, 2), 3.14);
  assert.equal(round(2.5, 0), 3);
  assert.equal(round(Number.NaN), Number.NaN);
});
