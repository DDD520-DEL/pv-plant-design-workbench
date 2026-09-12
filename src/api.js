/**
 * 前端访问后端的薄封装：统一 JSON 头、统一错误抛出。
 */

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `请求失败：${response.status} ${response.statusText}`);
  }
  return payload;
}

export function fetchHealth() {
  return request('/api/health');
}

export function fetchCatalog() {
  return request('/api/catalog');
}

export function postElectric(body) {
  return request('/api/design/electric', { method: 'POST', body: JSON.stringify(body) });
}

export function postLayout(body) {
  return request('/api/design/layout', { method: 'POST', body: JSON.stringify(body) });
}

export function postEnergy(body) {
  return request('/api/design/energy', { method: 'POST', body: JSON.stringify(body) });
}

export function postCable(body) {
  return request('/api/design/cable', { method: 'POST', body: JSON.stringify(body) });
}
