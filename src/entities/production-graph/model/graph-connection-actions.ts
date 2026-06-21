import { createId } from '@/shared/lib/id';
import { validateGenerateImageReferenceLimit } from './connection-rules';
import {
  canConnectPorts,
  getPortById,
} from './node-definitions';
import {
  compactDynamicInputNodeState,
  getDynamicInputPortIndex,
  isDynamicInputPort,
  updateDynamicInputCount,
} from './dynamic-input-slot';
import {
  INPUT_ALREADY_CONNECTED_REASON,
  PROMPT_VARIABLE_CONNECTED_REASON,
  isTextPromptVariablePortId,
  resolveTargetPortConnectionConflict,
} from './port-contract';
import { getConnectionErrorMessage } from './graph-store-errors';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { CompositionNodeData, GraphEdge, ProductionNode, ProductionNodeData } from './types';

export function createGraphConnectionActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'compactDynamicInputSlots' | 'compactTextConcatInputs' | 'connect' | 'deleteEdge' | 'reorderTelegramMediaInputs'
> {
  return {
    compactDynamicInputSlots: (nodeId) => {
      set((state) => {
        const nextState = compactDynamicInputNodeState(state.nodes, state.edges, nodeId);
        if (nextState.edges === state.edges && nextState.nodes === state.nodes) return state;
        return {
          ...withHistory(state),
          ...nextState,
        };
      });
    },
    compactTextConcatInputs: (nodeId) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (node?.type !== 'textConcat') return state;

        const nextState = compactDynamicInputNodeState(state.nodes, state.edges, nodeId);
        return {
          ...withHistory(state),
          ...nextState,
        };
      });
    },
    reorderTelegramMediaInputs: (nodeId, edgeIds, mediaOrder) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (node?.type !== 'telegramPublication') return state;

        const mediaEdges = state.edges
          .filter((edge) => edge.targetNodeId === nodeId && getDynamicInputPortIndex('telegramPublication', edge.targetPortId) >= 0)
          .sort((first, second) => getDynamicInputPortIndex('telegramPublication', first.targetPortId)
            - getDynamicInputPortIndex('telegramPublication', second.targetPortId));
        const mediaEdgeById = new Map(mediaEdges.map((edge) => [edge.id, edge]));
        const orderedEdgeIds = uniqueEdgeIds(edgeIds).filter((edgeId) => mediaEdgeById.has(edgeId));
        const orderedEdgeIdSet = new Set(orderedEdgeIds);
        const reorderedEdges = [
          ...orderedEdgeIds.flatMap((edgeId) => {
            const edge = mediaEdgeById.get(edgeId);
            return edge ? [edge] : [];
          }),
          ...mediaEdges.filter((edge) => !orderedEdgeIdSet.has(edge.id)),
        ];
        const nextPortByEdgeId = new Map(reorderedEdges.map((edge, index) => [edge.id, getMediaInputPortId(index)]));
        const nextEdges = state.edges.map((edge) => (
          nextPortByEdgeId.has(edge.id)
            ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
            : edge
        ));
        const nextNodes = nextStateNodesWithMediaOrder(
          state.nodes,
          nodeId,
          {
            ...node,
            data: {
              ...node.data,
              mediaOrder,
            },
          },
          nextEdges,
        );

        return {
          ...withHistory(state),
          edges: nextEdges,
          nodes: nextNodes,
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

      const targetPortConflict = resolveTargetPortConnectionConflict({
        edges,
        targetNode: target,
        targetPortId,
        detachedEdge: options?.detachedEdge,
      });
      if (targetPortConflict.isBlocked) {
        return {
          ok: false,
          reason: targetPortConflict.reason
            ?? (isTextPromptVariablePortId(targetPortId)
              ? PROMPT_VARIABLE_CONNECTED_REASON
              : INPUT_ALREADY_CONNECTED_REASON),
        };
      }

      const occupiedSwapEdge = targetPortConflict.isSwapAllowed
        ? targetPortConflict.blockedEdge
        : undefined;

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

      set((state) => {
        const nextState = connectEdgeState(state.nodes, state.edges, {
          detachedEdge: options?.detachedEdge,
          occupiedSwapEdge,
          sourceNodeId,
          sourcePortId,
          targetNodeId,
          targetPortId,
        });
        const nextNodes = preserveCompositionLayerIdentityOnReconnect(nextState.nodes, {
          fromPortId: options?.detachedEdge?.targetPortId,
          nodeId: targetNodeId,
          toPortId: targetPortId,
        });
        const keepCompositionResult = isCompositionLayerIdentityReconnect(state.nodes, {
          fromNodeId: options?.detachedEdge?.targetNodeId,
          fromPortId: options?.detachedEdge?.targetPortId,
          nodeId: targetNodeId,
          toPortId: targetPortId,
        });
        return {
          ...withHistory(state),
          edges: nextState.edges,
          nodes: keepCompositionResult ? nextNodes : invalidateCompositionResult(nextNodes, targetNodeId),
        };
      });
      return { ok: true };
    },
    deleteEdge: (edgeId, options) => {
      set((state) => {
        const edge = state.edges.find((item) => item.id === edgeId);
        if (!edge) return state;
        const preserveDynamicInputSlots = Boolean(options?.preserveDynamicInputSlots || options?.preserveTextConcatSlots);
        const removedEdges = state.edges.filter((item) => item.id !== edgeId);

        if (preserveDynamicInputSlots) {
          return {
            ...withHistory(state),
            edges: removedEdges,
            nodes: invalidateCompositionResult(state.nodes, edge.targetNodeId, {
              clearLayerContent: !options?.preserveCompositionLayerContent,
              targetPortId: edge.targetPortId,
            }),
          };
        }

        const nextState = compactDynamicInputNodeState(state.nodes, removedEdges, edge.targetNodeId);
        return {
          ...withHistory(state),
          edges: nextState.edges,
          nodes: invalidateCompositionResult(nextState.nodes, edge.targetNodeId, {
            clearLayerContent: !options?.preserveCompositionLayerContent,
            targetPortId: edge.targetPortId,
          }),
        };
      });
    },
  };
}

function invalidateCompositionResult(
  nodes: ProductionNode[],
  nodeId: string,
  options: { clearLayerContent?: boolean; targetPortId?: string } = {},
) {
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'composition') return node;
    const data = node.data as CompositionNodeData;
    const layers = options.clearLayerContent && options.targetPortId
      ? data.layers?.map((layer) => (
        layer.id === options.targetPortId
          ? {
            ...layer,
            assetId: undefined,
            text: undefined,
          }
          : layer
      ))
      : data.layers;
    return {
      ...node,
      data: {
        ...data,
        layers,
        resultAssetId: undefined,
        resultSignature: undefined,
      } as ProductionNodeData,
    };
  });
}

function preserveCompositionLayerIdentityOnReconnect(
  nodes: ProductionNode[],
  params: { fromPortId?: string; nodeId: string; toPortId: string },
) {
  if (!params.fromPortId || params.fromPortId === params.toPortId) return nodes;
  return nodes.map((node) => {
    if (node.id !== params.nodeId || node.type !== 'composition') return node;
    const data = node.data as CompositionNodeData;
    const swapLayerId = (layerId: string) => {
      if (layerId === params.fromPortId) return params.toPortId;
      if (layerId === params.toPortId) return params.fromPortId;
      return layerId;
    };
    return {
      ...node,
      data: {
        ...data,
        groups: data.groups?.map((group) => ({
          ...group,
          itemIds: group.itemIds?.map(swapLayerId),
          layerIds: group.layerIds.map(swapLayerId),
        })),
        layerOrder: data.layerOrder?.map(swapLayerId),
        layers: data.layers?.map((layer) => ({
          ...layer,
          id: swapLayerId(layer.id),
        })),
        selectedLayerId: data.selectedLayerId ? swapLayerId(data.selectedLayerId) : undefined,
        selectedLayerIds: data.selectedLayerIds?.map(swapLayerId),
      } as ProductionNodeData,
    };
  });
}

function isCompositionLayerIdentityReconnect(
  nodes: ProductionNode[],
  params: { fromNodeId?: string; fromPortId?: string; nodeId: string; toPortId: string },
) {
  if (!params.fromPortId || params.fromPortId === params.toPortId || params.fromNodeId !== params.nodeId) return false;
  return nodes.some((node) => node.id === params.nodeId && node.type === 'composition');
}

function nextStateNodesWithMediaOrder(
  nodes: ProductionNode[],
  nodeId: string,
  nodeWithMediaOrder: ProductionNode,
  nextEdges: GraphEdge[],
) {
  return nodes.map((item) => {
    if (item.id !== nodeId) return item;
    return updateDynamicInputCount(nodeWithMediaOrder, nextEdges);
  });
}

function uniqueEdgeIds(edgeIds: string[]) {
  const seen = new Set<string>();
  return edgeIds.filter((edgeId) => {
    if (!edgeId || seen.has(edgeId)) return false;
    seen.add(edgeId);
    return true;
  });
}

function getMediaInputPortId(index: number) {
  return `media-${index}`;
}

function connectEdgeState(
  nodes: ProductionNode[],
  edges: GraphEdge[],
  params: {
    detachedEdge?: GraphEdge;
    occupiedSwapEdge?: GraphEdge;
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

  if (params.occupiedSwapEdge && params.detachedEdge) {
    nextEdges = nextEdges.map((edge) => (
      edge.id === params.occupiedSwapEdge?.id
        ? {
          ...edge,
          targetPortId: params.detachedEdge?.targetPortId ?? edge.targetPortId,
        }
        : edge
    ));
  }

  nextEdges = [...nextEdges, connectedEdge];

  const affectedNodeIds = new Set<string>([params.targetNodeId]);
  const targetNode = nodes.find((node) => node.id === params.targetNodeId);
  if (targetNode && isDynamicInputPort(targetNode.type, params.targetPortId)) {
    affectedNodeIds.add(targetNode.id);
  }
  const detachedTargetNodeId = params.detachedEdge?.targetNodeId;
  const detachedTargetPortId = params.detachedEdge?.targetPortId;
  if (detachedTargetNodeId && detachedTargetPortId && detachedTargetNodeId !== params.targetNodeId) {
    const detachedTarget = nodes.find((node) => node.id === detachedTargetNodeId);
    if (detachedTarget && isDynamicInputPort(detachedTarget.type, detachedTargetPortId)) {
      affectedNodeIds.add(detachedTarget.id);
    }
  }

  let nextState = {
    edges: nextEdges,
    nodes,
  };
  for (const nodeId of affectedNodeIds) {
    nextState = compactDynamicInputNodeState(nextState.nodes, nextState.edges, nodeId);
  }

  return { edges: nextState.edges, nodes: nextState.nodes };
}
