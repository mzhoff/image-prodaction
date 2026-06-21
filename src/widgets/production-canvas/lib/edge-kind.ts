import { getNodeImageAssetId, getNodeLocationResult, getNodePublicationResult, getNodeSubjectResult, getNodeTextResult, getRouterDataKind } from '@/entities/production-graph/model/graph-io';
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

export function getEdgeDataKind(edge: GraphEdge, nodesById: Map<string, ProductionNode>, edges: GraphEdge[]) {
  const source = nodesById.get(edge.sourceNodeId);
  const sourcePort = source ? getNodePorts(source).find((port) => port.id === edge.sourcePortId) : undefined;
  if (source?.type === 'router') {
    return getRouterDataKind(source, { edges, nodes: Array.from(nodesById.values()) });
  }
  if (sourcePort?.kind === 'subject') return 'subject';
  if (sourcePort?.kind === 'location') return 'location';
  if (sourcePort?.kind === 'publication') return 'publication';
  if (sourcePort?.kind === 'video') return 'video';
  if (sourcePort?.kind === 'audio') return 'audio';
  return sourcePort?.kind === 'image' ? 'image' : 'text';
}

export function getEdgeHasData(edge: GraphEdge, nodesById: Map<string, ProductionNode>, edges: GraphEdge[]) {
  const source = nodesById.get(edge.sourceNodeId);
  if (!source) return false;
  const sourcePort = getNodePorts(source).find((port) => port.id === edge.sourcePortId);
  const context = { edges, nodes: Array.from(nodesById.values()) };
  if (source?.type === 'router') {
    const kind = getRouterDataKind(source, context);
    if (kind === 'image') return Boolean(getNodeImageAssetId(source, { ...context, assets: [] }));
    if (kind === 'subject') return Boolean(getNodeSubjectResult(source, context));
    if (kind === 'location') return Boolean(getNodeLocationResult(source, context));
    if (kind === 'publication') return Boolean(getNodePublicationResult(source, context));
    if (kind === 'video' || kind === 'audio') return true;
  }
  if (sourcePort?.kind === 'image') return Boolean(getNodeImageAssetId(source, { ...context, assets: [] }));
  if (sourcePort?.kind === 'subject') return Boolean(getNodeSubjectResult(source, context));
  if (sourcePort?.kind === 'location') return Boolean(getNodeLocationResult(source, context));
  if (sourcePort?.kind === 'publication') return Boolean(getNodePublicationResult(source, context));
  return Boolean(getNodeTextResult(source, edge.sourcePortId, context));
}
