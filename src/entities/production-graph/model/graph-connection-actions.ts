import { validateGenerateImageReferenceLimit } from './connection-rules';
import {
  canConnectPorts,
  getPortById,
} from './node-definitions';
import {
  compactDynamicInputNodeState,
} from './dynamic-input-slot';
import {
  INPUT_ALREADY_CONNECTED_REASON,
  PROMPT_VARIABLE_CONNECTED_REASON,
  isTextPromptVariablePortId,
  resolveTargetPortConnectionConflict,
} from './port-contract';
import { getConnectionErrorMessage } from './graph-store-errors';
import { withHistory } from './graph-history';
import {
  invalidateCompositionResult,
  isCompositionLayerIdentityReconnect,
  preserveCompositionLayerIdentityOnReconnect,
} from './composition-connection-state';
import { connectEdgeState } from './graph-connect-edge-state';
import { reorderTelegramMedia } from './telegram-media-order';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

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

        const nextState = reorderTelegramMedia(state.nodes, state.edges, nodeId, edgeIds, mediaOrder);

        return {
          ...withHistory(state),
          ...nextState,
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
