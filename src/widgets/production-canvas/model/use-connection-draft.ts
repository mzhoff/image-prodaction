'use client';

import { useCallback, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { getPortPoint, type PortPointLookup } from '../lib/edge-path';
import { generateInputPortIds, resolveTargetPortId } from '../lib/edge-kind';

export interface ConnectionDraft {
  sourceNodeId: string;
  sourcePortId: string;
  start: GraphPoint;
  current: GraphPoint;
}

interface UseConnectionDraftParams {
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) => { ok: true } | { ok: false; reason: string };
  deleteEdge: (edgeId: string) => void;
  edges: GraphEdge[];
  measuredPortPoints: PortPointLookup;
  nodesById: Map<string, ProductionNode>;
  screenToWorld: (event: MouseEvent | PointerEvent) => GraphPoint | null;
}

export function useConnectionDraft({
  connect,
  deleteEdge,
  edges,
  measuredPortPoints,
  nodesById,
  screenToWorld,
}: UseConnectionDraftParams) {
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);

  const startConnection = useCallback((nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const node = nodesById.get(nodeId);
    if (!node) return;
    const isComposingGroup = node.type === 'generateImage' && portId === 'composing';
    const port = isComposingGroup
      ? { id: 'composing', label: 'Composing', kind: 'reference', side: 'input' as const }
      : getNodePorts(node).find((item) => item.id === portId);
    if (!port) return;

    let sourceNodeId = nodeId;
    let sourcePortId = portId;
    let detachedEdge: GraphEdge | undefined;

    if (port.side === 'input') {
      detachedEdge = edges.find((edge) => (
        edge.targetNodeId === nodeId
        && (isComposingGroup ? generateInputPortIds.includes(edge.targetPortId) : edge.targetPortId === portId)
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
    setConnectionDraft({ sourceNodeId, sourcePortId, start, current: start });

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
      const targetPortId = resolveTargetPortId(target?.dataset.portId, targetNodeId, edges);
      setConnectionDraft(null);
      if (!targetNodeId || !targetPortId) return;
      const result = connect(sourceNodeId, sourcePortId, targetNodeId, targetPortId);
      if (!result.ok) window.alert(result.reason);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [connect, deleteEdge, edges, measuredPortPoints, nodesById, screenToWorld]);

  return { connectionDraft, startConnection };
}
