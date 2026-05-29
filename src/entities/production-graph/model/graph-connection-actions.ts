import { createId } from '@/shared/lib/id';
import { validateGenerateImageReferenceLimit } from './connection-rules';
import { canConnectPorts, getPortById } from './node-definitions';
import { getConnectionErrorMessage } from './graph-store-errors';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

export function createGraphConnectionActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'connect' | 'deleteEdge'
> {
  return {
    connect: (sourceNodeId, sourcePortId, targetNodeId, targetPortId) => {
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
        edges: [...state.edges, { id: createId('edge'), sourceNodeId, sourcePortId, targetNodeId, targetPortId }],
      }));
      return { ok: true };
    },
    deleteEdge: (edgeId) => {
      set((state) => {
        if (!state.edges.some((edge) => edge.id === edgeId)) return state;
        return { ...withHistory(state), edges: state.edges.filter((edge) => edge.id !== edgeId) };
      });
    },
  };
}
