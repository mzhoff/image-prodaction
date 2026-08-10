import { getDynamicInputPortIndex, updateDynamicInputCount } from './dynamic-input-slot';
import type { GraphEdge, ProductionNode } from './types';

export function reorderTelegramMedia(
  nodes: ProductionNode[],
  edges: GraphEdge[],
  nodeId: string,
  edgeIds: string[],
  mediaOrder: string[],
) {
  const node = nodes.find((item) => item.id === nodeId);
  if (node?.type !== 'telegramPublication') return { edges, nodes };
  const mediaEdges = edges
    .filter((edge) => edge.targetNodeId === nodeId
      && getDynamicInputPortIndex('telegramPublication', edge.targetPortId) >= 0)
    .sort((first, second) => getDynamicInputPortIndex('telegramPublication', first.targetPortId)
      - getDynamicInputPortIndex('telegramPublication', second.targetPortId));
  const mediaEdgeById = new Map(mediaEdges.map((edge) => [edge.id, edge]));
  const orderedEdgeIds = uniqueEdgeIds(edgeIds).filter((edgeId) => mediaEdgeById.has(edgeId));
  const orderedEdgeIdSet = new Set(orderedEdgeIds);
  const reorderedEdges = [
    ...orderedEdgeIds.flatMap((edgeId) => {
      const edge = mediaEdgeById.get(edgeId);
      return edge ? [edge] : [];
    }),
    ...mediaEdges.filter((edge) => !orderedEdgeIdSet.has(edge.id)),
  ];
  const portByEdgeId = new Map(reorderedEdges.map((edge, index) => [edge.id, `media-${index}`]));
  const nextEdges = edges.map((edge) => portByEdgeId.has(edge.id)
    ? { ...edge, targetPortId: portByEdgeId.get(edge.id) ?? edge.targetPortId }
    : edge);
  const nodeWithMediaOrder = { ...node, data: { ...node.data, mediaOrder } };
  return {
    edges: nextEdges,
    nodes: nodes.map((item) => item.id === nodeId
      ? updateDynamicInputCount(nodeWithMediaOrder, nextEdges)
      : item),
  };
}

function uniqueEdgeIds(edgeIds: string[]) {
  const seen = new Set<string>();
  return edgeIds.filter((edgeId) => {
    if (!edgeId || seen.has(edgeId)) return false;
    seen.add(edgeId);
    return true;
  });
}
