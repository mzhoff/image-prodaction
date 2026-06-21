import {
  getCompositionLayerPortId,
  getExportImageInputPortId,
  getTelegramMediaInputPortId,
  getTextConcatInputPortId,
} from './node-definitions';
import type { ProductionNode, GraphEdge } from './types';

export type DynamicInputSlotNodeType = 'textConcat' | 'telegramPublication' | 'exportImage' | 'composition';

export interface DynamicInputSlotSpec {
  nodeType: DynamicInputSlotNodeType;
  portPrefix: string;
  getPortId: (index: number) => string;
  minCount: number;
  maxCount?: number;
  countField: 'inputCount' | 'mediaInputCount' | 'imageInputCount' | 'layerInputCount';
  preservePortIds?: boolean;
}

const DYNAMIC_INPUT_SLOT_SPECS: ReadonlyArray<DynamicInputSlotSpec> = [
  {
    nodeType: 'textConcat',
    portPrefix: 'text-',
    getPortId: getTextConcatInputPortId,
    minCount: 2,
    countField: 'inputCount',
  },
  {
    nodeType: 'telegramPublication',
    portPrefix: 'media-',
    getPortId: getTelegramMediaInputPortId,
    minCount: 1,
    maxCount: 10,
    countField: 'mediaInputCount',
    preservePortIds: true,
  },
  {
    nodeType: 'exportImage',
    portPrefix: 'image-',
    getPortId: getExportImageInputPortId,
    minCount: 1,
    maxCount: 10,
    countField: 'imageInputCount',
  },
  {
    nodeType: 'composition',
    portPrefix: 'layer-',
    getPortId: getCompositionLayerPortId,
    minCount: 2,
    maxCount: 12,
    countField: 'layerInputCount',
    preservePortIds: true,
  },
];

const PORT_PREFIX_BY_NODE_TYPE = new Map<DynamicInputSlotNodeType, DynamicInputSlotSpec>(
  DYNAMIC_INPUT_SLOT_SPECS.map((spec) => [spec.nodeType, spec]),
);

function getPortIndexFromPrefix(portId: string, prefix: string) {
  if (!portId.startsWith(prefix)) return -1;
  const rawIndex = Number(portId.slice(prefix.length));
  return Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : -1;
}

export function getDynamicInputSlotSpec(nodeType: string) {
  if (nodeType !== 'textConcat' && nodeType !== 'telegramPublication' && nodeType !== 'exportImage' && nodeType !== 'composition') return undefined;
  return PORT_PREFIX_BY_NODE_TYPE.get(nodeType);
}

export function getDynamicInputPortIndex(nodeType: string, portId: string) {
  const spec = getDynamicInputSlotSpec(nodeType);
  return spec ? getPortIndexFromPrefix(portId, spec.portPrefix) : -1;
}

export function isDynamicInputPort(nodeType: string, portId: string) {
  return getDynamicInputPortIndex(nodeType, portId) >= 0;
}

export function getOccupiedDynamicSlotEdge(edges: GraphEdge[], target: ProductionNode | undefined, portId: string) {
  if (!target) return undefined;
  return isDynamicInputPort(target.type, portId)
    ? edges.find((edge) => edge.targetNodeId === target.id && edge.targetPortId === portId)
    : undefined;
}

export function compactDynamicInputSlotEdges(edges: GraphEdge[], nodeId: string, nodeType: string) {
  const spec = getDynamicInputSlotSpec(nodeType);
  if (!spec) return edges;
  if (spec.preservePortIds) return edges;

  const incoming = edges
    .filter((edge) => edge.targetNodeId === nodeId && getPortIndexFromPrefix(edge.targetPortId, spec.portPrefix) >= 0)
    .sort((first, second) => (
      getPortIndexFromPrefix(first.targetPortId, spec.portPrefix)
      - getPortIndexFromPrefix(second.targetPortId, spec.portPrefix)
    ));

  const nextPortByEdgeId = new Map(incoming.map((edge, index) => [edge.id, spec.getPortId(index)]));

  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
}

function calculateDynamicInputCount(
  spec: DynamicInputSlotSpec,
  connectedPortIndices: number[],
  usedCount: number,
  storedInputCount: number,
) {
  const maxPortIndex = connectedPortIndices.length > 0
    ? Math.max(...connectedPortIndices)
    : -1;
  const normalizedStoredCount = Math.max(
    spec.minCount,
    Number.isFinite(storedInputCount) ? Math.floor(storedInputCount) : spec.minCount,
  );

  if (spec.preservePortIds) {
    if (usedCount === 0) {
      return Math.min(spec.maxCount ?? Number.POSITIVE_INFINITY, Math.max(spec.minCount, normalizedStoredCount));
    }
    const neededForUsed = maxPortIndex + 2;
    return Math.min(
      spec.maxCount ?? Number.POSITIVE_INFINITY,
      Math.max(spec.minCount, normalizedStoredCount, neededForUsed),
    );
  }

  const withGap = usedCount + 1;
  if (spec.maxCount === undefined) return Math.max(spec.minCount, withGap);
  return Math.min(spec.maxCount, Math.max(spec.minCount, withGap));
}

export function updateDynamicInputCount(node: ProductionNode, edges: GraphEdge[]): ProductionNode {
  const spec = getDynamicInputSlotSpec(node.type);
  if (!spec) return node;

  const incoming = edges.filter((edge) => edge.targetNodeId === node.id && getPortIndexFromPrefix(edge.targetPortId, spec.portPrefix) >= 0);
  const connectedPortIndices = incoming.map((edge) => getPortIndexFromPrefix(edge.targetPortId, spec.portPrefix));
  const usedCount = incoming.length;
  const inputCount = calculateDynamicInputCount(
    spec,
    connectedPortIndices,
    usedCount,
    Number((node.data as unknown as Record<string, unknown>)?.[spec.countField]),
  );

  const data = node.data as unknown as Record<string, unknown>;
  if (Number(data[spec.countField]) === inputCount) return node;

  return {
    ...node,
    data: {
      ...node.data,
      [spec.countField]: inputCount,
    },
  };
}

export function compactDynamicInputNodeState(nodes: ProductionNode[], edges: GraphEdge[], nodeId: string) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return { edges, nodes };
  const spec = getDynamicInputSlotSpec(node.type);
  if (!spec) return { edges, nodes };
  const compactedEdges = compactDynamicInputSlotEdges(edges, nodeId, node.type);
  return {
    edges: compactedEdges,
    nodes: nodes.map((item) => (item.id === node.id ? updateDynamicInputCount(item, compactedEdges) : item)),
  };
}

export function compactDynamicInputsForNodes(nodes: ProductionNode[], edges: GraphEdge[]) {
  let normalizedEdges = edges;
  let normalizedNodes = nodes;

  for (const node of nodes) {
    const spec = getDynamicInputSlotSpec(node.type);
    if (!spec) continue;
    normalizedEdges = compactDynamicInputSlotEdges(normalizedEdges, node.id, node.type);
    normalizedNodes = normalizedNodes.map((item) => (item.id === node.id ? updateDynamicInputCount(item, normalizedEdges) : item));
  }

  return { edges: normalizedEdges, nodes: normalizedNodes };
}
