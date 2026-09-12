import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CABLE_LIMITS,
  CONDUCTOR_MATERIALS,
  cableCalc,
  evaluateCable,
  recommendSize,
  resolveMaterial,
  round,
  standardSizes
} from '../src/cable.js';

const baseArgs = {
  material: 'cu',
  lengthM: 30,
  area: 4,
  voltage: 626,
  current: 18.19
};

test('电缆压降：4mm² 铜芯 30m 的回路电阻、压降与线损', () => {
  const calc = cableCalc(baseArgs);
  // 回路长度 60m：R = 0.0225 × 60 / 4 = 0.3375 Ω
  assert.equal(calc.loopLengthM, 60);
  assert.equal(calc.resistance, 0.3375);
  assert.equal(calc.dropVoltage, 6.14);
  assert.equal(calc.dropPercent, 0.981);
  assert.equal(calc.lossWatt, 111.7);
});

test('电缆校核：压降 ≤2% 判合格，2%–3% 判提示，＞3% 判不通过', () => {
  const pass = evaluateCable({
    material: 'cu',
    cableLengthM: 30,
    stringVoltage: 626,
    stringCurrent: 18.19,
    conductorArea: 4,
    allowedDropPercent: 2
  });
  assert.equal(pass.status, 'pass');
  assert.equal(pass.checks.drop2.pass, true);
  assert.equal(pass.checks.drop3.pass, true);

  const warn = evaluateCable({
    material: 'cu',
    cableLengthM: 30,
    stringVoltage: 626,
    stringCurrent: 18.19,
    conductorArea: 1.5,
    allowedDropPercent: 2
  });
  assert.equal(warn.dropPercent, 2.615);
  assert.equal(warn.status, 'warn');
  assert.equal(warn.checks.drop2.pass, false);
  assert.equal(warn.checks.drop3.pass, true);

  const fail = evaluateCable({
    material: 'al',
    cableLengthM: 50,
    stringVoltage: 600,
    stringCurrent: 15,
    conductorArea: 2.5,
    allowedDropPercent: 2
  });
  assert.equal(fail.dropPercent, 3.6);
  assert.equal(fail.status, 'fail');
  assert.equal(fail.checks.drop3.pass, false);
});

test('线损功率与 I×ΔV 一致（含取整误差），且随截面加倍而减半', () => {
  const small = cableCalc({ ...baseArgs, area: 3 });
  const large = cableCalc({ ...baseArgs, area: 6 });
  assert.ok(Math.abs(small.current * small.dropVoltage - small.lossWatt) < 0.15);
  assert.equal(round(small.resistance / large.resistance, 3), 2);
  assert.ok(Math.abs(small.lossWatt / large.lossWatt - 2) < 0.005);
});

test('同截面同长度下铝芯电阻与压降为铜芯的 1.6 倍', () => {
  const args = { lengthM: 40, area: 6, voltage: 600, current: 20 };
  const cu = cableCalc({ ...args, material: 'cu' });
  const al = cableCalc({ ...args, material: 'al' });
  assert.equal(round(al.resistance / cu.resistance, 3), round(CONDUCTOR_MATERIALS.al.rho / CONDUCTOR_MATERIALS.cu.rho, 3));
  assert.equal(cu.dropPercent, 1);
  assert.equal(al.dropPercent, 1.6);
});

test('截面反推：理论最小值上靠标准规格，2% 档推荐 2.5mm²', () => {
  const rec = recommendSize({
    material: 'cu',
    lengthM: 30,
    voltage: 626,
    current: 18.19,
    allowedPercent: 2
  });
  assert.equal(rec.theoreticalMinArea, 1.96);
  assert.equal(rec.recommendedArea, 2.5);
  assert.equal(rec.candidates.length, standardSizes().length);
  assert.equal(rec.candidates.find((item) => item.area === 1.5).pass, false);
  assert.equal(rec.candidates.find((item) => item.area === 2.5).pass, true);
});

test('截面反推：允许 3% 时 1.5mm² 已满足', () => {
  const rec = recommendSize({
    material: 'cu',
    lengthM: 30,
    voltage: 626,
    current: 18.19,
    allowedPercent: 3
  });
  assert.equal(rec.theoreticalMinArea, 1.31);
  assert.equal(rec.recommendedArea, 1.5);
});

test('截面反推：最大标准截面仍超限时返回 null，并保留全部候选供提示', () => {
  const rec = recommendSize({
    material: 'cu',
    lengthM: 500,
    voltage: 300,
    current: 30,
    allowedPercent: 0.5
  });
  assert.equal(rec.recommendedArea, null);
  assert.ok(rec.theoreticalMinArea > 400);
  assert.equal(rec.candidates[rec.candidates.length - 1].area, 400);
  assert.equal(rec.candidates[rec.candidates.length - 1].pass, false);
});

test('非法材质与非正参数返回 null，材质别名大小写不敏感', () => {
  assert.equal(resolveMaterial('gold'), null);
  assert.equal(resolveMaterial('CU').id, 'cu');
  assert.equal(cableCalc({ ...baseArgs, material: 'gold' }), null);
  assert.equal(cableCalc({ ...baseArgs, lengthM: 0 }), null);
  assert.equal(cableCalc({ ...baseArgs, area: Number.NaN }), null);
  assert.equal(evaluateCable({ material: 'gold', cableLengthM: 30, stringVoltage: 600, stringCurrent: 18, conductorArea: 4 }), null);
});

test('标准截面系列升序且覆盖光伏常用规格，输入限值与默认值齐备', () => {
  const sizes = standardSizes();
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
  assert.ok(sizes.includes(4));
  assert.ok(sizes.includes(400));
  assert.equal(CABLE_LIMITS.stringVoltage.default, 626);
  assert.equal(CABLE_LIMITS.allowedDropPercent.default, 2);
});
