/**
 * 阵列排布与阴影间距计算。
 *
 * 支持两种阴影口径（shadingMode）：
 *
 * 1. 「冬至日正午不遮挡」（noon）：
 *   太阳高度角 α = 90° − |纬度| − 23.45°（北半球冬至日正午）
 *   阵列顶端高度 h = 组件长度 × sin(倾角)
 *   阴影长度 s = h / tan(α)
 *   排距 D = 组件长度 × cos(倾角) + s
 *
 * 2. 「冬至日 9:00–15:00 不遮挡」（window）：
 *   时段内最严苛的时刻是 9:00（与 15:00 关于正午对称），按太阳时角 ω = ±45°
 *   求太阳位置，阴影取南北向分量：
 *     sin α = sin φ · sin δ + cos φ · cos δ · cos ω
 *     cos A = (sin α · sin φ − sin δ) / (cos α · cos φ)   （A 为相对正南的方位角）
 *     排距 D = 组件长度 × cos(倾角) + h × cos A / tan α
 *   该式与 GB 50797 的系数公式 (0.707·tan φ + 0.4338) / (0.707 − 0.4338·tan φ) 等价。
 */

export const LAYOUT_LIMITS = {
  latitude: { min: 0, max: 60, label: '项目纬度', unit: '°', default: 32 },
  tiltDeg: { min: 0, max: 60, label: '阵列倾角', unit: '°', default: 25 },
  siteWidthMm: { min: 1000, max: 500000, label: '场地宽度', unit: 'mm', default: 50000 },
  siteDepthMm: { min: 1000, max: 500000, label: '场地进深', unit: 'mm', default: 30000 },
  gapMm: { min: 0, max: 200, label: '组件横向间隙', unit: 'mm', default: 20 }
};

/**
 * 阴影口径：9:00/15:00 距正午 3 小时，太阳时角 15°/h × 3h = 45°。
 * hourAngleDeg 取 0 时即正午口径，两种口径共用同一个太阳位置模型。
 */
export const SHADING_MODES = {
  noon: { id: 'noon', label: '冬至日正午不遮挡', hourAngleDeg: 0 },
  window: { id: 'window', label: '冬至日 9:00–15:00 不遮挡', hourAngleDeg: 45 }
};

const WINTER_DECLINATION = -23.45;

export function resolveShadingMode(mode) {
  if (typeof mode !== 'string') return null;
  return SHADING_MODES[mode.trim().toLowerCase()] ?? null;
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function solarNoonAltitude(latitude, declination = WINTER_DECLINATION) {
  if (!Number.isFinite(latitude) || !Number.isFinite(declination)) return Number.NaN;
  return 90 - Math.abs(latitude) - Math.abs(declination);
}

/**
 * 按太阳时角求太阳位置（北半球口径，纬度取绝对值）。
 * hourAngleDeg 为相对正午的太阳时角（上午为负、下午为正，正负对排距无影响）；
 * 方位角返回相对正南的偏角绝对值。
 */
export function sunPosition(latitude, hourAngleDeg, declination = WINTER_DECLINATION) {
  if (!Number.isFinite(latitude) || !Number.isFinite(hourAngleDeg) || !Number.isFinite(declination)) {
    return { altitudeDeg: Number.NaN, azimuthDeg: Number.NaN };
  }
  const toRad = Math.PI / 180;
  const phi = Math.abs(latitude) * toRad;
  const delta = declination * toRad;
  const omega = hourAngleDeg * toRad;

  const sinAltitude = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(omega);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const cosAzimuth =
    (Math.sin(altitude) * Math.sin(phi) - Math.sin(delta)) / (Math.cos(altitude) * Math.cos(phi));
  const azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));

  return { altitudeDeg: altitude / toRad, azimuthDeg: azimuth / toRad };
}

export function shadowRatio(altitudeDeg) {
  if (!Number.isFinite(altitudeDeg) || altitudeDeg <= 0) return Number.POSITIVE_INFINITY;
  const radians = (altitudeDeg * Math.PI) / 180;
  return 1 / Math.tan(radians);
}

/**
 * 指定口径下的阴影长度比（阴影南北向分量 / 阵列顶端高度）。
 * 太阳落到地平线以下时阴影视为无穷长，与 shadowRatio 的口径一致。
 */
function shadowRatioAt(latitude, hourAngleDeg) {
  const { altitudeDeg, azimuthDeg } = sunPosition(latitude, hourAngleDeg);
  if (!Number.isFinite(altitudeDeg) || altitudeDeg <= 0) {
    return { ratio: Number.POSITIVE_INFINITY, altitudeDeg, azimuthDeg };
  }
  const toRad = Math.PI / 180;
  const ratio = Math.cos(azimuthDeg * toRad) / Math.tan(altitudeDeg * toRad);
  return { ratio, altitudeDeg, azimuthDeg };
}

export function rowPitch({ tiltDeg, moduleLengthMm, latitude, shadingMode = 'noon' }) {
  const mode = resolveShadingMode(shadingMode);
  if (!mode) throw new RangeError(`未知间距口径：${String(shadingMode)}`);

  const { ratio, altitudeDeg, azimuthDeg } = shadowRatioAt(latitude, mode.hourAngleDeg);
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const arrayHeightMm = moduleLengthMm * Math.sin(tiltRad);
  const projectionMm = moduleLengthMm * Math.cos(tiltRad);
  const shadowLengthMm = arrayHeightMm * ratio;
  const rowPitchMm = projectionMm + shadowLengthMm;

  return {
    shadingMode: mode.id,
    altitudeDeg: round(altitudeDeg, 2),
    azimuthDeg: round(azimuthDeg, 2),
    arrayHeightMm: round(arrayHeightMm, 1),
    projectionMm: round(projectionMm, 1),
    shadowLengthMm: round(shadowLengthMm, 1),
    rowPitchMm: round(rowPitchMm, 1)
  };
}

/**
 * 场地排布：先按选定口径（默认冬至日正午不遮挡）算出排距，再在给定场地里塞满可排的阵列。
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
  gapMm = 20,
  shadingMode = 'noon'
}) {
  const pitch = rowPitch({ tiltDeg, moduleLengthMm, latitude, shadingMode });
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
