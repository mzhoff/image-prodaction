import type { ProductionNode } from '@/entities/production-graph/model/types';

// A level can span several lanes, but every downstream level starts after all
// of them. This preserves flow direction and never drops nodes or overlaps.
export function compactPipelineLevels(
  nodes: ProductionNode[], keys: Array<{ key: string }>, levels: Map<string, number>,
  direction: 'horizontal' | 'vertical', maxExtent: number, primaryGap: number, secondaryGap: number,
) {
  const groups = new Map<number, number[]>();
  nodes.forEach((_, index) => {
    const level = levels.get(keys[index].key) ?? 0;
    groups.set(level, [...(groups.get(level) ?? []), index]);
  });
  const result = nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } }));
  let primary = 0;
  for (const level of [...groups.keys()].sort((a, b) => a - b)) {
    let secondary = 0;
    let laneSize = 0;
    for (const index of groups.get(level) ?? []) {
      const node = nodes[index];
      const primarySize = direction === 'horizontal' ? node.size.width : node.size.height;
      const secondarySize = direction === 'horizontal' ? node.size.height : node.size.width;
      if (secondary > 0 && secondary + secondarySize > maxExtent) {
        primary += laneSize + primaryGap;
        secondary = 0;
        laneSize = 0;
      }
      result[index].position = direction === 'horizontal'
        ? { x: primary, y: secondary } : { x: secondary, y: primary };
      secondary += secondarySize + secondaryGap;
      laneSize = Math.max(laneSize, primarySize);
    }
    primary += laneSize + primaryGap;
  }
  return result;
}
