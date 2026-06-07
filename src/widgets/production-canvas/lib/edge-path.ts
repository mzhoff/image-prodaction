import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { getPortTop } from '@/entities/production-graph/model/node-port-layout';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { GraphEdge, GraphSection, ProductionNode } from '@/entities/production-graph/model/types';
import { getBezierPath } from './edge-bezier-path';

const PORT_CENTER_OFFSET = 13.5;
const PORT_DOT_RADIUS = 6;
const PORT_CONTAINER_HALF = 12;
const GENERATE_REFERENCE_GROUP_TOP = 580;
const generateInputPortIds = new Set<string>(['reference', ...productionLayers.map((layer) => layer.id)]);

export { getBezierPath };

export type PortPointLookup = Record<string, { x: number; y: number }>;

export function getPortPointKey(nodeId: string, portId: string, side: 'input' | 'output') {
  return `${nodeId}:${side}:${portId}`;
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

export function getGraphBounds(nodes: ProductionNode[], sections: GraphSection[]) {
  if (nodes.length === 0 && sections.length === 0) return { minX: -400, minY: -300, maxX: 900, maxY: 600 };

  const nodeBounds = nodes.map((node) => ({
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + node.size.width,
    maxY: node.position.y + node.size.height,
  }));
  const sectionBounds = sections.map((section) => ({
    minX: section.position.x,
    minY: section.position.y - 34,
    maxX: section.position.x + section.size.width,
    maxY: section.position.y + section.size.height,
  }));
  const bounds = [...nodeBounds, ...sectionBounds];

  return {
    minX: Math.min(...bounds.map((item) => item.minX)),
    minY: Math.min(...bounds.map((item) => item.minY)),
    maxX: Math.max(...bounds.map((item) => item.maxX)),
    maxY: Math.max(...bounds.map((item) => item.maxY)),
  };
}

export function getPortPoint(node: ProductionNode, portId: string, measuredPortPoints?: PortPointLookup) {
  const ports = getNodePorts(node);
  const port = ports.find((item) => item.id === portId);
  if (!port) return null;

  const measured = getMeasuredPortPoint(node, portId, port.side, measuredPortPoints);
  if (measured) return getPortEdgePoint(measured, port.side);

  const sidePorts = ports.filter((item) => item.side === port.side);
  const index = sidePorts.findIndex((item) => item.id === portId);
  const y = node.position.y + getPortTop(node, port.side, Math.max(0, index)) + PORT_CONTAINER_HALF;
  const x = port.side === 'input'
    ? node.position.x - PORT_CENTER_OFFSET
    : node.position.x + node.size.width + PORT_CENTER_OFFSET;

  return getPortEdgePoint({ x, y }, port.side);
}

export function getGenerateComposingGroupPoint(node: ProductionNode, measuredPortPoints?: PortPointLookup) {
  const measured = getMeasuredPortPoint(node, 'reference', 'input', measuredPortPoints);
  if (measured) return getPortEdgePoint(measured, 'input');

  return getPortEdgePoint({
    x: node.position.x - PORT_CENTER_OFFSET,
    y: node.position.y + GENERATE_REFERENCE_GROUP_TOP + PORT_CONTAINER_HALF,
  }, 'input');
}

function getMeasuredPortPoint(
  node: ProductionNode,
  portId: string,
  side: 'input' | 'output',
  measuredPortPoints?: PortPointLookup,
) {
  const localPoint = measuredPortPoints?.[getPortPointKey(node.id, portId, side)];
  if (!localPoint) return null;
  return {
    x: node.position.x + localPoint.x,
    y: node.position.y + localPoint.y,
  };
}

function getPortEdgePoint(point: { x: number; y: number }, side: 'input' | 'output') {
  return {
    x: point.x + (side === 'output' ? PORT_DOT_RADIUS : -PORT_DOT_RADIUS),
    y: point.y,
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

  const start = getPortPoint(source, normalizeSourcePortId(source, edge.sourcePortId), options?.measuredPortPoints);
  const end = shouldUseCollapsedGenerateGroup(edge, target, options?.collapsedGenerateComposingNodeIds)
    ? getGenerateComposingGroupPoint(target, options?.measuredPortPoints)
    : getPortPoint(target, edge.targetPortId, options?.measuredPortPoints);
  if (!start || !end) return null;

  return getBezierPath(start, end);
}

function normalizeSourcePortId(source: ProductionNode, portId: string) {
  if ((source.type === 'cropImage' || source.type === 'curves' || source.type === 'frequencyRetouch' || source.type === 'removeBackground') && portId === 'image') return 'result';
  return portId;
}

function shouldUseCollapsedGenerateGroup(edge: GraphEdge, target: ProductionNode, collapsedNodeIds?: Set<string>) {
  return target.type === 'generateImage'
    && Boolean(collapsedNodeIds?.has(target.id))
    && generateInputPortIds.has(edge.targetPortId);
}
