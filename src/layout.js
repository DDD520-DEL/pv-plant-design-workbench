/**
 * 阵列排布与阴影间距计算。
 *
 * 采用工程上常用的「冬至日正午不遮挡」口径：
 *   太阳高度角 α = 90° − |纬度| − 23.45°（北半球冬至日正午）
 *   阵列顶端高度 h = 组件长度 × sin(倾角)
 *   阴影长度 s = h / tan(α)
 *   排距 D = 组件长度 × cos(倾角) + s
 *
 * 更严格的「冬至日 9:00–15:00 不遮挡」口径留给后续迭代扩展。
 */

export const LAYOUT_LIMITS = {
  latitude: { min: 0, max: 60, label: '项目纬度', unit: '°', default: 32 },
  tiltDeg: { min: 0, max: 60, label: '阵列倾角', unit: '°', default: 25 },
  siteWidthMm: { min: 1000, max: 500000, label: '场地宽度', unit: 'mm', default: 50000 },
  siteDepthMm: { min: 1000, max: 500000, label: '场地进深', unit: 'mm', default: 30000 },
  gapMm: { min: 0, max: 200, label: '组件横向间隙', unit: 'mm', default: 20 }
};

const WINTER_DECLINATION = -23.45;

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function solarNoonAltitude(latitude, declination = WINTER_DECLINATION) {
  if (!Number.isFinite(latitude) || !Number.isFinite(declination)) return Number.NaN;
  return 90 - Math.abs(latitude) - Math.abs(declination);
}

export function shadowRatio(altitudeDeg) {
  if (!Number.isFinite(altitudeDeg) || altitudeDeg <= 0) return Number.POSITIVE_INFINITY;
  const radians = (altitudeDeg * Math.PI) / 180;
  return 1 / Math.tan(radians);
}

export function rowPitch({ tiltDeg, moduleLengthMm, latitude }) {
  const altitudeDeg = solarNoonAltitude(latitude);
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const arrayHeightMm = moduleLengthMm * Math.sin(tiltRad);
  const projectionMm = moduleLengthMm * Math.cos(tiltRad);
  const shadowLengthMm = arrayHeightMm * shadowRatio(altitudeDeg);
  const rowPitchMm = projectionMm + shadowLengthMm;

  return {
    altitudeDeg: round(altitudeDeg, 2),
    arrayHeightMm: round(arrayHeightMm, 1),
    projectionMm: round(projectionMm, 1),
    shadowLengthMm: round(shadowLengthMm, 1),
    rowPitchMm: round(rowPitchMm, 1)
  };
}

/**
 * 场地排布：先按冬至日正午不遮挡算出排距，再在给定场地里塞满可排的阵列。
 * 第一排组件占据的水平投影计入场地进深，因此排数为
 *   floor((场地进深 − 单排投影) / 排距) + 1
 */
export function arrayPlan({
  siteWidthMm,
  siteDepthMm,
  tiltDeg,
  moduleLengthMm,
  moduleWidthMm,
  pmax,
  latitude,
  gapMm = 20
}) {
  const pitch = rowPitch({ tiltDeg, moduleLengthMm, latitude });
  const step = moduleWidthMm + gapMm;

  const modulesPerRow = Math.max(0, Math.floor((siteWidthMm + gapMm) / step));
  const reserve = Math.max(pitch.projectionMm, step);
  const rows =
    siteDepthMm < reserve ? 0 : Math.max(0, Math.floor((siteDepthMm - pitch.projectionMm) / pitch.rowPitchMm) + 1);
  const totalModules = rows * modulesPerRow;
  const usedDepthMm = rows === 0 ? 0 : pitch.projectionMm + (rows - 1) * pitch.rowPitchMm;
  const usedWidthMm = modulesPerRow === 0 ? 0 : modulesPerRow * step - gapMm;
  const areaM2 = (siteWidthMm * siteDepthMm) / 1_000_000;
  const capacityKw = (totalModules * pmax) / 1000;

  return {
    ...pitch,
    modulesPerRow,
    rows,
    totalModules,
    capacityKw: round(capacityKw, 2),
    usedDepthMm: round(usedDepthMm, 0),
    usedWidthMm: round(usedWidthMm, 0),
    siteAreaM2: round(areaM2, 1),
    usageRatio: siteDepthMm === 0 ? 0 : round((usedDepthMm / siteDepthMm) * 100, 1),
    capacityDensityWPerM2: areaM2 === 0 ? 0 : round((capacityKw * 1000) / areaM2, 1)
  };
}
