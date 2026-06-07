import { getNodeImageAssetId, getNodeLocationResult, getNodePublicationResult, getNodeSubjectResult, getNodeTextResult } from '@/entities/production-graph/model/graph-io';
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
  if (sourcePort?.kind === 'subject') return 'subject';
  if (sourcePort?.kind === 'location') return 'location';
  if (sourcePort?.kind === 'publication') return 'publication';
  return sourcePort?.kind === 'image' ? 'image' : 'text';
}

export function getEdgeHasData(edge: GraphEdge, nodesById: Map<string, ProductionNode>) {
  const source = nodesById.get(edge.sourceNodeId);
  if (!source) return false;
  const sourcePort = getNodePorts(source).find((port) => port.id === edge.sourcePortId);
  if (sourcePort?.kind === 'image') return Boolean(getNodeImageAssetId(source));
  if (sourcePort?.kind === 'subject') return Boolean(getNodeSubjectResult(source));
  if (sourcePort?.kind === 'location') return Boolean(getNodeLocationResult(source));
  if (sourcePort?.kind === 'publication') return Boolean(getNodePublicationResult(source));
  return Boolean(getNodeTextResult(source, edge.sourcePortId));
}
