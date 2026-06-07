const BEZIER_HANDLE_RATIO = 0.42;
const BEZIER_MAX_HANDLE = 260;
const STRAIGHT_EDGE_THRESHOLD = 18;

export function getBezierPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const horizontalDistance = Math.abs(end.x - start.x);
  if (horizontalDistance <= STRAIGHT_EDGE_THRESHOLD) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

  const distance = Math.min(BEZIER_MAX_HANDLE, horizontalDistance * BEZIER_HANDLE_RATIO);
  const c1x = start.x + distance;
  const c2x = end.x - distance;

  return `M ${start.x} ${start.y} C ${c1x} ${start.y} ${c2x} ${end.y} ${end.x} ${end.y}`;
}
