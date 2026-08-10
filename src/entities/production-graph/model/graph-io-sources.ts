import type { GraphIncomingSource, GraphIoContext } from './graph-io-contracts';
import type { ProductionNode } from './types';

export function getIncomingSources(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: Pick<GraphIoContext, 'edges' | 'nodes'>,
) {
  const nodesById = new Map(context.nodes.map((node) => [node.id, node]));
  return context.edges.flatMap((edge): GraphIncomingSource[] => {
    if (edge.targetNodeId !== targetNodeId || (targetPortId && edge.targetPortId !== targetPortId)) return [];
    const sourceNode = nodesById.get(edge.sourceNodeId);
    return sourceNode ? [{
      edge, sourceNode, sourcePortId: edge.sourcePortId, targetPortId: edge.targetPortId,
    }] : [];
  });
}

export function getRouterIncomingSource(
  node: ProductionNode,
  context?: Pick<GraphIoContext, 'edges' | 'nodes'>,
  visited = new Set<string>(),
) {
  if (!context || visited.has(node.id)) return undefined;
  visited.add(node.id);
  return getIncomingSources(node.id, 'input', context)[0];
}

export function getTransparentRouterSource(
  routerOutput: GraphIncomingSource,
  originalInput: GraphIncomingSource,
): GraphIncomingSource {
  return {
    edge: routerOutput.edge,
    sourceNode: originalInput.sourceNode,
    sourcePortId: originalInput.sourcePortId,
    targetPortId: routerOutput.targetPortId,
  };
}

export function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function getSafeIndex(index: number | undefined, length: number) {
  if (length <= 0) return -1;
  if (typeof index !== 'number' || Number.isNaN(index)) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}
