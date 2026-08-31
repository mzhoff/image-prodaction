import { canConnectPorts, getNodePorts } from './node-definitions';
import {
  getPipelineFieldPortId,
  normalizePipelineContractFields,
  normalizePipelineSemanticContractSnapshot,
} from './pipeline-contract-fields';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';
import type {
  PipelineContractField,
  PipelineInputNodeData,
  PipelineOutputNodeData,
  ProductionNode,
} from './types';

export function createGraphPipelineContractActions(set: StoreSet): Pick<
  ProductionGraphState,
  'applyPipelineSemanticContractPreset' | 'updatePipelineContractFields'
> {
  return {
    applyPipelineSemanticContractPreset: (nodeId, fields, semanticContract) => {
      let result: ReturnType<ProductionGraphState['applyPipelineSemanticContractPreset']> = {
        ok: false,
        reason: 'Contract node was not found.',
      };
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || (node.type !== 'pipelineInput' && node.type !== 'pipelineOutput')) return {};
        const normalizedContract = normalizePipelineSemanticContractSnapshot(semanticContract);
        if (!normalizedContract) {
          result = { ok: false, reason: 'Semantic contract preset is invalid.' };
          return {};
        }

        const currentFields = (node.data as PipelineInputNodeData | PipelineOutputNodeData).fields;
        const normalizedFields = normalizePipelineContractFields(fields);
        const currentBySignature = new Map(
          currentFields.map((field) => [`${field.key}\u0000${field.kind}`, field]),
        );
        const nextFields = normalizedFields.map((field) => {
          const current = currentBySignature.get(`${field.key}\u0000${field.kind}`);
          return current ? { ...field, id: current.id } : field;
        });
        const retainedFieldIds = new Set(nextFields.map((field) => field.id));
        const connectedPortIds = new Set(state.edges.flatMap((edge) => {
          const ids: string[] = [];
          if (edge.sourceNodeId === nodeId) ids.push(edge.sourcePortId);
          if (edge.targetNodeId === nodeId) ids.push(edge.targetPortId);
          return ids;
        }));
        const disconnectedByPreset = currentFields.some((field) => (
          connectedPortIds.has(getPipelineFieldPortId(field.id))
          && !retainedFieldIds.has(field.id)
        ));
        if (disconnectedByPreset) {
          result = {
            ok: false,
            reason: 'Disconnect fields that are not present with the same key and type in the preset.',
          };
          return {};
        }

        const nextNode = {
          ...node,
          data: {
            ...node.data,
            fields: nextFields,
            semanticContract: normalizedContract,
          },
        } as ProductionNode;
        const nextNodes = state.nodes.map((item) => item.id === nodeId ? nextNode : item);
        if (findIncompatibleEdge(state.edges, nextNodes, nodeId)) {
          result = {
            ok: false,
            reason: 'Disconnect the field before applying an incompatible preset.',
          };
          return {};
        }

        result = { ok: true };
        return { ...withHistory(state), nodes: nextNodes };
      });
      return result;
    },
    updatePipelineContractFields: (nodeId, fields) => {
      let result: ReturnType<ProductionGraphState['updatePipelineContractFields']> = {
        ok: false,
        reason: 'Contract node was not found.',
      };
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || !isPipelineContractNode(node)) return {};

        const nextFields = normalizePipelineContractFields(fields);
        const nextNode = {
          ...node,
          data: {
            ...node.data,
            fields: nextFields,
            ...(node.type === 'pipelineInput' || node.type === 'pipelineOutput'
              ? { semanticContract: undefined }
              : {}),
          },
        } as ProductionNode;
        const previousPortIds = new Set(getNodePorts(node).map((port) => port.id));
        const nextPortIds = new Set(getNodePorts(nextNode).map((port) => port.id));
        const removedPortIds = new Set(
          [...previousPortIds].filter((portId) => !nextPortIds.has(portId)),
        );
        const nextEdges = state.edges.filter((edge) => !(
          (edge.sourceNodeId === nodeId && removedPortIds.has(edge.sourcePortId))
          || (edge.targetNodeId === nodeId && removedPortIds.has(edge.targetPortId))
        ));
        const nextNodes = state.nodes.map((item) => item.id === nodeId ? nextNode : item);
        if (findIncompatibleEdge(nextEdges, nextNodes, nodeId)) {
          result = {
            ok: false,
            reason: 'Disconnect the field before changing it to an incompatible type.',
          };
          return {};
        }

        result = { ok: true };
        return {
          ...withHistory(state),
          edges: nextEdges,
          nodes: nextNodes,
        };
      });
      return result;
    },
  };
}

function findIncompatibleEdge(
  edges: ProductionGraphState['edges'],
  nodes: ProductionNode[],
  nodeId: string,
) {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  return edges.find((edge) => {
    if (edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId) return false;
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);
    return !source || !target
      || !canConnectPorts(source, edge.sourcePortId, target, edge.targetPortId);
  });
}

function isPipelineContractNode(node: ProductionNode): node is ProductionNode & {
  data: ProductionNode['data'] & { fields: PipelineContractField[] };
} {
  return node.type === 'pipelineInput'
    || node.type === 'pipelineOutput'
    || node.type === 'structuredOutput';
}
