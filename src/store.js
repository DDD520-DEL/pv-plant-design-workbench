/**
 * 自定义组件/逆变器的本地持久化。文件内容形如：
 *   { "modules": [...], "inverters": [...] }
 * 文件不存在时按空库处理，保证首次 clone 后直接可跑。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function readCatalog(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { modules: toArray(parsed.modules), inverters: toArray(parsed.inverters) };
  } catch (error) {
    if (error.code === 'ENOENT') return { modules: [], inverters: [] };
    throw new Error(`读取自定义库失败：${error.message}`);
  }
}

export async function writeCatalog(filePath, catalog) {
  const payload = {
    modules: toArray(catalog.modules),
    inverters: toArray(catalog.inverters)
  };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}
