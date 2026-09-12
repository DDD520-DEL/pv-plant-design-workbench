import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILTIN_INVERTERS, BUILTIN_MODULES } from '../src/catalogs.js';
import {
  evaluateElectric,
  impAt,
  iscAt,
  parallelLimit,
  round,
  seriesRange,
  tempCorrect,
  vocAt,
  vmpAt
} from '../src/pv-math.js';

const module620 = BUILTIN_MODULES.find((item) => item.id === 'mod-620');
const inverter25 = BUILTIN_INVERTERS.find((item) => item.id === 'inv-25k');

const baseInput = {
  module: module620,
  inverter: inverter25,
  seriesPerString: 18,
  stringsPerMppt: 1,
  mpptUsed: 3,
  minCellTemp: -10,
  maxCellTemp: 70
};

test('温度修正：低温抬高开路电压、高温压低工作电压', () => {
  assert.equal(round(vocAt(module620, -10), 2), 45.24);
  assert.equal(round(vocAt(module620, 25), 2), 41.6);
  assert.equal(round(vmpAt(module620, 70), 2), 30.26);
  assert.equal(round(iscAt(module620, 70), 2), 19.28);
  assert.equal(round(impAt(module620, 70), 2), 18.19);
});

test('温度修正：系数为零时保持原值，非法输入返回 NaN', () => {
  assert.equal(tempCorrect(41.6, 0, 70), 41.6);
  assert.ok(Number.isNaN(tempCorrect(41.6, -0.25, Number.NaN)));
  assert.ok(Number.isNaN(tempCorrect(Number.NaN, -0.25, 70)));
});

test('串联数区间：上限由最大直流电压与 MPPT 上限共同约束，下限由 MPPT 下限约束', () => {
  const range = seriesRange(module620, inverter25, { minCellTemp: -10, maxCellTemp: 70 });
  assert.equal(range.vocCold, 45.24);
  assert.equal(range.vmpCold, 38.33);
  assert.equal(range.vmpHot, 30.26);
  assert.equal(range.byDcMax, 24);
  assert.equal(range.byMpptMax, 26);
  assert.equal(range.min, 7);
  assert.equal(range.max, 24);
  assert.equal(range.feasible, true);
});

test('每路并联上限：工作电流与短路电流两条约束取更严的一侧', () => {
  const limit = parallelLimit(module620, inverter25, 70);
  assert.equal(limit.impHot, 18.19);
  assert.equal(limit.iscHot, 19.28);
  assert.equal(limit.byCurrent, 2);
  assert.equal(limit.byIsc, 3);
  assert.equal(limit.max, 2);
});

test('电气校核：默认参数全部通过', () => {
  const result = evaluateElectric(baseInput);
  assert.equal(result.status, 'pass');
  assert.equal(result.checks.every((item) => item.pass), true);
  assert.equal(result.metrics.stringCount, 3);
  assert.equal(result.metrics.totalModules, 54);
  assert.equal(result.metrics.dcKw, 33.48);
  assert.equal(result.metrics.dcAcRatio, 1.339);
});

test('电气校核：低温开路电压超过逆变器上限时报不通过', () => {
  const result = evaluateElectric({ ...baseInput, seriesPerString: 25 });
  const target = result.checks.find((item) => item.id === 'voc-cold');
  assert.equal(target.pass, false);
  assert.equal(target.actual, 1131);
  assert.equal(target.limit, 1100);
  assert.equal(result.status, 'fail');
});

test('电气校核：高温工作电压低于 MPPT 下限时报不通过', () => {
  const result = evaluateElectric({ ...baseInput, seriesPerString: 5 });
  const target = result.checks.find((item) => item.id === 'vmp-hot');
  assert.equal(target.pass, false);
  assert.equal(target.actual, 151.29);
  assert.equal(result.status, 'fail');
});

test('电气校核：每路并联三串时工作电流超限', () => {
  const result = evaluateElectric({ ...baseInput, stringsPerMppt: 3 });
  const target = result.checks.find((item) => item.id === 'mppt-current');
  assert.equal(target.pass, false);
  assert.equal(target.actual, 54.57);
  assert.equal(target.limit, 40);
  assert.equal(result.status, 'fail');
});

test('电气校核：直流侧超过逆变器最大直流输入功率时报不通过', () => {
  const result = evaluateElectric({ ...baseInput, seriesPerString: 22 });
  const power = result.checks.find((item) => item.id === 'dc-power');
  assert.equal(power.pass, false);
  assert.equal(power.actual, 40.92);
  assert.equal(power.limit, 37.5);
  assert.equal(result.status, 'fail');
});

test('电气校核：容配比偏低只给提示级告警，不判不通过', () => {
  const result = evaluateElectric({ ...baseInput, mpptUsed: 1 });
  const ratio = result.checks.find((item) => item.id === 'dc-ac-ratio-min');
  assert.equal(ratio.pass, false);
  assert.equal(ratio.level, 'warn');
  assert.equal(result.status, 'warn');
  assert.equal(
    result.checks.some((item) => !item.pass && item.level === 'error'),
    false
  );
});

test('电气校核：缺少工作电压温度系数时回退到开路电压温度系数', () => {
  const legacy = { ...module620, betaVmp: undefined };
  const withFallback = evaluateElectric({ ...baseInput, module: legacy });
  const explicit = evaluateElectric({ ...baseInput, module: { ...module620, betaVmp: module620.betaVoc } });
  assert.equal(withFallback.metrics.vmpHot, explicit.metrics.vmpHot);
  assert.equal(round(withFallback.metrics.vmpHot, 2), 30.88);
});

test('电气校核：使用路数超过逆变器 MPPT 路数时需要外部拦截', () => {
  const result = evaluateElectric({ ...baseInput, mpptUsed: 4 });
  assert.equal(result.metrics.stringCount, 4);
  assert.equal(result.checks.some((item) => item.pass === false), true);
});
