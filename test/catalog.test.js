import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCatalog, writeCatalog } from '../src/store.js';
import { normalizeInverter, normalizeModule } from '../src/catalog-schema.js';

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'pv-catalog-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sampleModule = {
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
};

test('自定义库文件不存在时按空库处理', async () => {
  await withTempDir(async (dir) => {
    const catalog = await readCatalog(join(dir, 'missing.json'));
    assert.deepEqual(catalog, { modules: [], inverters: [] });
  });
});

test('自定义库写入后可原样读回', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'nested', 'catalog.json');
    await writeCatalog(file, { modules: [{ id: 'mod-custom-1' }], inverters: [] });
    const catalog = await readCatalog(file);
    assert.equal(catalog.modules.length, 1);
    assert.equal(catalog.modules[0].id, 'mod-custom-1');
    assert.deepEqual(catalog.inverters, []);
  });
});

test('自定义库文件内容损坏时抛出可读错误', async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, 'catalog.json');
    await writeCatalog(file, { modules: [], inverters: [] });
    await writeCatalog(file, { modules: 'not-an-array', inverters: 3 });
    const catalog = await readCatalog(file);
    assert.deepEqual(catalog, { modules: [], inverters: [] });
  });
});

test('组件字段校验：合法输入返回归一化结果', () => {
  const { value, errors } = normalizeModule(sampleModule);
  assert.equal(errors, undefined);
  assert.equal(value.brand, '测试品牌');
  assert.equal(value.pmax, 600);
  assert.equal(value.lengthMm, 2382);
});

test('组件字段校验：缺品牌与超范围功率都会被拦下', () => {
  const missingBrand = normalizeModule({ ...sampleModule, brand: '  ' });
  assert.equal(missingBrand.value, undefined);
  assert.deepEqual(missingBrand.errors, ['组件品牌不能为空']);

  const badPower = normalizeModule({ ...sampleModule, pmax: 5000 });
  assert.ok(badPower.errors.some((message) => message.includes('峰值功率')));
});

test('逆变器字段校验：字符串数字可接受，越界与缺型号会被拦下', () => {
  const base = {
    brand: '兆恒',
    model: 'ZH-TEST',
    pacRated: 30,
    pmaxDc: '45',
    vdcMax: 1100,
    vmpptMin: 200,
    vmpptMax: 1000,
    vStart: 250,
    mpptCount: 4,
    iMaxPerMppt: 40,
    iScMaxPerMppt: 60
  };

  const ok = normalizeInverter(base);
  assert.equal(ok.errors, undefined);
  assert.equal(ok.value.pmaxDc, 45);

  const bad = normalizeInverter({ ...base, model: '', mpptCount: 99 });
  assert.ok(bad.errors.some((message) => message.includes('逆变器型号')));
  assert.ok(bad.errors.some((message) => message.includes('MPPT 路数')));
});
