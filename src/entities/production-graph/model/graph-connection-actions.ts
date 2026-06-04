import { createId } from '@/shared/lib/id';
import { validateGenerateImageReferenceLimit } from './connection-rules';
import {
  TEXT_CONCAT_MIN_INPUTS,
  canConnectPorts,
  getPortById,
  getTextConcatInputPortId,
  getTextConcatInputPortIndex,
} from './node-definitions';
import { getConnectionErrorMessage } from './graph-store-errors';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { GraphEdge, ProductionNode, ProductionNodeData, TextConcatNodeData } from './types';

export function createGraphConnectionActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'compactTextConcatInputs' | 'connect' | 'deleteEdge'
> {
  return {
    compactTextConcatInputs: (nodeId) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (node?.type !== 'textConcat') return state;
        const nextEdges = compactTextConcatEdges(state.edges, nodeId);
        return {
          ...withHistory(state),
          edges: nextEdges,
          nodes: updateTextConcatInputCount(state.nodes, nodeId, nextEdges),
        };
      });
    },
    connect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId, options) => {
      const { nodes, edges } = get();
      const source = nodes.find((node) => node.id === sourceNodeId);
      const target = nodes.find((node) => node.id === targetNodeId);
      const sourcePort = source ? getPortById(source, sourcePortId) : undefined;
      const targetPort = target ? getPortById(target, targetPortId) : undefined;
      if (!source || !target || !canConnectPorts(source, sourcePortId, target, targetPortId)) {
        return { ok: false, reason: getConnectionErrorMessage(sourcePort?.kind, targetPort?.kind) };
      }

      const duplicate = edges.some((edge) => (
        edge.sourceNodeId === sourceNodeId
        && edge.sourcePortId === sourcePortId
        && edge.targetNodeId === targetNodeId
        && edge.targetPortId === targetPortId
      ));
      if (duplicate) return { ok: true };

      const occupiedTextConcatEdge = getTextConcatSlotEdge(edges, target, targetPortId);
      const isTextConcatSwap = Boolean(
        occupiedTextConcatEdge
        && options?.detachedEdge
        && options.detachedEdge.targetNodeId === targetNodeId
        && getTextConcatInputPortIndex(options.detachedEdge.targetPortId) >= 0,
      );
      if (occupiedTextConcatEdge && !isTextConcatSwap) {
        return { ok: false, reason: 'This Concatenate input is already connected.' };
      }

      const limitError = validateGenerateImageReferenceLimit({
        edges,
        nodes,
        sourceNodeId,
        sourcePortId,
        target,
        targetNodeId,
        targetPortId,
      });
      if (limitError) return limitError;

      set((state) => ({
        ...withHistory(state),
        ...connectEdgeState(state.nodes, state.edges, {
          detachedEdge: options?.detachedEdge,
          occupiedTextConcatEdge,
          sourceNodeId,
          sourcePortId,
          targetNodeId,
          targetPortId,
        }),
      }));
      return { ok: true };
    },
    deleteEdge: (edgeId, options) => {
      set((state) => {
        const edge = state.edges.find((item) => item.id === edgeId);
        if (!edge) return state;
        const target = state.nodes.find((node) => node.id === edge.targetNodeId);
        const shouldCompactTextConcat = target?.type === 'textConcat' && !options?.preserveTextConcatSlots;
        const removedEdges = state.edges.filter((item) => item.id !== edgeId);
        const nextEdges = shouldCompactTextConcat ? compactTextConcatEdges(removedEdges, edge.targetNodeId) : removedEdges;
        return {
          ...withHistory(state),
          edges: nextEdges,
          nodes: shouldCompactTextConcat ? updateTextConcatInputCount(state.nodes, edge.targetNodeId, nextEdges) : state.nodes,
        };
      });
    },
  };
}

function connectEdgeState(
  nodes: ProductionNode[],
  edges: GraphEdge[],
  params: {
    detachedEdge?: GraphEdge;
    occupiedTextConcatEdge?: GraphEdge;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  },
) {
  let nextEdges = edges.filter((edge) => edge.id !== params.detachedEdge?.id);
  const connectedEdge: GraphEdge = {
    id: params.detachedEdge?.id ?? createId('edge'),
    sourceNodeId: params.sourceNodeId,
    sourcePortId: params.sourcePortId,
    targetNodeId: params.targetNodeId,
    targetPortId: params.targetPortId,
  };

  if (params.occupiedTextConcatEdge && params.detachedEdge) {
    nextEdges = nextEdges.map((edge) => (
      edge.id === params.occupiedTextConcatEdge?.id
        ? { ...edge, targetPortId: params.detachedEdge?.targetPortId ?? edge.targetPortId }
        : edge
    ));
  }

  nextEdges = [...nextEdges, connectedEdge];
  const affectedTextConcatIds = new Set<string>();
  const targetNode = nodes.find((node) => node.id === params.targetNodeId);
  if (targetNode?.type === 'textConcat') {
    nextEdges = compactTextConcatEdges(nextEdges, targetNode.id);
    affectedTextConcatIds.add(targetNode.id);
  }
  if (params.detachedEdge?.targetNodeId && params.detachedEdge.targetNodeId !== params.targetNodeId) {
    const detachedTarget = nodes.find((node) => node.id === params.detachedEdge?.targetNodeId);
    if (detachedTarget?.type === 'textConcat') {
      nextEdges = compactTextConcatEdges(nextEdges, detachedTarget.id);
      affectedTextConcatIds.add(detachedTarget.id);
    }
  }

  let nextNodes = nodes;
  affectedTextConcatIds.forEach((nodeId) => {
    nextNodes = updateTextConcatInputCount(nextNodes, nodeId, nextEdges);
  });

  return { edges: nextEdges, nodes: nextNodes };
}

function getTextConcatSlotEdge(edges: GraphEdge[], target: ProductionNode | undefined, targetPortId: string) {
  if (target?.type !== 'textConcat' || getTextConcatInputPortIndex(targetPortId) < 0) return undefined;
  return edges.find((edge) => edge.targetNodeId === target.id && edge.targetPortId === targetPortId);
}

function compactTextConcatEdges(edges: GraphEdge[], nodeId: string) {
  const inputEdges = edges
    .filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0)
    .sort((first, second) => getTextConcatInputPortIndex(first.targetPortId) - getTextConcatInputPortIndex(second.targetPortId));
  const nextPortByEdgeId = new Map(inputEdges.map((edge, index) => [edge.id, getTextConcatInputPortId(index)]));
  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
}

function updateTextConcatInputCount(nodes: ProductionNode[], nodeId: string, edges: GraphEdge[]) {
  const usedCount = edges.filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0).length;
  const inputCount = Math.max(TEXT_CONCAT_MIN_INPUTS, usedCount + 1);
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'textConcat') return node;
    const data = node.data as TextConcatNodeData;
    if (data.inputCount === inputCount) return node;
    return { ...node, data: { ...node.data, inputCount } as ProductionNodeData };
  });
}
