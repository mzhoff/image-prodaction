'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, GraphPoint, PortKind, ProductionNode } from '@/entities/production-graph/model/types';
import type { ConnectOptions, DeleteEdgeOptions } from '@/entities/production-graph/model/store-types';
import { getBezierPath, getPortPoint, type PortPointLookup } from '../lib/edge-path';

export interface ConnectionDraft {
  detached: boolean;
  detachedEdge?: GraphEdge;
  kind: PortKind;
  sourceNodeId?: string;
  sourcePortId?: string;
  start: GraphPoint;
  startSide: 'input' | 'output';
  current: GraphPoint;
  targetNodeId?: string;
  targetPortId?: string;
}

export interface ConnectionDropOnEmpty {
  direction: 'from-input' | 'from-output';
  detached: boolean;
  screenPoint: GraphPoint;
  sourceNodeId?: string;
  sourcePortId?: string;
  targetNodeId?: string;
  targetPortId?: string;
  worldPoint: GraphPoint;
}

interface UseConnectionDraftParams {
  connect: (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string, options?: ConnectOptions) => { ok: true } | { ok: false; reason: string };
  deleteEdge: (edgeId: string, options?: DeleteEdgeOptions) => void;
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
  const draftPathRef = useRef<SVGPathElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  const startConnection = useCallback((nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const node = nodesById.get(nodeId);
    if (!node) return;
    const port = getNodePorts(node).find((item) => item.id === portId);
    if (!port) return;

    let draft: ConnectionDraft;
    let detachedEdge: GraphEdge | undefined;
    const startPortPoint = getPortPoint(node, portId, measuredPortPoints) ?? screenToWorld(event.nativeEvent);
    if (!startPortPoint) return;

    if (port.side === 'output') {
      draft = {
        current: startPortPoint,
        detached: false,
        kind: port.kind,
        sourceNodeId: nodeId,
        sourcePortId: portId,
        start: startPortPoint,
        startSide: 'output',
      };
    } else {
      detachedEdge = edges.find((edge) => (
        edge.targetNodeId === nodeId
        && edge.targetPortId === portId
      ));
      const source = detachedEdge ? nodesById.get(detachedEdge.sourceNodeId) : undefined;
      const sourcePort = source ? getNodePorts(source).find((item) => item.id === detachedEdge?.sourcePortId) : undefined;
      const sourcePoint = source && detachedEdge
        ? getPortPoint(source, detachedEdge.sourcePortId, measuredPortPoints)
        : null;
      draft = {
        current: sourcePoint ?? startPortPoint,
        detached: Boolean(detachedEdge),
        detachedEdge,
        kind: sourcePort?.kind ?? port.kind,
        sourceNodeId: detachedEdge?.sourceNodeId,
        sourcePortId: detachedEdge?.sourcePortId,
        start: sourcePoint ?? startPortPoint,
        startSide: 'input',
        targetNodeId: nodeId,
        targetPortId: portId,
      };
    }

    event.preventDefault();
    event.stopPropagation();
    cancelRef.current?.();
    setConnectionDraft(draft);

    let frame = 0;
    let currentPoint = draft.current;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = screenToWorld(moveEvent);
      if (!current) return;
      currentPoint = current;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const path = draft.startSide === 'input' && !draft.sourceNodeId
          ? getBezierPath(currentPoint, draft.start)
          : getBezierPath(draft.start, currentPoint);
        draftPathRef.current?.setAttribute('d', path);
      });
    };

    const cleanup = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', handleKeyDown);
      cancelRef.current = null;
    };
    const cancel = () => { cleanup(); setConnectionDraft(null); };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };

    const handlePointerUp = (upEvent: PointerEvent) => {
      cleanup();

      const target = (upEvent.target as HTMLElement | null)?.closest('[data-port-side]') as HTMLElement | null;
      const targetNodeId = target?.dataset.portNodeId;
      const targetPortId = target?.dataset.portId;
      const targetSide = target?.dataset.portSide;
      const dropResult = targetNodeId && targetPortId && (targetSide === 'input' || targetSide === 'output')
        ? connectDroppedPorts(draft, targetNodeId, targetPortId, targetSide, connect)
        : null;

      if (!dropResult) {
        const worldPoint = screenToWorld(upEvent);
        if (draft.detached && draft.targetNodeId) {
          if (draft.detachedEdge) deleteEdge(draft.detachedEdge.id, { preserveDynamicInputSlots: false });
        }
        if (worldPoint && onDropOnEmpty && !draft.detached) {
          setConnectionDraft((draft) => (draft ? { ...draft, current: worldPoint } : draft));
          onDropOnEmpty({
            detached: draft.detached,
            direction: draft.startSide === 'input' ? 'from-input' : 'from-output',
            screenPoint: { x: upEvent.clientX, y: upEvent.clientY },
            sourceNodeId: draft.sourceNodeId,
            sourcePortId: draft.sourcePortId,
            targetNodeId: draft.targetNodeId,
            targetPortId: draft.targetPortId,
            worldPoint,
          });
          return;
        }
        setConnectionDraft(null);
        return;
      }
      setConnectionDraft(null);
      if (!dropResult.ok) {
        onConnectionError?.(dropResult.reason);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', handleKeyDown);
    cancelRef.current = cancel;
  }, [connect, deleteEdge, edges, measuredPortPoints, nodesById, onConnectionError, onDropOnEmpty, screenToWorld]);

  return { clearConnectionDraft: () => { cancelRef.current?.(); setConnectionDraft(null); }, connectionDraft, draftPathRef, startConnection };
}

function connectDroppedPorts(
  draft: ConnectionDraft,
  targetNodeId: string,
  targetPortId: string,
  targetSide: 'input' | 'output',
  connect: UseConnectionDraftParams['connect'],
) {
  if (draft.startSide === 'output') {
    if (!draft.sourceNodeId || !draft.sourcePortId || targetSide !== 'input') return null;
    return connect(draft.sourceNodeId, draft.sourcePortId, targetNodeId, targetPortId);
  }

  if (targetSide === 'output' && draft.targetNodeId && draft.targetPortId) {
    return connect(targetNodeId, targetPortId, draft.targetNodeId, draft.targetPortId, { detachedEdge: draft.detachedEdge });
  }

  if (targetSide === 'input' && draft.detached && draft.sourceNodeId && draft.sourcePortId) {
    return connect(draft.sourceNodeId, draft.sourcePortId, targetNodeId, targetPortId, { detachedEdge: draft.detachedEdge });
  }

  return null;
}
