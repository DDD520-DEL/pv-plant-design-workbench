/**
 * 电气校核 → 直流电缆的电压/电流联动。
 *
 * 点「开始校核」时，电缆侧的组串工作电压、工作电流默认取电气校核结果中的
 * 组串高温工作电压（metrics.stringVmpHot）与每路工作电流（metrics.mpptCurrent）；
 * 两个输入框仍然保留，用户手动改过（touched）且填写了有效数字时以手填值覆盖，
 * 手填值与电气校核结果超出容差时标记 mismatch，由界面给出提示。
 *
 * 本模块只做纯计算、不碰 DOM，方便单测；输入框的回填与样式由 main.js 处理。
 */

import { round } from './cable.js';

/**
 * 容差按输入框的最小分度取一半：电压框 step=1 V，电流框 step=0.01 A。
 * 电气校核指标保留两位小数，用户按分度取整填写时不应被判作不一致。
 */
export const CABLE_LINK_FIELDS = {
  voltage: {
    key: 'stringVoltage',
    label: '组串工作电压',
    autoLabel: '电气校核组串高温工作电压',
    unit: 'V',
    tolerance: 0.5,
    digits: 2
  },
  current: {
    key: 'stringCurrent',
    label: '组串工作电流',
    autoLabel: '电气校核每路工作电流',
    unit: 'A',
    tolerance: 0.005,
    digits: 2
  }
};

/** 从电气校核指标中取出电缆联动用的电压、电流。 */
export function autoCableValues(metrics) {
  return {
    voltage: metrics?.stringVmpHot,
    current: metrics?.mpptCurrent
  };
}

/** 回填输入框用的紧凑数字串：626.00 → "626"，18.19 → "18.19"。 */
export function formatLinkedValue(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

/**
 * 判定单个字段本次校核实际采用的值。
 * - 未手动改过、或手填空格/非数字：跟随电气校核自动值；
 * - 手动填写了有效数字：采用手填值，与自动值之差超过容差时 mismatch。
 * 电气校核暂时给不出自动值时，退到手填值，避免把用户输入误清掉。
 */
export function resolveLinkedField({ manual, auto, touched, tolerance }) {
  const manualValid = Number.isFinite(manual);
  if (!Number.isFinite(auto)) {
    return {
      value: manualValid ? manual : Number.NaN,
      auto: Number.NaN,
      manual,
      source: manualValid ? 'manual' : 'auto',
      mismatch: false
    };
  }
  if (!touched || !manualValid) {
    return { value: auto, auto, manual, source: 'auto', mismatch: false };
  }
  return {
    value: manual,
    auto,
    manual,
    source: 'manual',
    mismatch: Math.abs(manual - auto) > tolerance
  };
}

function describeOverride(field, resolved) {
  return `${field.label} ${formatLinkedValue(round(resolved.manual, field.digits), field.digits)} ${field.unit}（${
    field.autoLabel
  } ${formatLinkedValue(round(resolved.auto, field.digits), field.digits)} ${field.unit}）`;
}

/**
 * 电缆联动主入口。
 *
 * @param {object} args
 * @param {{stringVmpHot:number, mpptCurrent:number}} args.metrics 电气校核指标
 * @param {{voltage?:number, current?:number}} args.manual   输入框当前手填值（空/非法给 NaN）
 * @param {{voltage?:boolean, current?:boolean}} args.touched 输入框是否被手动改过
 * @returns 各字段判定结果 + 发送给电缆接口的 values + 覆盖项说明
 */
export function buildCableLink({ metrics, manual = {}, touched = {} }) {
  const auto = autoCableValues(metrics);
  const fields = {};
  const overrides = [];

  for (const [name, spec] of Object.entries(CABLE_LINK_FIELDS)) {
    const resolved = resolveLinkedField({
      manual: manual[name],
      auto: auto[name],
      touched: touched[name] === true,
      tolerance: spec.tolerance
    });
    fields[name] = resolved;
    if (resolved.source === 'manual' && resolved.mismatch) {
      overrides.push({ name, ...spec, manual: resolved.manual, auto: resolved.auto });
    }
  }

  const values = {
    [CABLE_LINK_FIELDS.voltage.key]: fields.voltage.value,
    [CABLE_LINK_FIELDS.current.key]: fields.current.value
  };

  let notice = null;
  if (overrides.length > 0) {
    const detail = overrides
      .map((item) => describeOverride(CABLE_LINK_FIELDS[item.name], item))
      .join('、');
    notice = `手填值与电气校核不一致：${detail}；本次电缆校核按手填值计算。`;
  }

  return { fields, values, overrides, notice };
}
