import { fetchCatalog, fetchHealth, postCable, postElectric, postEnergy, postLayout } from './api.js';
import { setCatalog, setLastResult } from './state.js';
import { renderCablePanel } from './components/cable-panel.js';
import { renderElectricPanel } from './components/electric-panel.js';
import { renderEnergyPanel } from './components/energy-panel.js';
import { renderLayoutPanel } from './components/layout-panel.js';

const DEFAULT_VALUES = {
  moduleId: 'mod-620',
  inverterId: 'inv-25k',
  seriesPerString: 18,
  stringsPerMppt: 1,
  mpptUsed: 3,
  minCellTemp: -10,
  maxCellTemp: 70,
  latitude: 32,
  tiltDeg: 25,
  siteWidthM: 50,
  siteDepthM: 30,
  gapMm: 20,
  cableLengthM: 30,
  cableVoltage: 626,
  cableCurrent: 18.19,
  conductorMaterial: 'cu',
  conductorArea: 4,
  allowedDropPercent: 2,
  peakSunHours: 3.8,
  performanceRatio: 0.8,
  years: 25,
  firstYearDegradation: 2,
  annualDegradation: 0.55
};

const FIELDS = {
  moduleSelect: 'module-select',
  inverterSelect: 'inverter-select',
  seriesPerString: 'series-per-string',
  stringsPerMppt: 'strings-per-mppt',
  mpptUsed: 'mppt-used',
  minCellTemp: 'min-cell-temp',
  maxCellTemp: 'max-cell-temp',
  latitude: 'latitude',
  tiltDeg: 'tilt-deg',
  siteWidth: 'site-width',
  siteDepth: 'site-depth',
  gapMm: 'gap-mm',
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
  annualDegradation: 'annual-degradation'
};

const elements = {};

function cacheElements() {
  for (const [key, id] of Object.entries(FIELDS)) {
    elements[key] = document.getElementById(id);
  }
  elements.apiStatus = document.getElementById('api-status');
  elements.message = document.getElementById('result-message');
  elements.evaluateButton = document.getElementById('evaluate-button');
  elements.resetButton = document.getElementById('reset-button');
  elements.panels = {
    electric: document.getElementById('electric-panel'),
    cable: document.getElementById('cable-panel'),
    layout: document.getElementById('layout-panel'),
    energy: document.getElementById('energy-panel')
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
  elements.latitude.value = DEFAULT_VALUES.latitude;
  elements.tiltDeg.value = DEFAULT_VALUES.tiltDeg;
  elements.siteWidth.value = DEFAULT_VALUES.siteWidthM;
  elements.siteDepth.value = DEFAULT_VALUES.siteDepthM;
  elements.gapMm.value = DEFAULT_VALUES.gapMm;
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
}

function numberValue(element) {
  return Number(element.value);
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
    latitude: numberValue(elements.latitude),
    tiltDeg: numberValue(elements.tiltDeg),
    siteWidthMm: numberValue(elements.siteWidth) * 1000,
    siteDepthMm: numberValue(elements.siteDepth) * 1000,
    gapMm: numberValue(elements.gapMm),
    cableLengthM: numberValue(elements.cableLength),
    stringVoltage: numberValue(elements.cableVoltage),
    stringCurrent: numberValue(elements.cableCurrent),
    conductorMaterial: elements.conductorMaterial.value,
    conductorArea: numberValue(elements.conductorArea),
    allowedDropPercent: numberValue(elements.allowedDrop),
    peakSunHours: numberValue(elements.peakSunHours),
    performanceRatio: numberValue(elements.performanceRatio),
    years: numberValue(elements.years),
    firstYearDegradation: numberValue(elements.firstYearDegradation),
    annualDegradation: numberValue(elements.annualDegradation)
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

  try {
    const [electric, cable, layout] = await Promise.all([
      postElectric({
        moduleId: input.moduleId,
        inverterId: input.inverterId,
        seriesPerString: input.seriesPerString,
        stringsPerMppt: input.stringsPerMppt,
        mpptUsed: input.mpptUsed,
        minCellTemp: input.minCellTemp,
        maxCellTemp: input.maxCellTemp
      }),
      postCable({
        cableLengthM: input.cableLengthM,
        stringVoltage: input.stringVoltage,
        stringCurrent: input.stringCurrent,
        conductorMaterial: input.conductorMaterial,
        conductorArea: input.conductorArea,
        allowedDropPercent: input.allowedDropPercent
      }),
      postLayout({
        moduleId: input.moduleId,
        latitude: input.latitude,
        tiltDeg: input.tiltDeg,
        siteWidthMm: input.siteWidthMm,
        siteDepthMm: input.siteDepthMm,
        gapMm: input.gapMm
      })
    ]);

    renderElectricPanel(elements.panels.electric, electric);
    renderCablePanel(elements.panels.cable, cable);
    renderLayoutPanel(elements.panels.layout, layout);

    const capacityKw = layout.plan.capacityKw > 0 ? layout.plan.capacityKw : electric.result.metrics.dcKw;
    const energy = await postEnergy({
      capacityKw,
      peakSunHours: input.peakSunHours,
      performanceRatio: input.performanceRatio,
      years: input.years,
      firstYearDegradation: input.firstYearDegradation,
      annualDegradation: input.annualDegradation
    });
    renderEnergyPanel(elements.panels.energy, energy);

    setLastResult({ electric, cable, layout, energy });
    setMessage(
      `校核完成：电气侧共 ${electric.result.checks.length} 项判定，电缆压降 ${cable.result.dropPercent}%，阵列可装 ${layout.plan.totalModules} 块（${layout.plan.capacityKw} kW）。`,
      'ok'
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
  elements.resetButton.addEventListener('click', () => {
    applyDefaults();
    elements.moduleSelect.value = DEFAULT_VALUES.moduleId;
    elements.inverterSelect.value = DEFAULT_VALUES.inverterId;
    hidePanels();
    setMessage('已恢复默认参数。');
  });
}

bootstrap();
