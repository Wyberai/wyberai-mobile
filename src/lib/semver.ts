/** true if `current` is strictly below `min` (major.minor.patch, no pre-release handling needed here). */
export function isBelowMinVersion(current: string, min: string): boolean {
  const c = current.split('.').map((n) => parseInt(n, 10) || 0);
  const m = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(c.length, m.length); i++) {
    const cv = c[i] ?? 0;
    const mv = m[i] ?? 0;
    if (cv !== mv) return cv < mv;
  }
  return false;
}
