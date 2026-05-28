import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';

export const generateInputPortIds: string[] = productionLayers.map((layer) => layer.id);

export function resolveTargetPortId(portId: string | undefined, targetNodeId: string | undefined, edges: GraphEdge[]) {
  if (!portId || !targetNodeId) return undefined;
  if (portId !== 'composing') return portId;

  return generateInputPortIds.find((inputPortId) => !edges.some((edge) => (
    edge.targetNodeId === targetNodeId && edge.targetPortId === inputPortId
  ))) ?? 'composition';
}

export function getEdgeDataKind(edge: GraphEdge, nodesById: Map<string, ProductionNode>) {
  const source = nodesById.get(edge.sourceNodeId);
  const sourcePort = source ? getNodePorts(source).find((port) => port.id === edge.sourcePortId) : undefined;
  return sourcePort?.kind === 'image' ? 'image' : 'text';
}
