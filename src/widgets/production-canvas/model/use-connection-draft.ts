'use client';

import { useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { getPortPoint, type PortPointLookup } from '../lib/edge-path';
import { resolveTargetPortId } from '../lib/edge-kind';

export interface ConnectionDraft {
  sourceNodeId: string;
  sourcePortId: string;
  start: GraphPoint;
  current: GraphPoint;
  detached: boolean;
}

export interface ConnectionDropOnEmpty {
  sourceNodeId: string;
  sourcePortId: string;
  detached: boolean;
  screenPoint: GraphPoint;
  worldPoint: GraphPoint;
}

interface UseConnectionDraftParams {
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => { ok: true } | { ok: false; reason: string };
  deleteEdge: (edgeId: string) => void;
  edges: GraphEdge[];
  measuredPortPoints: PortPointLookup;
  nodesById: Map<string, ProductionNode>;
  onConnectionError?: (message: string) => void;
  onDropOnEmpty?: (drop: ConnectionDropOnEmpty) => void;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
}

export function useConnectionDraft({
  connect,
  deleteEdge,
  edges,
  measuredPortPoints,
  nodesById,
  onConnectionError,
  onDropOnEmpty,
  screenToWorld,
}: UseConnectionDraftParams) {
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);

  const startConnection = useCallback((nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const node = nodesById.get(nodeId);
    if (!node) return;
    const port = getNodePorts(node).find((item) => item.id === portId);
    if (!port) return;

    let sourceNodeId = nodeId;
    let sourcePortId = portId;
    let detachedEdge: GraphEdge | undefined;

    if (port.side === 'input') {
      detachedEdge = edges.find((edge) => (
        edge.targetNodeId === nodeId
        && edge.targetPortId === portId
      ));
      if (!detachedEdge) return;
      sourceNodeId = detachedEdge.sourceNodeId;
      sourcePortId = detachedEdge.sourcePortId;
    }

    const source = nodesById.get(sourceNodeId);
    if (!source) return;
    const start = getPortPoint(source, sourcePortId, measuredPortPoints) ?? screenToWorld(event.nativeEvent);
    if (!start) return;

    event.preventDefault();
    event.stopPropagation();
    if (detachedEdge) deleteEdge(detachedEdge.id);
    const detached = Boolean(detachedEdge);
    setConnectionDraft({ sourceNodeId, sourcePortId, start, current: start, detached });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = screenToWorld(moveEvent);
      if (!current) return;
      setConnectionDraft((draft) => (draft ? { ...draft, current } : null));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      const target = (upEvent.target as HTMLElement | null)?.closest('[data-port-side="input"]') as HTMLElement | null;
      const targetNodeId = target?.dataset.portNodeId;
      const sourceNode = nodesById.get(sourceNodeId);
      const targetPortId = resolveTargetPortId(target?.dataset.portId, targetNodeId, edges, sourceNode, sourcePortId);
      if (!targetNodeId || !targetPortId) {
        const worldPoint = screenToWorld(upEvent);
        if (worldPoint && onDropOnEmpty && !detached) {
          setConnectionDraft((draft) => (draft ? { ...draft, current: worldPoint } : draft));
          onDropOnEmpty({
            sourceNodeId,
            sourcePortId,
            detached,
            screenPoint: { x: upEvent.clientX, y: upEvent.clientY },
            worldPoint,
          });
          return;
        }
        setConnectionDraft(null);
        return;
      }
      setConnectionDraft(null);
      const result = connect(sourceNodeId, sourcePortId, targetNodeId, targetPortId);
      if (!result.ok) onConnectionError?.(result.reason);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [connect, deleteEdge, edges, measuredPortPoints, nodesById, onConnectionError, onDropOnEmpty, screenToWorld]);

  return { clearConnectionDraft: () => setConnectionDraft(null), connectionDraft, startConnection };
}
