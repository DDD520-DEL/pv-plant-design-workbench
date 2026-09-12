import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startServer } from '../server.mjs';

async function withServer(run) {
  const dataFile = join(tmpdir(), `pv-api-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const server = await startServer({ port: 0, dataFile });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base, dataFile);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataFile, { force: true });
  }
}

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
}

test('健康检查返回服务标识', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/health`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.service, 'pv-plant-design-workbench');
  });
});

test('目录接口返回内置组件与逆变器', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/catalog`);
    const payload = await response.json();
    assert.equal(payload.modules.length, 3);
    assert.equal(payload.inverters.length, 3);
    assert.ok(payload.modules.some((item) => item.id === 'mod-620'));
    assert.ok(payload.inverters.some((item) => item.id === 'inv-25k'));
  });
});

test('电气校核接口：默认参数全通过并返回关键指标', async () => {
  await withServer(async (base) => {
    const { status, payload } = await post(base, '/api/design/electric', {
      moduleId: 'mod-620',
      inverterId: 'inv-25k',
      seriesPerString: 18,
      stringsPerMppt: 1,
      mpptUsed: 3,
      minCellTemp: -10,
      maxCellTemp: 70
    });

    assert.equal(status, 200);
    assert.equal(payload.result.status, 'pass');
    assert.equal(payload.result.metrics.dcKw, 33.48);
    assert.equal(payload.result.checks.length, 8);
  });
});

test('电气校核接口：串联过多判定不通过', async () => {
  await withServer(async (base) => {
    const { payload } = await post(base, '/api/design/electric', {
      moduleId: 'mod-620',
      inverterId: 'inv-25k',
      seriesPerString: 25,
      stringsPerMppt: 1,
      mpptUsed: 3
    });
    assert.equal(payload.result.status, 'fail');
    assert.equal(payload.result.checks.find((item) => item.id === 'voc-cold').pass, false);
  });
});

test('电气校核接口：未知组件与越界参数都返回 400', async () => {
  await withServer(async (base) => {
    const unknown = await post(base, '/api/design/electric', {
      moduleId: 'mod-missing',
      inverterId: 'inv-25k'
    });
    assert.equal(unknown.status, 400);
    assert.ok(unknown.payload.error.includes('未找到组件'));

    const outOfRange = await post(base, '/api/design/electric', {
      moduleId: 'mod-620',
      inverterId: 'inv-25k',
      seriesPerString: 0
    });
    assert.equal(outOfRange.status, 400);
    assert.ok(outOfRange.payload.error.includes('每串组件数'));
  });
});

test('电气校核接口：使用路数超过 MPPT 路数时返回 400', async () => {
  await withServer(async (base) => {
    const { status, payload } = await post(base, '/api/design/electric', {
      moduleId: 'mod-620',
      inverterId: 'inv-5k',
      seriesPerString: 10,
      mpptUsed: 3
    });
    assert.equal(status, 400);
    assert.ok(payload.error.includes('MPPT 路数'));
  });
});

test('排布接口：返回排数、每排块数与装机容量', async () => {
  await withServer(async (base) => {
    const { status, payload } = await post(base, '/api/design/layout', {
      moduleId: 'mod-620',
      latitude: 32,
      tiltDeg: 25,
      siteWidthMm: 50000,
      siteDepthMm: 30000,
      gapMm: 20
    });

    assert.equal(status, 200);
    assert.equal(payload.plan.modulesPerRow, 43);
    assert.equal(payload.plan.rows, 8);
    assert.equal(payload.plan.totalModules, 344);
    assert.equal(payload.plan.capacityKw, 213.28);
  });
});

test('发电量接口：按容量与衰减返回逐年结果', async () => {
  await withServer(async (base) => {
    const { status, payload } = await post(base, '/api/design/energy', {
      capacityKw: 100,
      peakSunHours: 3.8,
      performanceRatio: 0.8,
      years: 25
    });

    assert.equal(status, 200);
    assert.equal(payload.estimate.firstYearKwh, 108740.8);
    assert.equal(payload.estimate.annual.length, 25);
  });
});

test('自定义组件可以新增、出现在目录中并被删除', async () => {
  await withServer(async (base) => {
    const created = await post(base, '/api/catalog/modules', {
      brand: '测试品牌',
      model: 'TEST-600',
      pmax: 600,
      voc: 41.2,
      vmp: 34.5,
      isc: 18.6,
      imp: 17.5,
      betaVoc: -0.26,
      betaVmp: -0.3,
      alphaIsc: 0.045,
      gammaPmax: -0.3,
      lengthMm: 2382,
      widthMm: 1134,
      efficiency: 22.2
    });

    assert.equal(created.status, 201);
    assert.equal(created.payload.item.id, 'mod-custom-1');

    const catalog = await (await fetch(`${base}/api/catalog`)).json();
    assert.equal(catalog.modules.length, 4);

    const removed = await fetch(`${base}/api/catalog/modules/mod-custom-1`, { method: 'DELETE' });
    assert.equal(removed.status, 200);

    const after = await (await fetch(`${base}/api/catalog`)).json();
    assert.equal(after.modules.length, 3);
  });
});

test('内置条目不可删除，非法字段新增会被拦下', async () => {
  await withServer(async (base) => {
    const builtin = await fetch(`${base}/api/catalog/inverters/inv-25k`, { method: 'DELETE' });
    assert.equal(builtin.status, 400);
    assert.ok((await builtin.json()).error.includes('内置条目不可删除'));

    const invalid = await post(base, '/api/catalog/modules', { brand: '缺字段', model: 'X' });
    assert.equal(invalid.status, 400);
    assert.ok(invalid.payload.error.includes('峰值功率'));
  });
});

test('未知接口返回 404，首页返回 HTML', async () => {
  await withServer(async (base) => {
    const unknown = await fetch(`${base}/api/nope`);
    assert.equal(unknown.status, 404);

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('光伏电站设计与校核工作台'));
  });
});
