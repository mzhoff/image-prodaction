'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { getNodeImageAssetId, getNodeTextResult } from '@/entities/production-graph/model/graph-io';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from '@/entities/production-graph/model/node-layout';
import type { AdjustmentNodeData, CropImageNodeData, CurvesNodeData, FrequencyRetouchNodeData, PortKind, ProductionNode, PreviewNodeData, SketchNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';

type PortDataKind = 'image' | 'text';

interface PortButtonProps {
  style?: CSSProperties;
  nodeId: string;
  portId: string;
  side: 'input' | 'output';
  kind: PortKind | string;
  label: string;
  className?: string;
  connectionState?: 'empty' | 'text' | 'image' | 'mixed';
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
  connectionState?: 'empty' | 'text' | 'image' | 'mixed';
  edges: ReturnType<typeof useProductionGraphStore.getState>['edges'];
  kind: PortKind | string;
  nodeId: string;
  nodes: ProductionNode[];
  portId: string;
  side: 'input' | 'output';
}) {
  const fallbackDataKind = getFallbackDataKind(kind, portId);
  if (connectionState === 'mixed') return { connected: true, dataKind: fallbackDataKind, hasData: true };
  if (connectionState === 'image') return { connected: true, dataKind: fallbackDataKind, hasData: true };
  if (connectionState === 'text') return { connected: true, dataKind: fallbackDataKind, hasData: true };
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
    : firstSourcePort?.kind === 'image' || (!firstSourcePort && fallbackDataKind === 'image') ? 'image' : 'text';
  const hasData = connectedEdges.some((edge) => {
    const sourceNode = nodesById.get(edge.sourceNodeId);
    if (!sourceNode) return false;
    const sourcePort = getNodePorts(sourceNode).find((port) => port.id === edge.sourcePortId);
    if (sourcePort?.kind === 'image') return Boolean(getNodeImageAssetId(sourceNode));
    return Boolean(getNodeTextResult(sourceNode, edge.sourcePortId));
  });

  return { connected, dataKind, hasData };
}

function getFallbackDataKind(kind: PortKind | string, portId?: string): PortDataKind {
  if (kind === 'image') return 'image';
  if (kind === 'reference' && portId === 'reference') return 'image';
  return 'text';
}

export function getPortTop(node: ProductionNode, side: 'input' | 'output', index: number) {
  if (node.type === 'referenceComposer' && side === 'input') return 304 + index * 38;
  if (node.type === 'generateImage' && side === 'input') return 610 + index * 39;
  if (node.type === 'generateImage' && side === 'output') return 127;
  if (node.type === 'sketch' && side === 'output') return getSketchOutputPortTop(node);
  if (node.type === 'imageToText' && side === 'input') return 74;
  if (node.type === 'imageToText' && side === 'output') return 402;
  if (node.type === 'cropImage' && (side === 'input' || side === 'output')) return getCropImagePortTop(node);
  if (node.type === 'adjustment' && (side === 'input' || side === 'output')) return getAdjustmentPortTop(node);
  if (node.type === 'curves' && (side === 'input' || side === 'output')) return getCurvesPortTop(node);
  if (node.type === 'frequencyRetouch' && (side === 'input' || side === 'output')) return getFrequencyRetouchPortTop(node);
  if (node.type === 'refineImage' && (side === 'input' || side === 'output')) return 126;
  if (node.type === 'removeBackground' && side === 'input') return 126;
  if (node.type === 'removeBackground' && side === 'output') return 126;
  if (node.type === 'exportImage' && side === 'input') return 126;
  if (node.type === 'preview' && side === 'input') return getPreviewPortTop(node);
  if (node.type === 'importImage' && side === 'output') return 132;
  return Math.max(52, 120 + index * 54);
}

function getSketchOutputPortTop(node: ProductionNode) {
  const data = node.data as SketchNodeData;
  const aspectRatio = typeof data.aspectRatio === 'string' ? data.aspectRatio : DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO;
  const [rawWidth, rawHeight] = aspectRatio.split(':').map(Number);
  const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getCropImagePortTop(node: ProductionNode) {
  const data = node.data as CropImageNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 27 + (innerWidth / ratio) / 2;
}

function getAdjustmentPortTop(node: ProductionNode) {
  const data = node.data as AdjustmentNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getCurvesPortTop(node: ProductionNode) {
  const data = node.data as CurvesNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getFrequencyRetouchPortTop(node: ProductionNode) {
  const data = node.data as FrequencyRetouchNodeData;
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}

function getPreviewPortTop(node: ProductionNode) {
  const data = node.data as PreviewNodeData & { sourceAspectRatio?: number };
  const ratio = typeof data.sourceAspectRatio === 'number' && data.sourceAspectRatio > 0 ? data.sourceAspectRatio : 1;
  const innerWidth = Math.max(120, node.size.width - 32);
  return 43 + (innerWidth / ratio) / 2;
}
