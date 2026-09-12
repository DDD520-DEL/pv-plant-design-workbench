/**
 * 内置组件库与逆变器库。
 *
 * 组件参数取自 182/210 系列量产单晶组件的典型值，逆变器参数取自组串式
 * 三相机的典型值。用户新增的条目保存在 data/catalog.json，与内置数据分开。
 */

export const BUILTIN_MODULES = [
  {
    id: 'mod-620',
    brand: '恒晟',
    model: 'HS620M-72HL4',
    pmax: 620,
    voc: 41.6,
    vmp: 34.8,
    isc: 18.9,
    imp: 17.83,
    betaVoc: -0.25,
    betaVmp: -0.29,
    alphaIsc: 0.045,
    gammaPmax: -0.29,
    lengthMm: 2382,
    widthMm: 1134,
    efficiency: 23.0
  },
  {
    id: 'mod-580',
    brand: '恒晟',
    model: 'HS580M-72HL4',
    pmax: 580,
    voc: 40.9,
    vmp: 34.2,
    isc: 18.1,
    imp: 16.96,
    betaVoc: -0.26,
    betaVmp: -0.3,
    alphaIsc: 0.045,
    gammaPmax: -0.3,
    lengthMm: 2278,
    widthMm: 1134,
    efficiency: 22.5
  },
  {
    id: 'mod-450',
    brand: '耀阳',
    model: 'YY450M-60HL',
    pmax: 450,
    voc: 37.6,
    vmp: 31.5,
    isc: 15.3,
    imp: 14.29,
    betaVoc: -0.27,
    betaVmp: -0.31,
    alphaIsc: 0.048,
    gammaPmax: -0.31,
    lengthMm: 1722,
    widthMm: 1134,
    efficiency: 23.0
  }
];

export const BUILTIN_INVERTERS = [
  {
    id: 'inv-5k',
    brand: '兆恒',
    model: 'ZH-G5K-DT',
    pacRated: 5,
    pmaxDc: 7.5,
    vdcMax: 600,
    vmpptMin: 90,
    vmpptMax: 550,
    vStart: 120,
    mpptCount: 2,
    iMaxPerMppt: 16,
    iScMaxPerMppt: 24
  },
  {
    id: 'inv-25k',
    brand: '兆恒',
    model: 'ZH-G25K-T',
    pacRated: 25,
    pmaxDc: 37.5,
    vdcMax: 1100,
    vmpptMin: 200,
    vmpptMax: 1000,
    vStart: 250,
    mpptCount: 3,
    iMaxPerMppt: 40,
    iScMaxPerMppt: 60
  },
  {
    id: 'inv-110k',
    brand: '兆恒',
    model: 'ZH-G110K-HT',
    pacRated: 110,
    pmaxDc: 165,
    vdcMax: 1500,
    vmpptMin: 550,
    vmpptMax: 1450,
    vStart: 600,
    mpptCount: 10,
    iMaxPerMppt: 40,
    iScMaxPerMppt: 60
  }
];

export function findBuiltinModule(id) {
  return BUILTIN_MODULES.find((item) => item.id === id) ?? null;
}

export function findBuiltinInverter(id) {
  return BUILTIN_INVERTERS.find((item) => item.id === id) ?? null;
}
