import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import { getPortTop } from '@/features/graph-node/ui/port-button';

const PORT_CENTER_OFFSET = 19.5;
const GENERATE_COMPOSING_GROUP_TOP = 580;
const generateInputPortIds = new Set<string>(productionLayers.map((layer) => layer.id));

export type PortPointLookup = Record<string, { x: number; y: number }>;

export function getPortPointKey(nodeId: string, portId: string) {
  return `${nodeId}:${portId}`;
}

export function getNodeBounds(nodes: ProductionNode[]) {
  if (nodes.length === 0) return { minX: -400, minY: -300, maxX: 900, maxY: 600 };

  return {
    minX: Math.min(...nodes.map((node) => node.position.x)),
    minY: Math.min(...nodes.map((node) => node.position.y)),
    maxX: Math.max(...nodes.map((node) => node.position.x + node.size.width)),
    maxY: Math.max(...nodes.map((node) => node.position.y + node.size.height)),
  };
}

export function getPortPoint(node: ProductionNode, portId: string, measuredPortPoints?: PortPointLookup) {
  const measured = measuredPortPoints?.[getPortPointKey(node.id, portId)];
  if (measured) return measured;

  const ports = getNodePorts(node);
  const port = ports.find((item) => item.id === portId);
  if (!port) return null;

  const sidePorts = ports.filter((item) => item.side === port.side);
  const index = sidePorts.findIndex((item) => item.id === portId);
  const y = node.position.y + getPortTop(node, port.side, Math.max(0, index)) + 4.5;
  const x = port.side === 'input'
    ? node.position.x - PORT_CENTER_OFFSET
    : node.position.x + node.size.width + PORT_CENTER_OFFSET;

  return { x, y };
}

export function getGenerateComposingGroupPoint(node: ProductionNode, measuredPortPoints?: PortPointLookup) {
  const measured = measuredPortPoints?.[getPortPointKey(node.id, 'composing')];
  if (measured) return measured;

  return {
    x: node.position.x - PORT_CENTER_OFFSET,
    y: node.position.y + GENERATE_COMPOSING_GROUP_TOP + 4.5,
  };
}

export function getEdgePath(
  edge: GraphEdge,
  nodesById: Map<string, ProductionNode>,
  options?: {
    collapsedGenerateComposingNodeIds?: Set<string>;
    measuredPortPoints?: PortPointLookup;
  },
) {
  const source = nodesById.get(edge.sourceNodeId);
  const target = nodesById.get(edge.targetNodeId);
  if (!source || !target) return null;

  const start = getPortPoint(source, edge.sourcePortId, options?.measuredPortPoints);
  const end = shouldUseCollapsedGenerateGroup(edge, target, options?.collapsedGenerateComposingNodeIds)
    ? getGenerateComposingGroupPoint(target, options?.measuredPortPoints)
    : getPortPoint(target, edge.targetPortId, options?.measuredPortPoints);
  if (!start || !end) return null;

  return getBezierPath(start, end);
}

function shouldUseCollapsedGenerateGroup(edge: GraphEdge, target: ProductionNode, collapsedNodeIds?: Set<string>) {
  return target.type === 'generateImage'
    && Boolean(collapsedNodeIds?.has(target.id))
    && generateInputPortIds.has(edge.targetPortId);
}

export function getBezierPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const distance = Math.max(120, Math.abs(end.x - start.x) * 0.45);
  const c1x = start.x + distance;
  const c2x = end.x - distance;

  return `M ${start.x} ${start.y} C ${c1x} ${start.y} ${c2x} ${end.y} ${end.x} ${end.y}`;
}
