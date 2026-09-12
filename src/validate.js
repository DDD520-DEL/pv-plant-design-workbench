/**
 * 参数取值校验：把请求里的原始值转成数字，并逐项对照上下限。
 * 服务器与测试共用同一套口径，避免前端宽松、后端严格导致的口径分叉。
 */

export function resolveFields(input, specs) {
  const values = {};
  const errors = [];

  for (const [field, spec] of Object.entries(specs)) {
    const raw = input?.[field];
    const fallback = spec.default;
    const value = raw === undefined || raw === null || raw === '' ? fallback : Number(raw);

    if (!Number.isFinite(value)) {
      errors.push(`${spec.label}不是有效数字`);
      continue;
    }
    if (value < spec.min || value > spec.max) {
      const unit = spec.unit ? ` ${spec.unit}` : '';
      errors.push(`${spec.label}应在 ${spec.min}–${spec.max}${unit} 之间，当前为 ${value}`);
      continue;
    }
    values[field] = value;
  }

  return { values, errors };
}

export function requireString(input, field, label) {
  const value = input?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${label}不能为空` };
  }
  return { value: value.trim() };
}
