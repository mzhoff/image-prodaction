import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';

export const generateInputPortIds: string[] = ['reference', ...productionLayers.map((layer) => layer.id)];

export function resolveTargetPortId(
  portId: string | undefined,
  targetNodeId: string | undefined,
  edges: GraphEdge[],
  sourceNode?: ProductionNode,
  sourcePortId?: string,
) {
  if (!portId || !targetNodeId) return undefined;
  void edges;
  void sourceNode;
  void sourcePortId;
  return portId;
}

export function getEdgeDataKind(edge: GraphEdge, nodesById: Map<string, ProductionNode>) {
  const source = nodesById.get(edge.sourceNodeId);
  const sourcePort = source ? getNodePorts(source).find((port) => port.id === edge.sourcePortId) : undefined;
  return sourcePort?.kind === 'image' ? 'image' : 'text';
}
