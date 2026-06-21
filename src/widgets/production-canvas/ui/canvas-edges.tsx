import { getPortById } from '@/entities/production-graph/model/node-definitions';
import { getRouterDataKind } from '@/entities/production-graph/model/graph-io';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { getBezierPath, getEdgePath, type PortPointLookup } from '../lib/edge-path';
import { getEdgeDataKind, getEdgeHasData } from '../lib/edge-kind';
import type { ConnectionDraft } from '../model/use-connection-draft';

interface CanvasEdgesProps {
  collapsedGenerateComposingNodeIds: Set<string>;
  connectionDraft: ConnectionDraft | null;
  edges: GraphEdge[];
  measuredPortPoints: PortPointLookup;
  nodesById: Map<string, ProductionNode>;
  worldSize: number;
}

export function CanvasEdges({
  collapsedGenerateComposingNodeIds,
  connectionDraft,
  edges,
  measuredPortPoints,
  nodesById,
  worldSize,
}: CanvasEdgesProps) {
  return (
    <svg className="edge-layer" width={worldSize} height={worldSize} aria-hidden="true">
      {edges.map((edge) => {
        const path = getEdgePath(edge, nodesById, { collapsedGenerateComposingNodeIds, measuredPortPoints });
        if (!path) return null;
        const edgeDataKind = getEdgeDataKind(edge, nodesById, edges);
        const edgeHasData = getEdgeHasData(edge, nodesById, edges);
        return (
          <path
            key={edge.id}
            d={path}
            className={`edge-path ${getEdgeKindClass(edgeDataKind)} ${edgeHasData ? 'edge-path-has-data' : 'edge-path-empty'}`}
          />
        );
      })}
      {connectionDraft ? (
        <path
          d={getDraftPath(connectionDraft)}
          className={`edge-path edge-path-draft ${getEdgeKindClass(getDraftKind(connectionDraft, nodesById, edges))}`}
        />
      ) : null}
    </svg>
  );
}

function getDraftPath(connectionDraft: ConnectionDraft) {
  if (connectionDraft.startSide === 'input' && !connectionDraft.sourceNodeId) {
    return getBezierPath(connectionDraft.current, connectionDraft.start);
  }
  return getBezierPath(connectionDraft.start, connectionDraft.current);
}

function getDraftKind(connectionDraft: ConnectionDraft, nodesById: Map<string, ProductionNode>, edges: GraphEdge[]) {
  if (connectionDraft.kind) {
    if (connectionDraft.kind === 'subject') return 'subject';
    if (connectionDraft.kind === 'location') return 'location';
    if (connectionDraft.kind === 'publication') return 'publication';
    if (connectionDraft.kind === 'video') return 'video';
    if (connectionDraft.kind === 'audio') return 'audio';
    if (connectionDraft.kind === 'image') return 'image';
    return 'text';
  }
  if (!connectionDraft.sourceNodeId || !connectionDraft.sourcePortId) return 'text';
  const source = nodesById.get(connectionDraft.sourceNodeId);
  const sourcePort = source ? getPortById(source, connectionDraft.sourcePortId) : undefined;
  if (sourcePort?.kind === 'subject') return 'subject';
  if (sourcePort?.kind === 'location') return 'location';
  if (sourcePort?.kind === 'publication') return 'publication';
  if (sourcePort?.kind === 'video') return 'video';
  if (sourcePort?.kind === 'audio') return 'audio';
  if (sourcePort?.kind === 'image') return 'image';
  if (source?.type === 'router') return getRouterDataKind(source, { edges, nodes: Array.from(nodesById.values()) });
  return 'text';
}

function getEdgeKindClass(kind: string) {
  if (kind === 'image') return 'edge-path-image';
  if (kind === 'video') return 'edge-path-video';
  if (kind === 'audio') return 'edge-path-audio';
  if (kind === 'empty') return 'edge-path-empty-kind';
  if (kind === 'subject') return 'edge-path-subject';
  if (kind === 'location') return 'edge-path-location';
  if (kind === 'publication') return 'edge-path-publication';
  return 'edge-path-text';
}
