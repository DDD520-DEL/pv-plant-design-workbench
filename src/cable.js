/**
 * 组串到逆变器的直流电缆选型与压降校核。
 *
 * 物理模型：
 *   组串到逆变器的正、负两极各走一根导体，回路总长度 = 2 × 单程长度 L。
 *   回路电阻 R = ρ × 2L / A（ρ 为导体工作温度下的电阻率，A 为导体标称截面积）
 *   直流压降   ΔV = I × R
 *   压降百分比 = ΔV / V × 100%
 *   线损功率   Ploss = I² × R = ΔV × I
 *   反推截面   A ≥ ρ × 2L × I / (V × 允许压降比例)
 *
 * 电阻率取光伏直流电缆长期允许工作温度 90℃ 下的近似设计值（含绞合系数）：
 *   铜（PV1-F 类铜导体）约 0.0225 Ω·mm²/m；铝约 0.0360 Ω·mm²/m。
 * 该值略高于 20℃ 直流电阻率（铜 0.0172、铝 0.0283），把导体发热与端子
 * 接触电阻等留了一定裕量，选型结果偏保守。若按 20℃ 铭牌电阻率复核，
 * 实际压降会更小。
 */

export const VOLTAGE_DROP_LIMITS = [2, 3];

export const CONDUCTOR_MATERIALS = {
  cu: { id: 'cu', label: '铜芯', rho: 0.0225 },
  al: { id: 'al', label: '铝芯', rho: 0.036 }
};

/** 常用光伏直流电缆标准截面（mm²），按从小到大排列。 */
const STANDARD_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400];

export const CABLE_LIMITS = {
  cableLengthM: { min: 1, max: 500, label: '组串到逆变器单程电缆长度', unit: 'm', default: 30 },
  stringVoltage: { min: 100, max: 1500, label: '组串工作电压', unit: 'V', default: 626 },
  stringCurrent: { min: 1, max: 60, label: '组串工作电流', unit: 'A', default: 18.19 },
  conductorArea: { min: 1, max: 400, label: '导体标称截面积', unit: 'mm²', default: 4 },
  allowedDropPercent: { min: 0.1, max: 10, label: '允许压降百分比', unit: '%', default: 2 }
};

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 返回排序后的标准截面副本，供接口与前端下拉使用。 */
export function standardSizes() {
  return [...STANDARD_SIZES];
}

export function resolveMaterial(material) {
  if (typeof material !== 'string') return null;
  return CONDUCTOR_MATERIALS[material.trim().toLowerCase()] ?? null;
}

/**
 * 单根候选截面的压降与线损计算。
 * lengthM 为组串到逆变器的单程距离，回路长度按 2 × lengthM 计。
 */
export function cableCalc({ material, lengthM, area, voltage, current }) {
  const spec = resolveMaterial(material);
  if (!spec) return null;
  if (
    !Number.isFinite(lengthM) ||
    !Number.isFinite(area) ||
    !Number.isFinite(voltage) ||
    !Number.isFinite(current) ||
    lengthM <= 0 ||
    area <= 0 ||
    voltage <= 0 ||
    current <= 0
  ) {
    return null;
  }

  const loopLengthM = 2 * lengthM;
  const resistance = (spec.rho * loopLengthM) / area;
  const dropVoltage = current * resistance;
  const dropPercent = (dropVoltage / voltage) * 100;
  const lossWatt = current * dropVoltage;

  return {
    material: spec.id,
    materialLabel: spec.label,
    area,
    lengthM,
    loopLengthM,
    voltage,
    current,
    resistance: round(resistance, 5),
    dropVoltage: round(dropVoltage, 2),
    dropPercent: round(dropPercent, 3),
    lossWatt: round(lossWatt, 1)
  };
}

function dropCheck(calc, limitPercent) {
  const pass = calc.dropPercent <= limitPercent;
  return {
    limitPercent,
    actualPercent: calc.dropPercent,
    pass,
    marginPercent: round(((limitPercent - calc.dropPercent) / limitPercent) * 100, 1)
  };
}

/**
 * 从标准截面系列中选出压降不超过 allowedPercent 的最小标准截面；
 * 若连最大截面都满足不了，返回 null（由调用方给出加长汇流 / 提高电压的建议）。
 */
export function recommendSize({ material, lengthM, voltage, current, allowedPercent }) {
  const spec = resolveMaterial(material);
  if (
    !spec ||
    !Number.isFinite(lengthM) ||
    !Number.isFinite(voltage) ||
    !Number.isFinite(current) ||
    !Number.isFinite(allowedPercent) ||
    lengthM <= 0 ||
    voltage <= 0 ||
    current <= 0 ||
    allowedPercent <= 0
  ) {
    return null;
  }

  const minArea = (spec.rho * 2 * lengthM * current) / (voltage * (allowedPercent / 100));
  const candidates = [];
  for (const size of STANDARD_SIZES) {
    const check = cableCalc({ material, lengthM, area: size, voltage, current });
    candidates.push({
      area: size,
      dropPercent: check.dropPercent,
      lossWatt: check.lossWatt,
      pass: check.dropPercent <= allowedPercent
    });
  }
  const picked = candidates.find((item) => item.pass);

  return {
    allowedPercent,
    theoreticalMinArea: round(minArea, 2),
    recommendedArea: picked ? picked.area : null,
    candidates
  };
}

/**
 * 电缆选型校核主入口：当前截面的压降/线损 + 2% 与 3% 两档判定
 * + 按允许压降反推的推荐截面。
 */
export function evaluateCable({
  material = 'cu',
  cableLengthM,
  stringVoltage,
  stringCurrent,
  conductorArea,
  allowedDropPercent = 2
}) {
  const calc = cableCalc({
    material,
    lengthM: cableLengthM,
    area: conductorArea,
    voltage: stringVoltage,
    current: stringCurrent
  });
  if (!calc) return null;

  const check2 = dropCheck(calc, VOLTAGE_DROP_LIMITS[0]);
  const check3 = dropCheck(calc, VOLTAGE_DROP_LIMITS[1]);

  // 2% 以内合格；2%–3% 之间只给提示；超过 3% 判不通过。
  const status = check2.pass ? 'pass' : check3.pass ? 'warn' : 'fail';

  const recommendation = recommendSize({
    material,
    lengthM: cableLengthM,
    voltage: stringVoltage,
    current: stringCurrent,
    allowedPercent: allowedDropPercent
  });

  return {
    status,
    ...calc,
    checks: { drop2: check2, drop3: check3 },
    recommendation
  };
}
