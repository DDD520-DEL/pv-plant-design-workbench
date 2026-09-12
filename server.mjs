import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_INVERTERS,
  BUILTIN_MODULES,
  findBuiltinInverter,
  findBuiltinModule
} from './src/catalogs.js';
import { normalizeInverter, normalizeModule } from './src/catalog-schema.js';
import { CELL_TEMP_LIMITS, STRING_LIMITS, evaluateElectric } from './src/pv-math.js';
import { LAYOUT_LIMITS, arrayPlan } from './src/layout.js';
import { ENERGY_LIMITS, energyEstimate } from './src/yield.js';
import { ECONOMICS_LIMITS, evaluateEconomics } from './src/economics.js';
import { CABLE_LIMITS, evaluateCable, resolveMaterial } from './src/cable.js';
import { readCatalog, writeCatalog } from './src/store.js';
import { resolveFields } from './src/validate.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const defaultDataFile = join(root, 'data', 'catalog.json');
const defaultPort = Number(process.env.PORT ?? 5174);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, limit = 100_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      throw Object.assign(new Error('请求体过大'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw Object.assign(new Error(`请求体不是合法 JSON：${error.message}`), { statusCode: 400 });
  }
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(join(root, relative));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

function pickModule(catalog, id) {
  if (!id) return null;
  return findBuiltinModule(id) ?? catalog.modules.find((item) => item.id === id) ?? null;
}

function pickInverter(catalog, id) {
  if (!id) return null;
  return findBuiltinInverter(id) ?? catalog.inverters.find((item) => item.id === id) ?? null;
}

function nextCustomId(prefix, items) {
  let index = 1;
  while (items.some((item) => item.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function createApp({ dataFile = defaultDataFile } = {}) {
  async function handleElectric(request, response) {
    const body = await readJsonBody(request);
    const catalog = await readCatalog(dataFile);
    const module = pickModule(catalog, body.moduleId);
    const inverter = pickInverter(catalog, body.inverterId);
    if (!module) throw badRequest(`未找到组件：${body.moduleId ?? '（空）'}`);
    if (!inverter) throw badRequest(`未找到逆变器：${body.inverterId ?? '（空）'}`);

    const specs = {
      seriesPerString: { ...STRING_LIMITS.seriesPerString, default: 20 },
      stringsPerMppt: { ...STRING_LIMITS.stringsPerMppt, default: 1 },
      mpptUsed: { ...STRING_LIMITS.mpptUsed, default: Math.min(2, inverter.mpptCount) },
      minCellTemp: { ...CELL_TEMP_LIMITS.minCellTemp, default: -10 },
      maxCellTemp: { ...CELL_TEMP_LIMITS.maxCellTemp, default: 70 }
    };
    const { values, errors } = resolveFields(body, specs);
    if (errors.length > 0) throw badRequest(errors.join('；'));
    if (values.mpptUsed > inverter.mpptCount) {
      throw badRequest(`使用路数不能超过逆变器 MPPT 路数（${inverter.mpptCount}）`);
    }

    sendJson(response, 200, {
      module: { id: module.id, brand: module.brand, model: module.model },
      inverter: { id: inverter.id, brand: inverter.brand, model: inverter.model },
      result: evaluateElectric({ module, inverter, ...values })
    });
  }

  async function handleLayout(request, response) {
    const body = await readJsonBody(request);
    const catalog = await readCatalog(dataFile);
    const module = pickModule(catalog, body.moduleId);
    if (!module) throw badRequest(`未找到组件：${body.moduleId ?? '（空）'}`);

    const { values, errors } = resolveFields(body, LAYOUT_LIMITS);
    if (errors.length > 0) throw badRequest(errors.join('；'));

    const plan = arrayPlan({
      ...values,
      moduleLengthMm: module.lengthMm,
      moduleWidthMm: module.widthMm,
      pmax: module.pmax
    });

    sendJson(response, 200, {
      module: { id: module.id, brand: module.brand, model: module.model },
      plan
    });
  }

  async function handleEnergy(request, response) {
    const body = await readJsonBody(request);
    const { values, errors } = resolveFields(body, ENERGY_LIMITS);
    if (errors.length > 0) throw badRequest(errors.join('；'));
    sendJson(response, 200, { estimate: energyEstimate(values) });
  }

  async function handleEconomics(request, response) {
    const body = await readJsonBody(request);
    // 容量、辐照、PR、年限、衰减与发电量接口同一套口径，
    // 服务端先重算逐年发电量，再喂给经济性分析，避免两侧结果分叉。
    const specs = { ...ENERGY_LIMITS, ...ECONOMICS_LIMITS };
    const { values, errors } = resolveFields(body, specs);
    if (errors.length > 0) throw badRequest(errors.join('；'));

    const estimate = energyEstimate(values);
    const result = evaluateEconomics({
      capacityKw: values.capacityKw,
      unitCostYuanPerW: values.unitCostYuanPerW,
      omRatePercent: values.omRatePercent,
      tariffYuanPerKwh: values.tariffYuanPerKwh,
      annual: estimate.annual
    });
    sendJson(response, 200, { estimate, result });
  }

  async function handleCable(request, response) {
    const body = await readJsonBody(request);
    const { values, errors } = resolveFields(body, CABLE_LIMITS);
    if (errors.length > 0) throw badRequest(errors.join('；'));

    const materialSpec = resolveMaterial(body.conductorMaterial ?? 'cu');
    if (!materialSpec) {
      throw badRequest(`导体材质不支持：${String(body.conductorMaterial)}（仅支持 cu 铜芯 / al 铝芯）`);
    }

    sendJson(response, 200, {
      result: evaluateCable({ material: materialSpec.id, ...values })
    });
  }

  async function handleCreate(request, response, kind) {
    const body = await readJsonBody(request);
    const catalog = await readCatalog(dataFile);
    const isModule = kind === 'modules';
    const parsed = isModule ? normalizeModule(body) : normalizeInverter(body);
    if (parsed.errors) throw badRequest(parsed.errors.join('；'));

    const list = isModule ? catalog.modules : catalog.inverters;
    const item = { id: nextCustomId(isModule ? 'mod-custom' : 'inv-custom', list), ...parsed.value };
    list.push(item);
    await writeCatalog(dataFile, catalog);
    sendJson(response, 201, { item });
  }

  async function handleDelete(response, kind, id) {
    const catalog = await readCatalog(dataFile);
    const isModule = kind === 'modules';
    const list = isModule ? catalog.modules : catalog.inverters;
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) {
      const builtin = isModule ? findBuiltinModule(id) : findBuiltinInverter(id);
      throw badRequest(builtin ? '内置条目不可删除' : `未找到条目：${id}`);
    }
    const [removed] = list.splice(index, 1);
    await writeCatalog(dataFile, catalog);
    sendJson(response, 200, { removed });
  }

  async function handleApi(request, response, url) {
    const { pathname } = url;
    const method = request.method ?? 'GET';
    const catalog = await readCatalog(dataFile);

    if (pathname === '/api/health' && method === 'GET') {
      sendJson(response, 200, {
        ok: true,
        service: 'pv-plant-design-workbench',
        time: new Date().toISOString()
      });
      return true;
    }

    if (pathname === '/api/catalog' && method === 'GET') {
      sendJson(response, 200, {
        modules: [...BUILTIN_MODULES, ...catalog.modules],
        inverters: [...BUILTIN_INVERTERS, ...catalog.inverters]
      });
      return true;
    }

    if (pathname === '/api/design/electric' && method === 'POST') {
      await handleElectric(request, response);
      return true;
    }

    if (pathname === '/api/design/layout' && method === 'POST') {
      await handleLayout(request, response);
      return true;
    }

    if (pathname === '/api/design/energy' && method === 'POST') {
      await handleEnergy(request, response);
      return true;
    }

    if (pathname === '/api/design/economics' && method === 'POST') {
      await handleEconomics(request, response);
      return true;
    }

    if (pathname === '/api/design/cable' && method === 'POST') {
      await handleCable(request, response);
      return true;
    }

    const createMatch = pathname.match(/^\/api\/catalog\/(modules|inverters)$/);
    if (createMatch && method === 'POST') {
      await handleCreate(request, response, createMatch[1]);
      return true;
    }

    const deleteMatch = pathname.match(/^\/api\/catalog\/(modules|inverters)\/(.+)$/);
    if (deleteMatch && method === 'DELETE') {
      await handleDelete(response, deleteMatch[1], decodeURIComponent(deleteMatch[2]));
      return true;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: `未知接口：${method} ${pathname}` });
      return true;
    }

    return false;
  }

  async function handleStatic(response, pathname) {
    const relative = pathname === '/' ? 'index.html' : pathname;
    const target = safeStaticPath(relative);
    if (!target) {
      sendJson(response, 403, { error: '非法路径' });
      return;
    }

    try {
      const info = await stat(target);
      if (info.isDirectory()) {
        sendJson(response, 404, { error: '未找到资源' });
        return;
      }
      const content = await readFile(target);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendJson(response, 404, { error: '未找到资源' });
        return;
      }
      throw error;
    }
  }

  return async function app(request, response) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(request, response, url);
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: `不支持的方法：${request.method}` });
        return;
      }
      await handleStatic(response, url.pathname);
    } catch (error) {
      const status = error.statusCode ?? 500;
      sendJson(response, status, { error: error.message });
    }
  };
}

export function startServer({ port = defaultPort, dataFile = defaultDataFile } = {}) {
  const server = createServer(createApp({ dataFile }));
  return new Promise((resolveStarted) => {
    server.listen(port, () => resolveStarted(server));
  });
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  startServer().then(() => {
    console.log(`光伏电站设计工作台已启动：http://localhost:${defaultPort}`);
  });
}
