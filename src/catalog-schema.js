/**
 * 自定义组件/逆变器的字段口径：取值范围、必填项与归一化结果。
 * 服务器新增条目时按这里的规则校验，测试也直接引用同一份定义。
 */

import { resolveFields, requireString } from './validate.js';

export const MODULE_FIELDS = {
  pmax: { min: 100, max: 1000, label: '峰值功率', unit: 'W' },
  voc: { min: 20, max: 80, label: '开路电压', unit: 'V' },
  vmp: { min: 15, max: 70, label: '工作电压', unit: 'V' },
  isc: { min: 5, max: 30, label: '短路电流', unit: 'A' },
  imp: { min: 5, max: 30, label: '工作电流', unit: 'A' },
  betaVoc: { min: -0.6, max: -0.05, label: '开路电压温度系数', unit: '%/℃' },
  betaVmp: { min: -0.6, max: -0.05, label: '工作电压温度系数', unit: '%/℃' },
  alphaIsc: { min: 0, max: 0.15, label: '短路电流温度系数', unit: '%/℃' },
  gammaPmax: { min: -0.6, max: -0.05, label: '峰值功率温度系数', unit: '%/℃' },
  lengthMm: { min: 500, max: 3000, label: '组件长度', unit: 'mm' },
  widthMm: { min: 400, max: 2000, label: '组件宽度', unit: 'mm' },
  efficiency: { min: 10, max: 30, label: '组件效率', unit: '%' }
};

export const INVERTER_FIELDS = {
  pacRated: { min: 0.5, max: 500, label: '额定交流输出', unit: 'kW' },
  pmaxDc: { min: 0.5, max: 1000, label: '最大直流输入功率', unit: 'kW' },
  vdcMax: { min: 100, max: 1500, label: '最大直流输入电压', unit: 'V' },
  vmpptMin: { min: 50, max: 1500, label: 'MPPT 下限电压', unit: 'V' },
  vmpptMax: { min: 50, max: 1500, label: 'MPPT 上限电压', unit: 'V' },
  vStart: { min: 50, max: 1500, label: '启动电压', unit: 'V' },
  mpptCount: { min: 1, max: 24, label: 'MPPT 路数', unit: '路' },
  iMaxPerMppt: { min: 5, max: 100, label: '每路最大工作电流', unit: 'A' },
  iScMaxPerMppt: { min: 5, max: 200, label: '每路最大短路电流', unit: 'A' }
};

export function normalizeModule(input) {
  const brand = requireString(input, 'brand', '组件品牌');
  const model = requireString(input, 'model', '组件型号');
  const { values, errors } = resolveFields(input, MODULE_FIELDS);
  const allErrors = [...(brand.error ? [brand.error] : []), ...(model.error ? [model.error] : []), ...errors];

  if (allErrors.length > 0) return { errors: allErrors };
  return { value: { brand: brand.value, model: model.value, ...values } };
}

export function normalizeInverter(input) {
  const brand = requireString(input, 'brand', '逆变器品牌');
  const model = requireString(input, 'model', '逆变器型号');
  const { values, errors } = resolveFields(input, INVERTER_FIELDS);
  const allErrors = [...(brand.error ? [brand.error] : []), ...(model.error ? [model.error] : []), ...errors];

  if (allErrors.length > 0) return { errors: allErrors };
  return { value: { brand: brand.value, model: model.value, ...values } };
}
