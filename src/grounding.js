/**
 * 光伏电站防雷与接地设计：接地电阻估算、接地体规格数量建议与限值校核。
 *
 * 面向初设阶段的简化估算（GB 50057-2010、GB 50797-2012、DL/T 621 常用口径），
 * 不能替代正式接地施工图与现场实测：
 *
 * 垂直接地极（单根，L50×5 热镀锌角钢，长 2.5m，等效直径 d=0.84b≈0.042m）：
 *   Rv1 = ρ/(2πL) · ln(4L/d)
 * 水平接地带（-40×4 镀锌扁钢，埋深 h=0.8m，等效直径 d=b/2=0.02m）：
 *   Rh = ρ/(2πL) · ln(L²/(h·d))
 * 多根垂直接地极由水平带连通后存在屏蔽效应，按利用系数 η 折算后并联：
 *   Rv = Rv1 /(n·ηv)，总接地电阻 R = Rv·Rh /(Rv + Rh)
 *   （η 按接地网形式与极数取经验值，极越密、网内极越多，利用系数越低）
 *
 * 接地体数量不按孤立点估算，而是结合排布模块算出的阵列占地（外缘矩形
 * 宽 × 进深）与排数：垂直接地极沿外缘（环形/网格形式含内部网格交点）布置，
 * 极间距取 2L（5m，多雷/强雷区加密到 4m），水平带沿外缘周长并按雷暴区分区
 * 补内部网格。初估电阻不满足限值时给出加密极数与内部均压带建议。
 *
 * 限值：工作与保护接地 ≤ 4 Ω，防雷接地 ≤ 10 Ω（DL/T 621 / GB 50797）。
 * 土壤电阻率较高时 4 Ω 可能无法经济达到，允许防雷接地单独按 10 Ω 落地，
 * 但工作/保护接地仍应通过换土、降阻剂或外延接地达到 4 Ω。
 */

export const GROUNDING_LIMITS = {
  thunderDays: { min: 0, max: 200, label: '年平均雷暴日', unit: 'd', default: 30 },
  soilResistivity: { min: 1, max: 5000, label: '土壤电阻率', unit: 'Ω·m', default: 100 }
};

/** 接地电阻限值（Ω）：工作与保护接地 4，防雷接地 10。 */
export const RESISTANCE_LIMITS = { working: 4, lightning: 10 };

export const GRID_TYPES = {
  rods: { id: 'rods', label: '垂直接地极（沿外缘分散布置）' },
  ring: { id: 'ring', label: '水平环形接地网（外缘闭合环）' },
  mesh: { id: 'mesh', label: '水平网格接地网（外缘 + 内部网格）' }
};

/**
 * 雷暴区分区（GB 50057 口径）：少雷 ≤15d、中雷 15–40d、多雷 40–90d、强雷 >90d。
 * rodSpacingM 为垂直接地极间距；cellDepthM/cellWidthM 为网格接地网的内部网格模数；
 * 多雷/强雷区按第二类防雷建筑物口径加密，其余按第三类。
 */
export const LIGHTNING_ZONES = {
  light: {
    id: 'light',
    label: '少雷区（Td ≤ 15d）',
    max: 15,
    rodSpacingM: 5,
    cellDepthM: 20,
    cellWidthM: 20,
    lightningClass: '第三类'
  },
  normal: {
    id: 'normal',
    label: '中雷区（15d < Td ≤ 40d）',
    max: 40,
    rodSpacingM: 5,
    cellDepthM: 15,
    cellWidthM: 15,
    lightningClass: '第三类'
  },
  heavy: {
    id: 'heavy',
    label: '多雷区（40d < Td ≤ 90d）',
    max: 90,
    rodSpacingM: 4,
    cellDepthM: 10,
    cellWidthM: 10,
    lightningClass: '第二类'
  },
  extreme: {
    id: 'extreme',
    label: '强雷区（Td > 90d）',
    max: Number.POSITIVE_INFINITY,
    rodSpacingM: 4,
    cellDepthM: 5,
    cellWidthM: 10,
    lightningClass: '第二类'
  }
};

const ROD_LENGTH_M = 2.5; // L50×5 角钢，长 2.5m
const ROD_EQUIV_DIAMETER_M = 0.042; // 等边角钢等效圆钢直径 d=0.84b
const STRIP_WIDTH_M = 0.04; // -40×4 扁钢
const BURIAL_DEPTH_M = 0.8;
const DOWN_CONDUCTOR_SPACING_M = 25; // 沿外缘每约 25m 一处接地引下/连接点

const MAX_RODS = 200; // 加密建议的极数上限，超过即判经济性不可行
const MAX_INNER_GRIDS = { rods: 0, ring: 4, mesh: 8 };
const TARGET_OHM = RESISTANCE_LIMITS.working;

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveGridType(grid) {
  if (typeof grid !== 'string') return null;
  return GRID_TYPES[grid.trim().toLowerCase()] ?? null;
}

export function resolveThunderZone(thunderDays) {
  if (!Number.isFinite(thunderDays) || thunderDays < 0) return null;
  return (
    Object.values(LIGHTNING_ZONES).find((zone) => thunderDays <= zone.max) ?? LIGHTNING_ZONES.extreme
  );
}

function finitePositive(...values) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

/** 单根垂直接地极接地电阻 Rv1 = ρ/(2πL)·ln(4L/d)，角钢等效直径 d=0.84b。 */
export function verticalRodResistance(
  soilResistivity,
  lengthM = ROD_LENGTH_M,
  diameterM = ROD_EQUIV_DIAMETER_M
) {
  if (!finitePositive(soilResistivity, lengthM, diameterM)) return Number.NaN;
  return (soilResistivity / (2 * Math.PI * lengthM)) * Math.log((4 * lengthM) / diameterM);
}

/** 水平接地带接地电阻 Rh = ρ/(2πL)·ln(L²/(h·d))，扁钢等效直径 d=b/2。 */
export function horizontalStripResistance(
  soilResistivity,
  totalLengthM,
  burialDepthM = BURIAL_DEPTH_M,
  widthM = STRIP_WIDTH_M
) {
  if (!finitePositive(soilResistivity, totalLengthM, burialDepthM, widthM)) {
    return Number.NaN;
  }
  const equivDiameterM = widthM / 2;
  return (
    (soilResistivity / (2 * Math.PI * totalLengthM)) *
    Math.log((totalLengthM * totalLengthM) / (burialDepthM * equivDiameterM))
  );
}

/**
 * 垂直接地极利用系数 ηv（屏蔽效应经验值）：
 * 分散布置最高（基准 0.80，极数每增 1 根减 0.002）；
 * 环形 0.78 起步、网格 0.72 起步，并随内部均压带增多继续下降；封底 0.40–0.45。
 */
export function verticalUtilization(gridTypeId, rodCount, innerGrids = 0) {
  if (!Number.isFinite(rodCount) || rodCount <= 0) return Number.NaN;
  if (gridTypeId === 'mesh') {
    return Math.max(0.4, 0.72 - 0.003 * Math.max(0, rodCount - 30) - 0.02 * innerGrids);
  }
  if (gridTypeId === 'ring') {
    return Math.max(0.4, 0.78 - 0.0035 * Math.max(0, rodCount - 20) - 0.02 * innerGrids);
  }
  return Math.max(0.45, 0.8 - 0.002 * (rodCount - 4));
}

/**
 * 结合阵列占地与排数估算接地体布置。
 * 宽度/进深为排布模块算出的阵列外缘矩形（m），rows 为阵列排数。
 * 返回垂直接地极数量、极间距与水平带长度；rows=0（排布无解）时返回 null。
 */
export function estimateGroundingCounts({ widthM, depthM, rows, gridType = 'ring', zone }) {
  if (!finitePositive(widthM, depthM) || !Number.isFinite(rows) || rows <= 0 || !zone) return null;

  const spacingM = zone.rodSpacingM;
  // 长边每边极数（含两端角极），短边扣除两角避免重复计数。
  const nx = Math.ceil(widthM / spacingM) + 1;
  const ny = Math.max(0, Math.ceil(depthM / spacingM) - 1);
  const perimeterRods = 2 * nx + 2 * ny;
  const perimeterM = 2 * (widthM + depthM);

  let rodCount;
  let stripLengthM;
  let innerGrids = 0;

  if (gridType === 'mesh') {
    // 横向均压带（沿宽度方向）按 cellDepthM 沿进深分列，极沿每条带按极间距布置；
    // 纵向均压带按 cellWidthM 分列，与横向带成交点网格，外缘计入周长不重复。
    const transverseLines = Math.ceil(depthM / zone.cellDepthM) + 1;
    const longitudinalLines = Math.ceil(widthM / zone.cellWidthM) + 1;
    rodCount = nx * transverseLines;
    const innerTransverse = Math.max(0, transverseLines - 2) * widthM;
    const innerLongitudinal = Math.max(0, longitudinalLines - 2) * depthM;
    stripLengthM = perimeterM + innerTransverse + innerLongitudinal;
    innerGrids = Math.max(0, transverseLines - 2) + Math.max(0, longitudinalLines - 2);
  } else if (gridType === 'ring') {
    rodCount = perimeterRods;
    stripLengthM = perimeterM;
  } else {
    // 分散垂直接地极：极沿外缘布置，仍需扁钢首尾连通做等电位，
    // 但该连通带按保守口径不计入散流电阻（bondingOnly）。
    rodCount = perimeterRods;
    stripLengthM = perimeterM;
  }

  return {
    widthM: round(widthM, 2),
    depthM: round(depthM, 2),
    rows,
    perimeterM: round(perimeterM, 1),
    rodSpacingM: spacingM,
    rodCount,
    stripLengthM: round(stripLengthM, 1),
    innerGrids,
    bondingOnly: gridType === 'rods'
  };
}

/** 按给定极数 / 水平带长度 / 内部网格数估算接地电阻组合值（原始值，未圆整）。 */
function resistanceBreakdown({ soilResistivity, gridType, rodCount, stripLengthM, innerGrids, bondingOnly }) {
  const etaV = verticalUtilization(gridType, rodCount, innerGrids);
  const rodSingle = verticalRodResistance(soilResistivity);
  const rodParallel = rodSingle / (rodCount * etaV);

  const stripActive = bondingOnly ? 0 : stripLengthM;
  const etaH = Math.min(0.9, etaV + 0.05);
  // 水平带利用系数与垂直接地极同向变化；η 越低，屏蔽越严重，等效电阻越大。
  const strip = stripActive > 0 ? horizontalStripResistance(soilResistivity, stripActive) / etaH : Number.POSITIVE_INFINITY;

  const total = 1 / (1 / rodParallel + 1 / strip);
  return {
    etaV: round(etaV, 3),
    etaH: bondingOnly ? null : round(etaH, 3),
    rodSingleOhm: round(rodSingle, 2),
    rodParallelOhm: round(rodParallel, 2),
    stripOhm: Number.isFinite(strip) ? round(strip, 2) : null,
    totalOhm: total
  };
}

function describeSpecs(counts) {
  return {
    vertical: {
      materialLabel: '热镀锌角钢',
      specLabel: 'L50×5×2500',
      sizeMm: { equalSide: 50, thickness: 5 },
      lengthMm: Math.round(ROD_LENGTH_M * 1000),
      spacingMm: Math.round(counts.rodSpacingM * 1000),
      count: counts.rodCount
    },
    horizontal: {
      materialLabel: '热镀锌扁钢',
      specLabel: '-40×4',
      sizeMm: { width: 40, thickness: 4 },
      burialDepthMm: Math.round(BURIAL_DEPTH_M * 1000),
      perimeterM: counts.perimeterM,
      totalLengthM: counts.stripLengthM,
      innerGrids: counts.innerGrids,
      bondingOnly: counts.bondingOnly
    }
  };
}

/**
 * 防雷与接地设计主入口。
 *
 * @param {number} thunderDays 年平均雷暴日（d）
 * @param {number} soilResistivity 土壤电阻率（Ω·m）
 * @param {string} gridType rods / ring / mesh
 * @param {number} widthM 阵列外缘宽度（排布模块）
 * @param {number} depthM 阵列外缘进深（排布模块）
 * @param {number} rows 阵列排数（排布模块）
 */
export function evaluateGrounding({
  thunderDays,
  soilResistivity,
  gridType = 'ring',
  widthM,
  depthM,
  rows
}) {
  const gridSpec = resolveGridType(gridType);
  const zone = resolveThunderZone(thunderDays);
  if (!gridSpec || !zone || !finitePositive(soilResistivity, widthM, depthM)) return null;

  const base = estimateGroundingCounts({ widthM, depthM, rows, gridType: gridSpec.id, zone });
  if (!base) return null;

  /**
   * 不满足 4Ω 时加密：每步增 4 根垂直接地极；每累计 20 根增极，
   * 环形/网格形式补一道内部十字均压带（约 宽+进深 m），直到满足 4Ω 或达到上限。
   */
  const maxInnerGrids = MAX_INNER_GRIDS[gridSpec.id];
  let rodCount = base.rodCount;
  let stripLengthM = base.stripLengthM;
  let innerGrids = base.innerGrids;
  let addedRods = 0;
  let addedInnerGrids = 0;

  let breakdown = resistanceBreakdown({
    soilResistivity,
    gridType: gridSpec.id,
    rodCount,
    stripLengthM,
    innerGrids,
    bondingOnly: base.bondingOnly
  });

  let guard = 0;
  while (breakdown.totalOhm > TARGET_OHM && guard < 500) {
    guard += 1;
    if (rodCount + 4 > MAX_RODS) break;
    rodCount += 4;
    addedRods += 4;
    if (gridSpec.id !== 'rods' && addedInnerGrids < maxInnerGrids && addedRods >= (addedInnerGrids + 1) * 20) {
      addedInnerGrids += 1;
      innerGrids += 1;
      stripLengthM = round(stripLengthM + widthM + depthM, 1);
    }
    breakdown = resistanceBreakdown({
      soilResistivity,
      gridType: gridSpec.id,
      rodCount,
      stripLengthM,
      innerGrids,
      bondingOnly: base.bondingOnly
    });
  }

  const designed = {
    ...base,
    rodCount,
    stripLengthM,
    innerGrids,
    components: breakdown,
    resistanceOhm: round(breakdown.totalOhm, 2)
  };

  const baseBreakdown = resistanceBreakdown({
    soilResistivity,
    gridType: gridSpec.id,
    rodCount: base.rodCount,
    stripLengthM: base.stripLengthM,
    innerGrids: base.innerGrids,
    bondingOnly: base.bondingOnly
  });
  const basePlan = { ...base, components: baseBreakdown, resistanceOhm: round(baseBreakdown.totalOhm, 2) };

  const workingPass = designed.resistanceOhm <= RESISTANCE_LIMITS.working;
  const lightningPass = designed.resistanceOhm <= RESISTANCE_LIMITS.lightning;
  const marginOf = (limit) => round(((limit - designed.resistanceOhm) / limit) * 100, 1);

  const downConductorCount = Math.max(4, Math.ceil(base.perimeterM / DOWN_CONDUCTOR_SPACING_M));
  const advice = [];
  if (!workingPass) {
    advice.push(
      lightningPass
        ? `加密后接地电阻约 ${designed.resistanceOhm} Ω：满足防雷接地 10 Ω，但不满足工作与保护接地 4 Ω，应对逆变器/箱变区域换土或施降阻剂、增设外延接地，或将防雷接地独立设置并保证地中安全间距。`
        : `加密 ${addedRods} 根极、增设 ${addedInnerGrids} 道内部均压带后仍大于 10 Ω，应改用网格接地网、换土/深埋/降阻剂综合降阻，并以现场实测接地电阻为准。`
    );
  }
  if (gridSpec.id === 'rods') {
    advice.push('分散接地极必须用 -40×4 镀锌扁钢首尾焊通形成等电位连接，焊接长度不小于扁钢宽度的 2 倍；建议优先采用环形接地网。');
  }
  if (zone.id === 'heavy' || zone.id === 'extreme') {
    advice.push(`${zone.label}按第二类防雷口径布置，组件边框、支架与接地网应每个阵列区段就近可靠连接，设备金属外壳全数接地。`);
  }

  const specs = describeSpecs(designed);

  return {
    status: workingPass && lightningPass ? 'pass' : 'fail',
    site: {
      widthM: base.widthM,
      depthM: base.depthM,
      areaM2: round(base.widthM * base.depthM, 1),
      perimeterM: base.perimeterM,
      rows
    },
    environment: {
      thunderDays,
      soilResistivityOhmM: soilResistivity,
      zone: { id: zone.id, label: zone.label, lightningClass: zone.lightningClass }
    },
    gridType: { id: gridSpec.id, label: gridSpec.label },
    limits: { ...RESISTANCE_LIMITS },
    base: basePlan,
    design: {
      ...designed,
      rodsAdded: addedRods,
      innerGridsAdded: addedInnerGrids,
      stripAddedM: round(stripLengthM - base.stripLengthM, 1)
    },
    vertical: specs.vertical,
    horizontal: specs.horizontal,
    lightning: {
      classLabel: zone.lightningClass,
      downConductorCount,
      downConductorSpec: '-40×4 镀锌扁钢',
      meshCellM: gridSpec.id === 'mesh' ? { depth: zone.cellDepthM, width: zone.cellWidthM } : null,
      rodSpacingM: zone.rodSpacingM
    },
    checks: {
      working: {
        label: '工作与保护接地',
        limit: RESISTANCE_LIMITS.working,
        actual: designed.resistanceOhm,
        pass: workingPass,
        marginPercent: marginOf(RESISTANCE_LIMITS.working)
      },
      lightning: {
        label: '防雷接地',
        limit: RESISTANCE_LIMITS.lightning,
        actual: designed.resistanceOhm,
        pass: lightningPass,
        marginPercent: marginOf(RESISTANCE_LIMITS.lightning)
      }
    },
    advice,
    notes: [
      '单根垂直接地极按 R=ρ/(2πL)·[ln(4L/d)−1]、水平接地带按 R=ρ/(2πL)·ln(2L²/(b·t)) 估算，多极按利用系数折算屏蔽效应；',
      '接地体数量按排布模块的阵列外缘尺寸与排数估算，土壤电阻率应取雨季实测最大值（必要时乘季节系数）；',
      '结果为初设估算，正式施工需以接地电阻现场实测为准，高电阻率土壤应结合换土、降阻剂、深井接地或外延接地网专项设计。'
    ]
  };
}
