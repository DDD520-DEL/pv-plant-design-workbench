import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CABLE_LINK_FIELDS,
  autoCableValues,
  buildCableLink,
  formatLinkedValue,
  resolveLinkedField
} from '../src/cable-link.js';

const metrics = { stringVmpHot: 544.65, mpptCurrent: 18.19 };

test('autoCableValues：从电气校核指标取组串高温工作电压与每路工作电流', () => {
  assert.deepEqual(autoCableValues(metrics), { voltage: 544.65, current: 18.19 });
  assert.deepEqual(autoCableValues(undefined), { voltage: undefined, current: undefined });
});

test('默认（未手填）自动跟随电气校核结果', () => {
  const link = buildCableLink({
    metrics,
    manual: { voltage: 626, current: 20 },
    touched: { voltage: false, current: false }
  });
  assert.equal(link.fields.voltage.source, 'auto');
  assert.equal(link.fields.voltage.value, 544.65);
  assert.equal(link.fields.current.source, 'auto');
  assert.equal(link.fields.current.value, 18.19);
  assert.equal(link.values.stringVoltage, 544.65);
  assert.equal(link.values.stringCurrent, 18.19);
  assert.equal(link.overrides.length, 0);
  assert.equal(link.notice, null);
});

test('手填值在容差内视为一致，仍以手填值覆盖且不提示', () => {
  const link = buildCableLink({
    metrics,
    // 电压差 0.5 恰好等于容差上界（判据为严格大于）；电流差 0.005 同理
    manual: { voltage: 545.15, current: 18.195 },
    touched: { voltage: true, current: true }
  });
  assert.equal(link.fields.voltage.source, 'manual');
  assert.equal(link.fields.voltage.mismatch, false);
  assert.equal(link.fields.current.mismatch, false);
  assert.equal(link.values.stringVoltage, 545.15);
  assert.equal(link.overrides.length, 0);
  assert.equal(link.notice, null);
});

test('手填值超出容差：按手填值计算并给出不一致提示', () => {
  const link = buildCableLink({
    metrics,
    manual: { voltage: 626, current: 18.19 },
    touched: { voltage: true, current: true }
  });
  assert.equal(link.fields.voltage.source, 'manual');
  assert.equal(link.fields.voltage.mismatch, true);
  assert.equal(link.values.stringVoltage, 626);
  assert.equal(link.fields.current.mismatch, false);
  assert.equal(link.values.stringCurrent, 18.19);
  assert.equal(link.overrides.length, 1);
  assert.equal(link.overrides[0].name, 'voltage');
  assert.match(link.notice, /手填值与电气校核不一致/);
  assert.match(link.notice, /626/);
  assert.match(link.notice, /544\.65/);
  assert.match(link.notice, /组串工作电压/);
  // 电流一致时提示中不应混入电流
  assert.doesNotMatch(link.notice, /工作电流/);
});

test('电压、电流同时不一致时提示两项', () => {
  const link = buildCableLink({
    metrics,
    manual: { voltage: 600, current: 20 },
    touched: { voltage: true, current: true }
  });
  assert.equal(link.overrides.length, 2);
  assert.match(link.notice, /工作电压/);
  assert.match(link.notice, /工作电流/);
  assert.match(link.notice, /按手填值计算/);
});

test('手改过但输入框留空（NaN）：回退为自动跟随，不报错也不提示', () => {
  const link = buildCableLink({
    metrics,
    manual: { voltage: Number.NaN, current: 18.19 },
    touched: { voltage: true, current: true }
  });
  assert.equal(link.fields.voltage.source, 'auto');
  assert.equal(link.fields.voltage.value, 544.65);
  assert.equal(link.fields.voltage.mismatch, false);
  assert.equal(link.notice, null);
});

test('电气校核暂时给不出自动值时，退到手填值且不误报不一致', () => {
  const result = resolveLinkedField({
    manual: 626,
    auto: Number.NaN,
    touched: true,
    tolerance: CABLE_LINK_FIELDS.voltage.tolerance
  });
  assert.equal(result.source, 'manual');
  assert.equal(result.value, 626);
  assert.equal(result.mismatch, false);

  const neither = resolveLinkedField({
    manual: Number.NaN,
    auto: Number.NaN,
    touched: true,
    tolerance: 0.5
  });
  assert.ok(Number.isNaN(neither.value));
  assert.equal(neither.mismatch, false);
});

test('formatLinkedValue：去尾零，非法数字返回空串', () => {
  assert.equal(formatLinkedValue(544.65, 2), '544.65');
  assert.equal(formatLinkedValue(626, 2), '626');
  assert.equal(formatLinkedValue(18.1, 2), '18.1');
  assert.equal(formatLinkedValue(Number.NaN, 2), '');
});
