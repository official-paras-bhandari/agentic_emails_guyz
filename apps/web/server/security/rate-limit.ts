const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const values = (buckets.get(key) || []).filter(value => value > now - windowMs);
  if (values.length >= limit) return false;
  values.push(now);
  buckets.set(key, values);
  return true;
}
