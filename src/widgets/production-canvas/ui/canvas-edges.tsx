import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { getBezierPath, getEdgePath, type PortPointLookup } from '../lib/edge-path';
import { getEdgeDataKind } from '../lib/edge-kind';
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
        const edgeDataKind = getEdgeDataKind(edge, nodesById);
        return (
          <path
            key={edge.id}
            d={path}
            className={`edge-path ${edgeDataKind === 'text' ? 'edge-path-text' : 'edge-path-image'}`}
          />
        );
      })}
      {connectionDraft ? (
        <path
          d={getBezierPath(connectionDraft.start, connectionDraft.current)}
          className={`edge-path edge-path-draft ${getDraftKind(connectionDraft, nodesById) === 'text' ? 'edge-path-text' : 'edge-path-image'}`}
        />
      ) : null}
    </svg>
  );
}

function getDraftKind(connectionDraft: ConnectionDraft, nodesById: Map<string, ProductionNode>) {
  const source = nodesById.get(connectionDraft.sourceNodeId);
  const sourcePort = source ? getPortById(source, connectionDraft.sourcePortId) : undefined;
  return sourcePort?.kind === 'image' ? 'image' : 'text';
}
