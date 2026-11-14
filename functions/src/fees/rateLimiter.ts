const windows = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = windows.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    windows.set(key, valid);
    return false;
  }

  valid.push(now);
  windows.set(key, valid);
  return true;
}
