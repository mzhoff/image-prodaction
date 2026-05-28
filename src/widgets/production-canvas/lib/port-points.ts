import type { PortPointLookup } from './edge-path';

export function arePortPointLookupsEqual(a: PortPointLookup, b: PortPointLookup) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => (
    b[key]
    && Math.abs(a[key].x - b[key].x) < 0.05
    && Math.abs(a[key].y - b[key].y) < 0.05
  ));
}
