import type { GraphPoint } from '@/entities/production-graph/model/types';

const cross = (a: GraphPoint, b: GraphPoint, p: GraphPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function distanceToSegment(p: GraphPoint, a: GraphPoint, b: GraphPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Screen-space intersection, including the visible stroke around each sampled curve. */
export function cutIntersectsSegment(a: GraphPoint, b: GraphPoint, c: GraphPoint, d: GraphPoint, tolerance = 2) {
  if (Math.max(a.x, b.x) + tolerance < Math.min(c.x, d.x) || Math.max(c.x, d.x) + tolerance < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) + tolerance < Math.min(c.y, d.y) || Math.max(c.y, d.y) + tolerance < Math.min(a.y, b.y)) return false;
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b)) <= tolerance;
}
