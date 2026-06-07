'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodeImageAssetId, getNodeLocationResult, getNodePublicationResult, getNodeSubjectResult, getNodeTextResult } from '@/entities/production-graph/model/graph-io';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { PortKind, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';

type PortDataKind = 'image' | 'location' | 'publication' | 'subject' | 'text';
export type PortConnectionState = 'empty' | 'text' | 'image' | 'subject' | 'location' | 'publication' | 'mixed';

interface PortButtonProps {
  style?: CSSProperties;
  nodeId: string;
  portId: string;
  side: 'input' | 'output';
  kind: PortKind | string;
  label: string;
  className?: string;
  connectionState?: PortConnectionState;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function PortButton({
  nodeId,
  portId,
  side,
  kind,
  label,
  style,
  className,
  connectionState,
  onStartConnection,
}: PortButtonProps) {
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const visualState = useMemo(() => getPortVisualState({
    connectionState,
    edges,
    kind,
    nodeId,
    nodes,
    portId,
    side,
  }), [connectionState, edges, kind, nodeId, nodes, portId, side]);

  return (
    <button
      type="button"
      className={cn(
        'node-port',
        `node-port-${side}`,
        `node-port-${kind}`,
        `node-port-data-${visualState.dataKind}`,
        visualState.connected && 'node-port-connected',
        visualState.hasData && 'node-port-has-data',
        connectionState && `node-port-state-${connectionState}`,
        className,
      )}
      style={style}
      data-port-node-id={nodeId}
      data-port-id={portId}
      data-port-side={side}
      aria-label={`${label} ${side}`}
      title={`${label} (${kind})`}
      onPointerDown={(event) => {
        onStartConnection(nodeId, portId, event);
      }}
    />
  );
}

function getPortVisualState({
  connectionState,
  edges,
  kind,
  nodeId,
  nodes,
  portId,
  side,
}: {
  connectionState?: PortConnectionState;
  edges: ReturnType<typeof useProductionGraphStore.getState>['edges'];
  kind: PortKind | string;
  nodeId: string;
  nodes: ProductionNode[];
  portId: string;
  side: 'input' | 'output';
}) {
  const fallbackDataKind = getFallbackDataKind(kind, portId);
  if (connectionState === 'mixed') return { connected: true, dataKind: fallbackDataKind, hasData: true };
  if (connectionState === 'image') return { connected: true, dataKind: 'image' as const, hasData: true };
  if (connectionState === 'subject') return { connected: true, dataKind: 'subject' as const, hasData: true };
  if (connectionState === 'location') return { connected: true, dataKind: 'location' as const, hasData: true };
  if (connectionState === 'publication') return { connected: true, dataKind: 'publication' as const, hasData: true };
  if (connectionState === 'text') return { connected: true, dataKind: 'text' as const, hasData: true };
  if (connectionState === 'empty') return { connected: false, dataKind: fallbackDataKind, hasData: false };

  const connectedEdges = side === 'input'
    ? edges.filter((edge) => edge.targetNodeId === nodeId && edge.targetPortId === portId)
    : edges.filter((edge) => edge.sourceNodeId === nodeId && edge.sourcePortId === portId);
  const connected = connectedEdges.length > 0;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const firstSourceEdge = side === 'input' ? connectedEdges[0] : undefined;
  const firstSourceNode = firstSourceEdge ? nodesById.get(firstSourceEdge.sourceNodeId) : undefined;
  const firstSourcePort = firstSourceNode ? getNodePorts(firstSourceNode).find((port) => port.id === firstSourceEdge?.sourcePortId) : undefined;
  const dataKind = side === 'input'
    ? fallbackDataKind
    : firstSourcePort?.kind === 'subject' || (!firstSourcePort && fallbackDataKind === 'subject') ? 'subject'
      : firstSourcePort?.kind === 'location' || (!firstSourcePort && fallbackDataKind === 'location') ? 'location'
        : firstSourcePort?.kind === 'publication' || (!firstSourcePort && fallbackDataKind === 'publication') ? 'publication'
          : firstSourcePort?.kind === 'image' || (!firstSourcePort && fallbackDataKind === 'image') ? 'image'
            : 'text';
  const hasData = connectedEdges.some((edge) => {
    const sourceNode = nodesById.get(edge.sourceNodeId);
    if (!sourceNode) return false;
    const sourcePort = getNodePorts(sourceNode).find((port) => port.id === edge.sourcePortId);
    if (sourcePort?.kind === 'image') return Boolean(getNodeImageAssetId(sourceNode));
    if (sourcePort?.kind === 'subject') return Boolean(getNodeSubjectResult(sourceNode));
    if (sourcePort?.kind === 'location') return Boolean(getNodeLocationResult(sourceNode));
    if (sourcePort?.kind === 'publication') return Boolean(getNodePublicationResult(sourceNode));
    return Boolean(getNodeTextResult(sourceNode, edge.sourcePortId));
  });

  return { connected, dataKind, hasData };
}

function getFallbackDataKind(kind: PortKind | string, portId?: string): PortDataKind {
  if (kind === 'image') return 'image';
  if (kind === 'subject') return 'subject';
  if (kind === 'location') return 'location';
  if (kind === 'publication') return 'publication';
  if (kind === 'reference' && portId === 'reference') return 'image';
  return 'text';
}
