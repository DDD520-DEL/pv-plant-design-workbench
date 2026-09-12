/**
 * 固定支架的风荷载、雪荷载、构件选型与基础稳定校核。
 *
 * 面向「下料前定支架和基础」的初步设计：一个支架断面（前/后两根立柱 +
 * 若干道檩条 + 一块现浇钢筋混凝土独立基础）的包络计算，按下列规范的常用
 * 简化口径取值，不能替代正式结构施工图的计算书：
 *
 * 风荷载（GB 50009-2012）：
 *   w_k = βz · μs · μz · w0
 *   βz=1.0（低矮光伏支架、阵风响应近似取 1）；
 *   μs 取风荷载体型系数包络绝对值，倾角越大斜面上的风吸/风压越大，
 *   按 μs = 0.9 + 0.008·θ（θ=0°→0.90，θ=60°→1.38）线性插值；
 *   μz 按 B 类粗糙度、幂律指数 0.15，由合力点高度取值（10m 以下取 1.0）。
 *   一个断面的风荷载标准值 Fw = w_k × 受风面积 = w_k × 斜长 × 立柱纵向跨距。
 *
 * 雪荷载（GB 50009-2012）：
 *   s_k = μr · s0，μr 为单坡屋面积雪分布系数：
 *   θ≤25° 取 1.0，此后每增 1° 减 0.01，封底 0.6；
 *   断面雪荷载标准值 S = s_k × 斜面水平投影面积。
 *
 * 构件选型（Q235 镀锌型钢，初设估算法）：
 *   立柱：风荷载水平力由前、后两根立柱平均承担，按底部弯矩估算所需
 *         截面模量 W ≥ M / (215×0.85) N/mm²，上靠方矩管标准规格；
 *   檩条：组件自重 + 雪荷载按简支梁 M = qL²/8 估算截面模量，
 *         L 取立柱纵向跨距（檩条跨度），檩距随基本雪压分档；
 *   基础：按抗倾覆要求反算混凝土独立基础的方板边长与厚度，再复核抗滑移，
 *         底摩擦系数按土质选取。
 *
 * 稳定校核（GB 50007-2011 口径，荷载用标准值）：
 *   抗倾覆：M稳 / M倾 ≥ Kt（默认 1.6），M倾为风水平力对基础前趾的力矩，
 *           M稳由结构自重、雪压重与基础自重提供；风吸力的竖向分量按上拔
 *           扣除（取受风吸控制的保守工况）；
 *   抗滑移：μ·(竖向力合计) / Fw ≥ Ks（默认 1.3）。
 */

export const STRUCTURE_LIMITS = {
  windPressure: { min: 0.2, max: 1.5, label: '基本风压 w0', unit: 'kN/m²', default: 0.4 },
  snowPressure: { min: 0, max: 1.5, label: '基本雪压 s0', unit: 'kN/m²', default: 0.4 },
  tiltDeg: { min: 0, max: 60, label: '组件倾角', unit: '°', default: 25 },
  arrayHeightMm: { min: 200, max: 6000, label: '阵列下沿离地高度', unit: 'mm', default: 500 },
  modulesAlongSlope: { min: 1, max: 6, label: '沿斜向组件数（竖装块数）', unit: '块', default: 2 },
  postSpacingMm: { min: 1000, max: 6000, label: '立柱纵向跨距（檩条跨度）', unit: 'mm', default: 2268 }
};

/** 基础底摩擦系数（混凝土基础与地基土，GB 50007 表 6.7.5-2 的常用值）。 */
export const SOIL_TYPES = {
  clay: { id: 'clay', label: '黏性土（可塑）', friction: 0.3 },
  silt: { id: 'silt', label: '粉土/砂土（稍湿）', friction: 0.4 },
  gravel: { id: 'gravel', label: '碎石土/岩石', friction: 0.5 }
};

/** 抗倾覆 / 抗滑移稳定安全系数限值（标准值组合口径）。 */
export const STABILITY_LIMITS = { overturning: 1.6, sliding: 1.3 };

const TERRAIN_ALPHA = 0.15; // B 类粗糙度幂律指数
const TERRAIN_REF_HEIGHT_M = 10;

/** Q235 抗弯强度设计值 N/mm²，初设再折减 0.85 留腐蚀与连接裕量。 */
const STEEL_BENDING_F = 215;
const STEEL_ALLOWANCE = 0.85;

const CONCRETE_DENSITY = 24; // kN/m³，钢筋混凝土
const MODULE_WEIGHT = 0.15; // kN/m²，组件面自重（约 15 kg/m²）
const STEEL_LINE_WEIGHT = 0.08; // kN/m，立柱+斜梁折算到每延米斜长的型钢自重

/** 立柱方矩管标准规格 [边长 mm, 壁厚 mm, 截面模量 cm³, 每米重 kg/m]。 */
const POST_SIZES = [
  { side: 60, thickness: 2.5, sectionModulusCm3: 8.3, weightKgPerM: 4.39 },
  { side: 80, thickness: 2.5, sectionModulusCm3: 15.0, weightKgPerM: 5.97 },
  { side: 80, thickness: 3.0, sectionModulusCm3: 17.8, weightKgPerM: 7.02 },
  { side: 100, thickness: 3.0, sectionModulusCm3: 28.2, weightKgPerM: 8.96 },
  { side: 100, thickness: 4.0, sectionModulusCm3: 36.5, weightKgPerM: 11.7 },
  { side: 120, thickness: 4.0, sectionModulusCm3: 53.4, weightKgPerM: 14.2 },
  { side: 150, thickness: 4.0, sectionModulusCm3: 84.7, weightKgPerM: 18.0 },
  { side: 150, thickness: 5.0, sectionModulusCm3: 104.1, weightKgPerM: 22.3 },
  { side: 180, thickness: 5.0, sectionModulusCm3: 152.0, weightKgPerM: 27.0 },
  { side: 200, thickness: 6.0, sectionModulusCm3: 217.0, weightKgPerM: 35.0 }
];

/** 檩条 C/Z 型钢标准规格 [型号, 截面模量 cm³, 每米重 kg/m]。 */
const PURLIN_SIZES = [
  { model: 'C80×40×20×2.0', sectionModulusCm3: 7.6, weightKgPerM: 2.72 },
  { model: 'C100×50×20×2.0', sectionModulusCm3: 12.6, weightKgPerM: 3.45 },
  { model: 'C120×50×20×2.5', sectionModulusCm3: 20.9, weightKgPerM: 4.79 },
  { model: 'C140×50×20×2.5', sectionModulusCm3: 28.5, weightKgPerM: 5.44 },
  { model: 'C160×60×20×2.5', sectionModulusCm3: 39.7, weightKgPerM: 6.38 },
  { model: 'C160×60×20×3.0', sectionModulusCm3: 46.9, weightKgPerM: 7.51 },
  { model: 'C180×70×20×3.0', sectionModulusCm3: 62.0, weightKgPerM: 8.45 },
  { model: 'C200×70×20×3.0', sectionModulusCm3: 76.8, weightKgPerM: 9.24 }
];

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveSoilType(soil) {
  if (typeof soil !== 'string') return null;
  return SOIL_TYPES[soil.trim().toLowerCase()] ?? null;
}

function finitePositive(...values) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

/**
 * 风压高度变化系数 μz（B 类幂律口径）：μz = (z/10)^(2α)，10m 以下取 1.0。
 */
export function windHeightFactor(heightM) {
  if (!Number.isFinite(heightM) || heightM <= 0) return Number.NaN;
  if (heightM <= TERRAIN_REF_HEIGHT_M) return 1.0;
  return (heightM / TERRAIN_REF_HEIGHT_M) ** (2 * TERRAIN_ALPHA);
}

/** 斜面风荷载体型系数包络绝对值，0°→0.90，60°→1.38。 */
export function windShapeFactor(tiltDeg) {
  if (!Number.isFinite(tiltDeg)) return Number.NaN;
  return Math.min(1.4, 0.9 + 0.008 * tiltDeg);
}

/** 单坡屋面积雪分布系数：≤25° 取 1.0，之后每度减 0.01，封底 0.6。 */
export function snowDistributionFactor(tiltDeg) {
  if (!Number.isFinite(tiltDeg)) return Number.NaN;
  if (tiltDeg <= 25) return 1.0;
  return Math.max(0.6, 1 - 0.01 * (tiltDeg - 25));
}

/**
 * 一个支架断面的几何参数。组件沿斜长方向竖装：
 *   斜长 = 沿斜向块数 × 组件长边；水平投影 = 斜长 × cosθ；
 *   顶端高度 = 下沿高度 + 斜长 × sinθ；合力点取斜面中点。
 */
export function rackGeometry({ modulesAlongSlope, moduleLengthMm, tiltDeg, arrayHeightMm }) {
  if (
    !finitePositive(modulesAlongSlope, moduleLengthMm, arrayHeightMm) ||
    !Number.isFinite(tiltDeg) ||
    tiltDeg < 0
  ) {
    return null;
  }
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const slopeLengthMm = modulesAlongSlope * moduleLengthMm;
  const projectionMm = slopeLengthMm * Math.cos(tiltRad);
  const topHeightMm = arrayHeightMm + slopeLengthMm * Math.sin(tiltRad);
  const centroidHeightMm = arrayHeightMm + (slopeLengthMm * Math.sin(tiltRad)) / 2;

  return {
    modulesAlongSlope,
    tiltDeg,
    lowerHeightMm: round(arrayHeightMm, 0),
    slopeLengthMm: round(slopeLengthMm, 0),
    projectionMm: round(projectionMm, 0),
    topHeightMm: round(topHeightMm, 0),
    centroidHeightMm: round(centroidHeightMm, 0)
  };
}

/**
 * 风荷载与雪荷载标准值。
 * postSpacingMm 为立柱纵向跨距（断面受风宽度，也等于檩条跨度）。
 */
export function evaluateLoads({
  windPressure,
  snowPressure,
  tiltDeg,
  arrayHeightMm,
  modulesAlongSlope,
  moduleLengthMm,
  postSpacingMm
}) {
  const geometry = rackGeometry({ modulesAlongSlope, moduleLengthMm, tiltDeg, arrayHeightMm });
  if (!geometry || !finitePositive(windPressure, postSpacingMm) || !Number.isFinite(snowPressure) || snowPressure < 0) {
    return null;
  }

  const spacingM = postSpacingMm / 1000;
  const slopeAreaM2 = (geometry.slopeLengthMm / 1000) * spacingM;
  const projectedAreaM2 = (geometry.projectionMm / 1000) * spacingM;

  const betaZ = 1.0;
  const muS = windShapeFactor(tiltDeg);
  const muZ = windHeightFactor(geometry.centroidHeightMm / 1000);
  const windStandardKpa = betaZ * muS * muZ * windPressure;
  // 风荷载取垂直于斜面的合力（体型系数为包络绝对值），再拆水平/竖向分量；
  // 竖向分量按风吸上拔处理，稳定校核时从竖向力中扣除。
  const windForceKn = windStandardKpa * slopeAreaM2;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const windHorizontalKn = windForceKn * Math.cos(tiltRad);
  const windUpliftKn = windForceKn * Math.sin(tiltRad);

  const muR = snowDistributionFactor(tiltDeg);
  const snowStandardKpa = muR * snowPressure;
  const snowForceKn = snowStandardKpa * projectedAreaM2;

  const moduleWeightKn = MODULE_WEIGHT * slopeAreaM2;
  const steelWeightKn = STEEL_LINE_WEIGHT * (geometry.slopeLengthMm / 1000);

  return {
    geometry,
    postSpacingM: round(spacingM, 3),
    slopeAreaM2: round(slopeAreaM2, 3),
    projectedAreaM2: round(projectedAreaM2, 3),
    wind: {
      basicKpa: windPressure,
      betaZ,
      shapeFactor: round(muS, 3),
      heightFactor: round(muZ, 3),
      standardKpa: round(windStandardKpa, 3),
      forceKn: round(windForceKn, 2),
      horizontalKn: round(windHorizontalKn, 2),
      upliftKn: round(windUpliftKn, 2)
    },
    snow: {
      basicKpa: snowPressure,
      distributionFactor: round(muR, 3),
      standardKpa: round(snowStandardKpa, 3),
      forceKn: round(snowForceKn, 2)
    },
    deadWeightKn: {
      module: round(moduleWeightKn, 2),
      steel: round(steelWeightKn, 2),
      total: round(moduleWeightKn + steelWeightKn, 2)
    }
  };
}

/**
 * 立柱选型：风水平力由前、后两根立柱平均承担，单根深 ~4m，
 * 反弯点近似取斜面合力点高度；W(cm³) = M(kN·m)×1000 / f(N/mm²)。
 */
export function recommendPost(loads) {
  const { wind, geometry } = loads;
  const heightM = geometry.centroidHeightMm / 1000;
  const momentKnM = (wind.horizontalKn / 2) * heightM;
  const requiredCm3 = (momentKnM * 1000) / (STEEL_BENDING_F * STEEL_ALLOWANCE);
  const picked = POST_SIZES.find((item) => item.sectionModulusCm3 >= requiredCm3) ?? null;

  return {
    count: 2,
    maxHeightMm: geometry.topHeightMm,
    baseMomentKnM: round(momentKnM, 3),
    requiredSectionModulusCm3: round(requiredCm3, 2),
    size: picked
      ? {
          sideMm: picked.side,
          thicknessMm: picked.thickness,
          sectionModulusCm3: picked.sectionModulusCm3,
          weightKgPerM: picked.weightKgPerM,
          label: `□${picked.side}×${picked.side}×${picked.thickness}`
        }
      : null,
    candidates: POST_SIZES.map((item) => ({
      label: `□${item.side}×${item.side}×${item.thickness}`,
      sectionModulusCm3: item.sectionModulusCm3,
      pass: item.sectionModulusCm3 >= requiredCm3
    }))
  };
}

/**
 * 檩条选型：竖面荷载 = 组件自重 + 雪荷载标准值，按简支梁 M = qL²/8 估截面模量。
 * 跨度 L 取立柱纵向跨距；檩距随基本雪压分档（≤0.35→1.2m，≤0.65→1.0m，更大→0.8m）。
 */
export function recommendPurlin(loads) {
  const { snow, geometry, postSpacingM } = loads;
  const spacingM = snow.basicKpa <= 0.35 ? 1.2 : snow.basicKpa <= 0.65 ? 1.0 : 0.8;
  const verticalLoadKpa = MODULE_WEIGHT + snow.standardKpa;
  const lineLoadKnM = verticalLoadKpa * spacingM;
  const momentKnM = (lineLoadKnM * postSpacingM * postSpacingM) / 8;
  const requiredCm3 = (momentKnM * 1000) / (STEEL_BENDING_F * STEEL_ALLOWANCE);
  const picked = PURLIN_SIZES.find((item) => item.sectionModulusCm3 >= requiredCm3) ?? null;
  const count = Math.max(2, Math.ceil(geometry.slopeLengthMm / 1000 / spacingM) + 1);

  return {
    spacingMm: Math.round(spacingM * 1000),
    count,
    spanMm: Math.round(postSpacingM * 1000),
    lineLoadKnM: round(lineLoadKnM, 3),
    midMomentKnM: round(momentKnM, 3),
    requiredSectionModulusCm3: round(requiredCm3, 2),
    size: picked
      ? { model: picked.model, sectionModulusCm3: picked.sectionModulusCm3, weightKgPerM: picked.weightKgPerM }
      : null,
    candidates: PURLIN_SIZES.map((item) => ({
      model: item.model,
      sectionModulusCm3: item.sectionModulusCm3,
      pass: item.sectionModulusCm3 >= requiredCm3
    }))
  };
}

/**
 * 基础稳定校核与底板选型。
 *
 * 倾覆力矩 M倾 = 风水平力 × 合力点高度；
 * 竖向力取受风吸控制工况：G结构 + S雪 − Fw·sinθ（风吸上拔）；
 * 抗倾覆力矩 = 竖向力合计 × 板边长/2（重心到基础前趾的力臂）。
 *
 * 底板按 Kt·M倾 反算：板厚取边长的 1/4（不小于 300mm），
 * 0.125·γc·L⁴ + 0.5·G·L ≥ Kt·M倾，迭代求 L 后上靠 50mm 模数，
 * 再用最终尺寸复核抗倾覆与抗滑移。
 */
export function evaluateFoundation(loads, soilSpec = SOIL_TYPES.silt) {
  const { wind, snow, deadWeightKn, geometry } = loads;
  const friction = soilSpec.friction;

  const heightM = geometry.centroidHeightMm / 1000;
  const overturningMomentKnM = wind.horizontalKn * heightM;
  const superstructureVerticalKn = deadWeightKn.total + snow.forceKn - wind.upliftKn;

  const kt = STABILITY_LIMITS.overturning;
  let sideM = 0.4;
  for (let i = 0; i < 200; i += 1) {
    const trialThickness = Math.max(0.3, sideM / 4);
    const resistance =
      (superstructureVerticalKn + CONCRETE_DENSITY * sideM * sideM * trialThickness) * (sideM / 2);
    if (resistance >= kt * overturningMomentKnM) break;
    sideM += 0.01;
  }

  // 上靠 50mm 模数；厚度按边长 1/4 上靠 50mm 模数，且不小于 300mm。
  sideM = Math.max(0.5, Math.ceil(sideM * 20) / 20);
  const thicknessM = Math.max(0.3, Math.ceil((sideM / 4) * 20) / 20);

  const foundationWeightKn = CONCRETE_DENSITY * sideM * sideM * thicknessM;
  const verticalTotalKn = superstructureVerticalKn + foundationWeightKn;

  const stabilizingMomentKnM = verticalTotalKn * (sideM / 2);
  const overturningRatio =
    overturningMomentKnM === 0 ? Number.POSITIVE_INFINITY : stabilizingMomentKnM / overturningMomentKnM;

  const frictionKn = friction * verticalTotalKn;
  const slidingRatio = wind.horizontalKn === 0 ? Number.POSITIVE_INFINITY : frictionKn / wind.horizontalKn;

  const overturningPass = overturningRatio >= kt;
  const slidingPass = slidingRatio >= STABILITY_LIMITS.sliding;

  return {
    soil: { id: soilSpec.id, label: soilSpec.label, friction },
    slab: {
      sideMm: Math.round(sideM * 1000),
      thicknessMm: Math.round(thicknessM * 1000),
      volumeM3: round(sideM * sideM * thicknessM, 3),
      weightKn: round(foundationWeightKn, 2)
    },
    loads: {
      windHorizontalKn: wind.horizontalKn,
      windUpliftKn: wind.upliftKn,
      superstructureVerticalKn: round(superstructureVerticalKn, 2),
      verticalTotalKn: round(verticalTotalKn, 2),
      overturningMomentKnM: round(overturningMomentKnM, 3),
      stabilizingMomentKnM: round(stabilizingMomentKnM, 3),
      frictionKn: round(frictionKn, 2)
    },
    checks: {
      overturning: {
        limit: kt,
        actual: round(overturningRatio, 3),
        pass: overturningPass,
        marginPercent: round(((overturningRatio - kt) / kt) * 100, 1)
      },
      sliding: {
        limit: STABILITY_LIMITS.sliding,
        actual: round(slidingRatio, 3),
        pass: slidingPass,
        marginPercent: round(((slidingRatio - STABILITY_LIMITS.sliding) / STABILITY_LIMITS.sliding) * 100, 1)
      }
    },
    status: overturningPass && slidingPass ? 'pass' : 'fail'
  };
}

/**
 * 支架与基础模块主入口。
 */
export function evaluateStructure({
  windPressure,
  snowPressure,
  tiltDeg,
  arrayHeightMm,
  modulesAlongSlope,
  moduleLengthMm,
  postSpacingMm,
  soilType = 'silt'
}) {
  const soilSpec = resolveSoilType(soilType);
  if (!soilSpec) return null;

  const loads = evaluateLoads({
    windPressure,
    snowPressure,
    tiltDeg,
    arrayHeightMm,
    modulesAlongSlope,
    moduleLengthMm,
    postSpacingMm
  });
  if (!loads) return null;

  const post = recommendPost(loads);
  const purlin = recommendPurlin(loads);
  const foundation = evaluateFoundation(loads, soilSpec);
  const status = foundation.status === 'pass' && post.size && purlin.size ? 'pass' : 'fail';

  return {
    status,
    loads,
    post,
    purlin,
    foundation,
    notes: [
      '风荷载体型系数按斜面角度包络取值，阵风系数 βz=1.0，地面粗糙度按 B 类；',
      '立柱/檩条按 Q235 抗弯强度 215 N/mm² 并折减 0.85 估算，未含节点与长细比验算；',
      '基础为现浇钢筋混凝土独立基础包络估算，正式下料前应按地勘参数复核地基承载力。'
    ]
  };
}
