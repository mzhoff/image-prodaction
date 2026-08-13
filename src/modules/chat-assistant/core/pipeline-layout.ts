import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';

const CANVAS_MIN = 80;
const CANVAS_MAX = 3_920;

export interface PipelineLayoutSpec {
  columnGap?: number;
  direction?: 'horizontal' | 'vertical';
  originX?: number;
  originY?: number;
  rowGap?: number;
}

interface PipelineLayoutInput {
  edges: Array<{
    sourceNodeKey: string;
    targetNodeKey: string;
  }>;
  layout?: PipelineLayoutSpec;
  nodes: Array<{ key: string }>;
}

export function positionPipelineBuildNodes(input: {
  currentProject: GraphProject;
  input: PipelineLayoutInput;
  nodes: ProductionNode[];
  warnings?: string[];
}) {
  if (input.nodes.length === 0) return [];
  const direction = input.input.layout?.direction ?? 'horizontal';
  const columnGap = input.input.layout?.columnGap ?? 160;
  const rowGap = input.input.layout?.rowGap ?? 120;
  const levels = calculateNodeLevels(input.input);
  const relative = layoutByLevels(input.nodes, input.input, levels, direction, columnGap, rowGap);
  const relativeBounds = getNodeBounds(relative);
  const explicitOrigin = input.input.layout?.originX !== undefined || input.input.layout?.originY !== undefined;
  let origin = explicitOrigin
    ? {
        x: input.input.layout?.originX ?? CANVAS_MIN,
        y: input.input.layout?.originY ?? CANVAS_MIN,
      }
    : chooseAutomaticOrigin(input.currentProject.nodes, relativeBounds, direction, columnGap, rowGap);
  let positioned = positionAtOrigin(relative, origin);
  if (explicitOrigin && overlapsExistingNodes(positioned, input.currentProject.nodes)) {
    input.warnings?.push('Запрошенные координаты пересекались с текущим графом; ноды перенесены в свободную область.');
    origin = chooseAutomaticOrigin(
      input.currentProject.nodes,
      relativeBounds,
      direction,
      columnGap,
      rowGap,
    );
    positioned = positionAtOrigin(relative, origin);
  }
  const bounds = getNodeBounds(positioned);
  if (bounds.left < CANVAS_MIN || bounds.top < CANVAS_MIN
    || bounds.right > CANVAS_MAX || bounds.bottom > CANVAS_MAX) {
    throw new Error('Prepared pipeline does not fit inside the canvas bounds.');
  }
  return positioned;
}

function positionAtOrigin(nodes: ProductionNode[], origin: { x: number; y: number }) {
  return nodes.map((node) => ({
    ...node,
    position: { x: node.position.x + origin.x, y: node.position.y + origin.y },
  }));
}

function overlapsExistingNodes(proposed: ProductionNode[], existing: ProductionNode[]) {
  const padding = 32;
  return proposed.some((next) => existing.some((current) => (
    next.position.x < current.position.x + current.size.width + padding
    && next.position.x + next.size.width + padding > current.position.x
    && next.position.y < current.position.y + current.size.height + padding
    && next.position.y + next.size.height + padding > current.position.y
  )));
}

function calculateNodeLevels(input: PipelineLayoutInput) {
  const keys = input.nodes.map((node) => node.key);
  const keySet = new Set(keys);
  const incoming = new Map(keys.map((key) => [key, 0]));
  const hasIncoming = new Set<string>();
  const outgoing = new Map(keys.map((key) => [key, [] as string[]]));
  input.edges.forEach((edge) => {
    if (!keySet.has(edge.sourceNodeKey) || !keySet.has(edge.targetNodeKey)) {
      throw new Error('Pipeline edge references an unknown node key.');
    }
    incoming.set(edge.targetNodeKey, (incoming.get(edge.targetNodeKey) ?? 0) + 1);
    hasIncoming.add(edge.targetNodeKey);
    outgoing.get(edge.sourceNodeKey)?.push(edge.targetNodeKey);
  });
  const queue = keys.filter((key) => incoming.get(key) === 0);
  const levels = new Map(keys.map((key) => [key, 0]));
  let visited = 0;
  while (queue.length) {
    const key = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(key) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, (levels.get(key) ?? 0) + 1));
      const nextIncoming = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, nextIncoming);
      if (nextIncoming === 0) queue.push(target);
    }
  }
  if (visited !== keys.length) throw new Error('Pipeline recipe must not contain cycles.');
  const finalLevel = Math.max(0, ...levels.values());
  keys.forEach((key) => {
    if (hasIncoming.has(key) && outgoing.get(key)?.length === 0) levels.set(key, finalLevel);
  });
  return levels;
}

function layoutByLevels(
  nodes: ProductionNode[],
  input: PipelineLayoutInput,
  levels: Map<string, number>,
  direction: 'horizontal' | 'vertical',
  columnGap: number,
  rowGap: number,
) {
  const grouped = new Map<number, Array<{ index: number; node: ProductionNode }>>();
  nodes.forEach((node, index) => {
    const level = levels.get(input.nodes[index].key) ?? 0;
    grouped.set(level, [...(grouped.get(level) ?? []), { index, node }]);
  });
  const positions = new Map<number, { x: number; y: number }>();
  const secondarySizes = new Map<number, number>();
  const maxSecondarySize = Math.max(...Array.from(grouped, ([level, levelNodes]) => {
    const size = levelNodes.reduce((total, { node }, index) => (
      total + (direction === 'horizontal' ? node.size.height : node.size.width)
        + (index === 0 ? 0 : rowGap)
    ), 0);
    secondarySizes.set(level, size);
    return size;
  }));
  let primaryOffset = 0;
  for (const level of Array.from(grouped.keys()).sort((a, b) => a - b)) {
    const levelNodes = grouped.get(level) ?? [];
    let secondaryOffset = (maxSecondarySize - (secondarySizes.get(level) ?? 0)) / 2;
    let primarySize = 0;
    levelNodes.forEach(({ index, node }) => {
      positions.set(index, direction === 'horizontal'
        ? { x: primaryOffset, y: secondaryOffset }
        : { x: secondaryOffset, y: primaryOffset });
      primarySize = Math.max(primarySize, direction === 'horizontal' ? node.size.width : node.size.height);
      secondaryOffset += (direction === 'horizontal' ? node.size.height : node.size.width) + rowGap;
    });
    primaryOffset += primarySize + columnGap;
  }
  return nodes.map((node, index) => ({ ...node, position: positions.get(index) ?? { x: 0, y: 0 } }));
}

function chooseAutomaticOrigin(
  currentNodes: ProductionNode[],
  proposedBounds: ReturnType<typeof getNodeBounds>,
  direction: 'horizontal' | 'vertical',
  columnGap: number,
  rowGap: number,
) {
  if (currentNodes.length === 0) return { x: 240, y: 240 };
  const current = getNodeBounds(currentNodes);
  const toRight = { x: current.right + columnGap, y: Math.max(CANVAS_MIN, current.top) };
  const below = { x: Math.max(CANVAS_MIN, current.left), y: current.bottom + rowGap };
  const candidates = direction === 'horizontal' ? [toRight, below] : [below, toRight];
  return candidates.find((origin) => (
    origin.x + proposedBounds.right <= CANVAS_MAX
    && origin.y + proposedBounds.bottom <= CANVAS_MAX
  )) ?? candidates[0];
}

function getNodeBounds(nodes: ProductionNode[]) {
  if (nodes.length === 0) return { bottom: 0, left: 0, right: 0, top: 0 };
  return nodes.reduce((bounds, node) => ({
    bottom: Math.max(bounds.bottom, node.position.y + node.size.height),
    left: Math.min(bounds.left, node.position.x),
    right: Math.max(bounds.right, node.position.x + node.size.width),
    top: Math.min(bounds.top, node.position.y),
  }), {
    bottom: Number.NEGATIVE_INFINITY,
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
  });
}
