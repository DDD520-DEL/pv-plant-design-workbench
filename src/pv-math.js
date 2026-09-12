/**
 * 组串电气校核的核心计算。
 *
 * 温度修正统一采用线性温度系数模型（组件铭牌与 IEC 61215 报告给出的口径）：
 *   X(T) = X_stc × (1 + k/100 × (T − 25))
 * 其中 k 为温度系数（%/℃），T 为电池工作温度（℃）。
 *
 * 组串串联数区间由两条硬约束决定：
 *   上限——极端低温下的开路电压不得超过逆变器最大直流输入电压；
 *   下限——极端高温下的工作电压不得低于 MPPT 下限电压，
 *         同时极端低温下的工作电压不得高于 MPPT 上限电压。
 */

export const CELL_TEMP_LIMITS = {
  minCellTemp: { min: -40, max: 30, label: '极端最低电池温度', unit: '℃' },
  maxCellTemp: { min: 20, max: 90, label: '极端最高电池温度', unit: '℃' }
};

export const STRING_LIMITS = {
  seriesPerString: { min: 1, max: 40, label: '每串组件数', unit: '块' },
  stringsPerMppt: { min: 1, max: 8, label: '每路组串数', unit: '串' },
  mpptUsed: { min: 1, max: 24, label: '使用路数', unit: '路' }
};

/** 容配比（直流装机 / 逆变器额定交流）的推荐区间，超出区间给出提示级告警。 */
export const DC_AC_RATIO_RANGE = { min: 1.0, max: 1.5 };

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function tempCorrect(value, coefficientPercent, cellTemp) {
  if (!Number.isFinite(value) || !Number.isFinite(coefficientPercent) || !Number.isFinite(cellTemp)) {
    return Number.NaN;
  }
  return value * (1 + (coefficientPercent / 100) * (cellTemp - 25));
}

export function vocAt(module, cellTemp) {
  return tempCorrect(module.voc, module.betaVoc, cellTemp);
}

export function vmpAt(module, cellTemp) {
  return tempCorrect(module.vmp, module.betaVmp ?? module.betaVoc, cellTemp);
}

export function iscAt(module, cellTemp) {
  return tempCorrect(module.isc, module.alphaIsc, cellTemp);
}

/**
 * 工作电流的温度修正。工程上常用短路电流温度系数近似工作电流的温度系数，
 * 这里沿用该近似，量级偏保守。
 */
export function impAt(module, cellTemp) {
  return tempCorrect(module.imp, module.alphaIsc, cellTemp);
}

export function seriesRange(module, inverter, { minCellTemp, maxCellTemp }) {
  const vocCold = vocAt(module, minCellTemp);
  const vmpCold = vmpAt(module, minCellTemp);
  const vmpHot = vmpAt(module, maxCellTemp);

  const byDcMax = Math.floor(inverter.vdcMax / vocCold);
  const byMpptMax = Math.floor(inverter.vmpptMax / vmpCold);
  const min = Math.ceil(inverter.vmpptMin / vmpHot);
  const max = Math.min(byDcMax, byMpptMax);

  return {
    min,
    max,
    feasible: max >= min,
    vocCold: round(vocCold, 2),
    vmpCold: round(vmpCold, 2),
    vmpHot: round(vmpHot, 2),
    byDcMax,
    byMpptMax
  };
}

export function parallelLimit(module, inverter, maxCellTemp) {
  const impHot = impAt(module, maxCellTemp);
  const iscHot = iscAt(module, maxCellTemp);
  const byCurrent = Math.floor(inverter.iMaxPerMppt / impHot);
  const byIsc = Math.floor(inverter.iScMaxPerMppt / iscHot);

  return {
    max: Math.min(byCurrent, byIsc),
    byCurrent,
    byIsc,
    impHot: round(impHot, 2),
    iscHot: round(iscHot, 2)
  };
}

function check({ id, label, actual, limit, unit, compare, level = 'error', digits = 2 }) {
  const pass = compare === 'lte' ? actual <= limit : actual >= limit;
  const margin =
    compare === 'lte' ? (limit - actual) / limit : (actual - limit) / limit;
  return {
    id,
    label,
    actual: round(actual, digits),
    limit: round(limit, digits),
    unit,
    compare,
    level,
    pass,
    margin: round(margin * 100, 1)
  };
}

export function evaluateElectric({
  module,
  inverter,
  seriesPerString,
  stringsPerMppt,
  mpptUsed,
  minCellTemp = -10,
  maxCellTemp = 70
}) {
  const vocCold = vocAt(module, minCellTemp);
  const vmpCold = vmpAt(module, minCellTemp);
  const vmpHot = vmpAt(module, maxCellTemp);
  const iscHot = iscAt(module, maxCellTemp);
  const impHot = impAt(module, maxCellTemp);

  const stringVoltageCold = vocCold * seriesPerString;
  const stringVmpCold = vmpCold * seriesPerString;
  const stringVmpHot = vmpHot * seriesPerString;
  const mpptCurrent = impHot * stringsPerMppt;
  const mpptIsc = iscHot * stringsPerMppt;

  const stringCount = stringsPerMppt * mpptUsed;
  const totalModules = stringCount * seriesPerString;
  const dcKw = (totalModules * module.pmax) / 1000;
  const dcAcRatio = dcKw / inverter.pacRated;

  const checks = [
    check({
      id: 'voc-cold',
      label: `极端低温（${minCellTemp}℃）组串开路电压`,
      actual: stringVoltageCold,
      limit: inverter.vdcMax,
      unit: 'V',
      compare: 'lte'
    }),
    check({
      id: 'vmp-hot',
      label: `极端高温（${maxCellTemp}℃）组串工作电压`,
      actual: stringVmpHot,
      limit: inverter.vmpptMin,
      unit: 'V',
      compare: 'gte'
    }),
    check({
      id: 'vmp-cold-max',
      label: `极端低温（${minCellTemp}℃）组串工作电压`,
      actual: stringVmpCold,
      limit: inverter.vmpptMax,
      unit: 'V',
      compare: 'lte'
    }),
    check({
      id: 'mppt-current',
      label: `每路工作电流（${stringsPerMppt} 串并联）`,
      actual: mpptCurrent,
      limit: inverter.iMaxPerMppt,
      unit: 'A',
      compare: 'lte'
    }),
    check({
      id: 'mppt-isc',
      label: `每路短路电流（${stringsPerMppt} 串并联）`,
      actual: mpptIsc,
      limit: inverter.iScMaxPerMppt,
      unit: 'A',
      compare: 'lte'
    }),
    check({
      id: 'dc-power',
      label: '直流侧装机容量',
      actual: dcKw,
      limit: inverter.pmaxDc,
      unit: 'kW',
      compare: 'lte'
    }),
    check({
      id: 'dc-ac-ratio',
      label: `容配比（推荐 ${DC_AC_RATIO_RANGE.min}–${DC_AC_RATIO_RANGE.max}）`,
      actual: dcAcRatio,
      limit: DC_AC_RATIO_RANGE.max,
      unit: '',
      compare: 'lte',
      level: 'warn'
    }),
    check({
      id: 'dc-ac-ratio-min',
      label: `容配比下限（推荐不低于 ${DC_AC_RATIO_RANGE.min}）`,
      actual: dcAcRatio,
      limit: DC_AC_RATIO_RANGE.min,
      unit: '',
      compare: 'gte',
      level: 'warn'
    })
  ];

  const failed = checks.filter((item) => !item.pass && item.level === 'error');
  const warned = checks.filter((item) => !item.pass && item.level === 'warn');
  const status = failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass';

  return {
    status,
    checks,
    metrics: {
      vocCold: round(vocCold, 2),
      vmpCold: round(vmpCold, 2),
      vmpHot: round(vmpHot, 2),
      iscHot: round(iscHot, 2),
      impHot: round(impHot, 2),
      stringVoltageCold: round(stringVoltageCold, 2),
      stringVmpCold: round(stringVmpCold, 2),
      stringVmpHot: round(stringVmpHot, 2),
      mpptCurrent: round(mpptCurrent, 2),
      mpptIsc: round(mpptIsc, 2),
      stringCount,
      totalModules,
      dcKw: round(dcKw, 2),
      acKw: round(inverter.pacRated, 2),
      dcAcRatio: round(dcAcRatio, 3)
    },
    advice: {
      series: seriesRange(module, inverter, { minCellTemp, maxCellTemp }),
      parallel: parallelLimit(module, inverter, maxCellTemp)
    }
  };
}
