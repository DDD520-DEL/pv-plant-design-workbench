/**
 * 工作台的运行时状态：目录数据与上一次校核结果。
 * 只做存取，不放业务逻辑，方便后续接入更多模块时复用。
 */

export const state = {
  catalog: { modules: [], inverters: [] },
  lastResult: null
};

export function setCatalog(catalog) {
  state.catalog = catalog;
}

export function setLastResult(result) {
  state.lastResult = result;
}
