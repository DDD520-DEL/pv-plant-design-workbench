import {
  fetchCatalog,
  fetchHealth,
  postCable,
  postEconomics,
  postElectric,
  postEnergy,
  postGrounding,
  postLayout,
  postStructure
} from './api.js';
import { setCatalog, setLastResult } from './state.js';
import { buildCableLink, formatLinkedValue } from './cable-link.js';
import { renderCablePanel } from './components/cable-panel.js';
import { renderEconomicsPanel } from './components/economics-panel.js';
import { renderElectricPanel } from './components/electric-panel.js';
import { renderEnergyPanel } from './components/energy-panel.js';
import { renderGroundingPanel } from './components/grounding-panel.js';
import { renderLayoutPanel } from './components/layout-panel.js';
import { renderStructurePanel } from './components/structure-panel.js';

const DEFAULT_VALUES = {
  moduleId: 'mod-620',
  inverterId: 'inv-25k',
  seriesPerString: 18,
  stringsPerMppt: 1,
  mpptUsed: 3,
  minCellTemp: -10,
  maxCellTemp: 70,
  shadingMode: 'noon',
  latitude: 32,
  tiltDeg: 25,
  siteWidthM: 50,
  siteDepthM: 30,
  gapMm: 20,
  windPressure: 0.4,
  snowPressure: 0.4,
  arrayHeightMm: 500,
  modulesAlongSlope: 2,
  postSpacingMm: 2268,
  soilType: 'silt',
  thunderDays: 30,
  soilResistivity: 100,
  gridType: 'ring',
  cableLengthM: 30,
  cableVoltage: 544.65,
  cableCurrent: 18.19,
  conductorMaterial: 'cu',
  conductorArea: 4,
  allowedDropPercent: 2,
  peakSunHours: 3.8,
  performanceRatio: 0.8,
  years: 25,
  firstYearDegradation: 2,
  annualDegradation: 0.55,
  unitCostYuanPerW: 3.5,
  omRatePercent: 1,
  tariffYuanPerKwh: 0.35
};

const FIELDS = {
  moduleSelect: 'module-select',
  inverterSelect: 'inverter-select',
  seriesPerString: 'series-per-string',
  stringsPerMppt: 'strings-per-mppt',
  mpptUsed: 'mppt-used',
  minCellTemp: 'min-cell-temp',
  maxCellTemp: 'max-cell-temp',
  shadingMode: 'shading-mode',
  latitude: 'latitude',
  tiltDeg: 'tilt-deg',
  siteWidth: 'site-width',
  siteDepth: 'site-depth',
  gapMm: 'gap-mm',
  windPressure: 'wind-pressure',
  snowPressure: 'snow-pressure',
  arrayHeight: 'array-height',
  modulesAlongSlope: 'modules-along-slope',
  postSpacing: 'post-spacing',
  soilType: 'soil-type',
  thunderDays: 'thunder-days',
  soilResistivity: 'soil-resistivity',
  gridType: 'grid-type',
  cableLength: 'cable-length',
  cableVoltage: 'cable-voltage',
  cableCurrent: 'cable-current',
  conductorMaterial: 'conductor-material',
  conductorArea: 'conductor-area',
  allowedDrop: 'allowed-drop',
  peakSunHours: 'peak-sun-hours',
  performanceRatio: 'performance-ratio',
  years: 'years',
  firstYearDegradation: 'first-year-degradation',
  annualDegradation: 'annual-degradation',
  unitCost: 'unit-cost',
  omRate: 'om-rate',
  tariff: 'tariff'
};

const elements = {};

/**
 * 电缆电压/电流是否被手动改过：未改时点「开始校核」自动跟随电气校核结果；
 * 一旦手动改过即以手填值覆盖，直到「恢复默认」才重新跟随。
 */
const cableManualTouched = { voltage: false, current: false };

const CABLE_LINK_NAMES = {
  voltage: { input: 'cableVoltage', tag: 'cableVoltageTag' },
  current: { input: 'cableCurrent', tag: 'cableCurrentTag' }
};

function cacheElements() {
  for (const [key, id] of Object.entries(FIELDS)) {
    elements[key] = document.getElementById(id);
  }
  elements.apiStatus = document.getElementById('api-status');
  elements.message = document.getElementById('result-message');
  elements.cableLinkNote = document.getElementById('cable-link-note');
  elements.cableVoltageTag = document.getElementById('cable-voltage-tag');
  elements.cableCurrentTag = document.getElementById('cable-current-tag');
  elements.evaluateButton = document.getElementById('evaluate-button');
  elements.resetButton = document.getElementById('reset-button');
  elements.panels = {
    electric: document.getElementById('electric-panel'),
    cable: document.getElementById('cable-panel'),
    layout: document.getElementById('layout-panel'),
    structure: document.getElementById('structure-panel'),
    grounding: document.getElementById('grounding-panel'),
    energy: document.getElementById('energy-panel'),
    economics: document.getElementById('economics-panel')
  };
}

function optionLabel(item, describe) {
  return `${item.brand} ${item.model} · ${describe(item)}`;
}

function fillSelect(select, items, describe, selectedId) {
  select.innerHTML = items
    .map((item) => `<option value="${item.id}">${optionLabel(item, describe)}</option>`)
    .join('');
  if (selectedId && items.some((item) => item.id === selectedId)) {
    select.value = selectedId;
  }
}

function applyDefaults() {
  elements.seriesPerString.value = DEFAULT_VALUES.seriesPerString;
  elements.stringsPerMppt.value = DEFAULT_VALUES.stringsPerMppt;
  elements.mpptUsed.value = DEFAULT_VALUES.mpptUsed;
  elements.minCellTemp.value = DEFAULT_VALUES.minCellTemp;
  elements.maxCellTemp.value = DEFAULT_VALUES.maxCellTemp;
  elements.shadingMode.value = DEFAULT_VALUES.shadingMode;
  elements.latitude.value = DEFAULT_VALUES.latitude;
  elements.tiltDeg.value = DEFAULT_VALUES.tiltDeg;
  elements.siteWidth.value = DEFAULT_VALUES.siteWidthM;
  elements.siteDepth.value = DEFAULT_VALUES.siteDepthM;
  elements.gapMm.value = DEFAULT_VALUES.gapMm;
  elements.windPressure.value = DEFAULT_VALUES.windPressure;
  elements.snowPressure.value = DEFAULT_VALUES.snowPressure;
  elements.arrayHeight.value = DEFAULT_VALUES.arrayHeightMm;
  elements.modulesAlongSlope.value = DEFAULT_VALUES.modulesAlongSlope;
  elements.postSpacing.value = DEFAULT_VALUES.postSpacingMm;
  elements.soilType.value = DEFAULT_VALUES.soilType;
  elements.thunderDays.value = DEFAULT_VALUES.thunderDays;
  elements.soilResistivity.value = DEFAULT_VALUES.soilResistivity;
  elements.gridType.value = DEFAULT_VALUES.gridType;
  elements.cableLength.value = DEFAULT_VALUES.cableLengthM;
  elements.cableVoltage.value = DEFAULT_VALUES.cableVoltage;
  elements.cableCurrent.value = DEFAULT_VALUES.cableCurrent;
  elements.conductorMaterial.value = DEFAULT_VALUES.conductorMaterial;
  elements.conductorArea.value = DEFAULT_VALUES.conductorArea;
  elements.allowedDrop.value = DEFAULT_VALUES.allowedDropPercent;
  elements.peakSunHours.value = DEFAULT_VALUES.peakSunHours;
  elements.performanceRatio.value = DEFAULT_VALUES.performanceRatio;
  elements.years.value = DEFAULT_VALUES.years;
  elements.firstYearDegradation.value = DEFAULT_VALUES.firstYearDegradation;
  elements.annualDegradation.value = DEFAULT_VALUES.annualDegradation;
  elements.unitCost.value = DEFAULT_VALUES.unitCostYuanPerW;
  elements.omRate.value = DEFAULT_VALUES.omRatePercent;
  elements.tariff.value = DEFAULT_VALUES.tariffYuanPerKwh;
  resetCableLink();
}

/**
 * 恢复电缆电压/电流的「自动跟随」状态：清掉手填标记，
 * 由下一次「开始校核」按电气校核结果回填。
 */
function resetCableLink() {
  cableManualTouched.voltage = false;
  cableManualTouched.current = false;
  setCableLinkNote(null);
  for (const name of Object.keys(CABLE_LINK_NAMES)) {
    paintCableField(name, { source: 'auto', mismatch: false });
  }
}

const CABLE_TAG_TEXT = {
  auto: '自动跟随',
  manual: '手填覆盖',
  mismatch: '手填 · 与电气校核不一致'
};

function setCableLinkNote(text) {
  if (!text) {
    elements.cableLinkNote.hidden = true;
    elements.cableLinkNote.textContent = '';
    return;
  }
  elements.cableLinkNote.hidden = false;
  elements.cableLinkNote.textContent = text;
  elements.cableLinkNote.className = 'hint hint--warn field-note';
}

function paintCableField(name, { source, mismatch }) {
  const refs = CABLE_LINK_NAMES[name];
  const input = elements[refs.input];
  const tag = elements[refs.tag];
  const state = source === 'manual' ? (mismatch ? 'mismatch' : 'manual') : 'auto';
  input.classList.toggle('input--auto', state === 'auto');
  input.classList.toggle('input--override', state === 'manual');
  input.classList.toggle('input--mismatch', state === 'mismatch');
  tag.textContent = CABLE_TAG_TEXT[state];
  tag.className = `field-tag field-tag--${state}`;
}

/**
 * 把电气校核 → 电缆的联动结果落到界面：
 * 自动值回填未手改的输入框；手填值保留并按一致性给出标记与提示。
 */
function applyCableLink(link) {
  for (const [name, resolved] of Object.entries(link.fields)) {
    const refs = CABLE_LINK_NAMES[name];
    if (resolved.source === 'auto') {
      elements[refs.input].value = formatLinkedValue(resolved.auto);
    }
    paintCableField(name, resolved);
  }
  setCableLinkNote(link.notice);
}

function numberValue(element) {
  return Number(element.value);
}

/** 联动输入框留空时给 NaN（Number('') 会得到 0），交由联动逻辑回退到自动值。 */
function optionalNumberValue(element) {
  return element.value.trim() === '' ? Number.NaN : Number(element.value);
}

function collectInput() {
  return {
    moduleId: elements.moduleSelect.value,
    inverterId: elements.inverterSelect.value,
    seriesPerString: numberValue(elements.seriesPerString),
    stringsPerMppt: numberValue(elements.stringsPerMppt),
    mpptUsed: numberValue(elements.mpptUsed),
    minCellTemp: numberValue(elements.minCellTemp),
    maxCellTemp: numberValue(elements.maxCellTemp),
    shadingMode: elements.shadingMode.value,
    latitude: numberValue(elements.latitude),
    tiltDeg: numberValue(elements.tiltDeg),
    siteWidthMm: numberValue(elements.siteWidth) * 1000,
    siteDepthMm: numberValue(elements.siteDepth) * 1000,
    gapMm: numberValue(elements.gapMm),
    windPressure: numberValue(elements.windPressure),
    snowPressure: numberValue(elements.snowPressure),
    arrayHeightMm: numberValue(elements.arrayHeight),
    modulesAlongSlope: numberValue(elements.modulesAlongSlope),
    postSpacingMm: numberValue(elements.postSpacing),
    soilType: elements.soilType.value,
    thunderDays: numberValue(elements.thunderDays),
    soilResistivity: numberValue(elements.soilResistivity),
    gridType: elements.gridType.value,
    cableLengthM: numberValue(elements.cableLength),
    cableVoltageManual: optionalNumberValue(elements.cableVoltage),
    cableCurrentManual: optionalNumberValue(elements.cableCurrent),
    conductorMaterial: elements.conductorMaterial.value,
    conductorArea: numberValue(elements.conductorArea),
    allowedDropPercent: numberValue(elements.allowedDrop),
    peakSunHours: numberValue(elements.peakSunHours),
    performanceRatio: numberValue(elements.performanceRatio),
    years: numberValue(elements.years),
    firstYearDegradation: numberValue(elements.firstYearDegradation),
    annualDegradation: numberValue(elements.annualDegradation),
    unitCostYuanPerW: numberValue(elements.unitCost),
    omRatePercent: numberValue(elements.omRate),
    tariffYuanPerKwh: numberValue(elements.tariff)
  };
}

function setMessage(text, kind = 'hint') {
  elements.message.textContent = text;
  elements.message.className = kind === 'hint' ? 'hint' : `hint hint--${kind}`;
}

function hidePanels() {
  for (const panel of Object.values(elements.panels)) panel.hidden = true;
}

async function runEvaluation() {
  const input = collectInput();
  elements.evaluateButton.disabled = true;
  setMessage('正在计算…');
  setCableLinkNote(null);

  try {
    // 电气校核、排布、支架基础、防雷接地互不依赖（均直接取输入值；
    // 接地的阵列占地与排数由服务端按同一套排布参数重算），四路并发；
    // 电缆电压/电流要取自电气校核结果，必须等电气校核返回后再发。
    const [electric, layout, structure, grounding] = await Promise.all([
      postElectric({
        moduleId: input.moduleId,
        inverterId: input.inverterId,
        seriesPerString: input.seriesPerString,
        stringsPerMppt: input.stringsPerMppt,
        mpptUsed: input.mpptUsed,
        minCellTemp: input.minCellTemp,
        maxCellTemp: input.maxCellTemp
      }),
      postLayout({
        moduleId: input.moduleId,
        shadingMode: input.shadingMode,
        latitude: input.latitude,
        tiltDeg: input.tiltDeg,
        siteWidthMm: input.siteWidthMm,
        siteDepthMm: input.siteDepthMm,
        gapMm: input.gapMm
      }),
      postStructure({
        moduleId: input.moduleId,
        windPressure: input.windPressure,
        snowPressure: input.snowPressure,
        tiltDeg: input.tiltDeg,
        arrayHeightMm: input.arrayHeightMm,
        modulesAlongSlope: input.modulesAlongSlope,
        postSpacingMm: input.postSpacingMm,
        soilType: input.soilType
      }),
      postGrounding({
        moduleId: input.moduleId,
        shadingMode: input.shadingMode,
        latitude: input.latitude,
        tiltDeg: input.tiltDeg,
        siteWidthMm: input.siteWidthMm,
        siteDepthMm: input.siteDepthMm,
        gapMm: input.gapMm,
        thunderDays: input.thunderDays,
        soilResistivity: input.soilResistivity,
        gridType: input.gridType
      })
    ]);

    renderElectricPanel(elements.panels.electric, electric);
    renderLayoutPanel(elements.panels.layout, layout);
    renderStructurePanel(elements.panels.structure, structure);
    renderGroundingPanel(elements.panels.grounding, grounding);

    const link = buildCableLink({
      metrics: electric.result.metrics,
      manual: { voltage: input.cableVoltageManual, current: input.cableCurrentManual },
      touched: cableManualTouched
    });
    applyCableLink(link);

    const cable = await postCable({
      cableLengthM: input.cableLengthM,
      stringVoltage: link.values.stringVoltage,
      stringCurrent: link.values.stringCurrent,
      conductorMaterial: input.conductorMaterial,
      conductorArea: input.conductorArea,
      allowedDropPercent: input.allowedDropPercent
    });
    renderCablePanel(elements.panels.cable, cable, { link });

    const capacityKw = layout.plan.capacityKw > 0 ? layout.plan.capacityKw : electric.result.metrics.dcKw;
    const energyBody = {
      capacityKw,
      peakSunHours: input.peakSunHours,
      performanceRatio: input.performanceRatio,
      years: input.years,
      firstYearDegradation: input.firstYearDegradation,
      annualDegradation: input.annualDegradation
    };
    const energy = await postEnergy(energyBody);
    renderEnergyPanel(elements.panels.energy, energy);

    // 经济性复用同一套发电量参数（服务端重算逐年发电量，口径与发电量卡片一致），
    // 再叠加单位造价、运维费率与上网电价。
    const economics = await postEconomics({
      ...energyBody,
      unitCostYuanPerW: input.unitCostYuanPerW,
      omRatePercent: input.omRatePercent,
      tariffYuanPerKwh: input.tariffYuanPerKwh
    });
    renderEconomicsPanel(elements.panels.economics, economics);

    setLastResult({ electric, cable, layout, structure, grounding, energy, economics });
    const suffix = link.overrides.length > 0 ? ` 电缆电压/电流按手填值计算（${link.overrides.length} 项与电气校核不一致）。` : '';
    const paybackText =
      economics.result.paybackYears === null
        ? `${input.years} 年内未回本`
        : `静态回收期 ${economics.result.paybackYears} 年`;
    const f = structure.result.foundation;
    const stabilityText = f.status === 'pass'
      ? `抗倾覆 ${f.checks.overturning.actual}、抗滑移 ${f.checks.sliding.actual} 均合格，基础建议 ${f.slab.sideMm}×${f.slab.sideMm}×${f.slab.thicknessMm} mm`
      : '支架基础稳定校核不满足，需加大基础或改用桩基础';
    const g = grounding.result;
    const groundingText = g.status === 'pass'
      ? `接地电阻估算 ${g.design.resistanceOhm} Ω（${g.vertical.count} 根 ${g.vertical.specLabel} + ${g.horizontal.totalLengthM} m ${g.horizontal.specLabel}）满足 4 Ω / 10 Ω`
      : `接地电阻估算 ${g.design.resistanceOhm} Ω 不满足 4 Ω，需换土/降阻剂等专项降阻`;
    const hasWarning = link.overrides.length > 0 || f.status !== 'pass' || g.status !== 'pass';
    setMessage(
      `校核完成：电气侧共 ${electric.result.checks.length} 项判定，电缆压降 ${cable.result.dropPercent}%，阵列可装 ${layout.plan.totalModules} 块（${layout.plan.capacityKw} kW），${stabilityText}；${groundingText}；${paybackText}，LCOE ${economics.result.lcoeYuanPerKwh} 元/kWh。${suffix}`,
      hasWarning ? 'warn' : 'ok'
    );
  } catch (error) {
    hidePanels();
    setMessage(error.message, 'error');
  } finally {
    elements.evaluateButton.disabled = false;
  }
}

async function bootstrap() {
  cacheElements();
  applyDefaults();

  try {
    const health = await fetchHealth();
    elements.apiStatus.textContent = health.ok ? '接口在线' : '接口异常';
    elements.apiStatus.className = health.ok ? 'status status--ok' : 'status status--error';
  } catch (error) {
    elements.apiStatus.textContent = '接口离线';
    elements.apiStatus.className = 'status status--error';
    setMessage(`无法连接后端接口：${error.message}`, 'error');
    return;
  }

  try {
    const catalog = await fetchCatalog();
    setCatalog(catalog);
    fillSelect(elements.moduleSelect, catalog.modules, (item) => `${item.pmax} W`, DEFAULT_VALUES.moduleId);
    fillSelect(
      elements.inverterSelect,
      catalog.inverters,
      (item) => `${item.pacRated} kW / ${item.mpptCount} 路`,
      DEFAULT_VALUES.inverterId
    );
    setMessage('目录已加载，点击「开始校核」运行电气校核、排布与发电量计算。');
  } catch (error) {
    setMessage(`加载组件库失败：${error.message}`, 'error');
  }

  elements.evaluateButton.addEventListener('click', runEvaluation);

  // 用户手动编辑电压/电流即视为覆盖：保留手填值并加标记，
  // 是否与电气校核一致要到下一次校核时才判定。
  elements.cableVoltage.addEventListener('input', () => {
    cableManualTouched.voltage = true;
    paintCableField('voltage', { source: 'manual', mismatch: false });
    setCableLinkNote(null);
  });
  elements.cableCurrent.addEventListener('input', () => {
    cableManualTouched.current = true;
    paintCableField('current', { source: 'manual', mismatch: false });
    setCableLinkNote(null);
  });

  elements.resetButton.addEventListener('click', () => {
    applyDefaults();
    elements.moduleSelect.value = DEFAULT_VALUES.moduleId;
    elements.inverterSelect.value = DEFAULT_VALUES.inverterId;
    hidePanels();
    setMessage('已恢复默认参数。');
  });
}

bootstrap();
