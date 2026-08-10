import { createId } from '@/shared/lib/id';
import { compactDynamicInputNodeState, isDynamicInputPort } from './dynamic-input-slot';
import { getTextPromptVariables } from './node-definitions';
import type { GraphEdge, ProductionNode, TextPromptNodeData } from './types';

interface ConnectEdgeParams {
  detachedEdge?: GraphEdge;
  occupiedSwapEdge?: GraphEdge;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export function connectEdgeState(nodes: ProductionNode[], edges: GraphEdge[], params: ConnectEdgeParams) {
  let nextEdges = edges.filter((edge) => edge.id !== params.detachedEdge?.id);
  const connectedEdge: GraphEdge = {
    id: params.detachedEdge?.id ?? createId('edge'),
    sourceNodeId: params.sourceNodeId,
    sourcePortId: params.sourcePortId,
    targetNodeId: params.targetNodeId,
    targetPortId: params.targetPortId,
  };
  if (params.occupiedSwapEdge && params.detachedEdge) {
    nextEdges = nextEdges.map((edge) => edge.id === params.occupiedSwapEdge?.id
      ? { ...edge, targetPortId: params.detachedEdge?.targetPortId ?? edge.targetPortId }
      : edge);
  }
  nextEdges = [...nextEdges, connectedEdge];

  const affectedNodeIds = getAffectedDynamicInputNodeIds(nodes, params);
  let nextState = { edges: nextEdges, nodes };
  for (const nodeId of affectedNodeIds) {
    nextState = compactDynamicInputNodeState(nextState.nodes, nextState.edges, nodeId);
  }
  return insertConnectedTextPromptMention(nextState, connectedEdge.id);
}

function getAffectedDynamicInputNodeIds(nodes: ProductionNode[], params: ConnectEdgeParams) {
  const nodeIds = new Set<string>([params.targetNodeId]);
  const targetNode = nodes.find((node) => node.id === params.targetNodeId);
  if (targetNode && isDynamicInputPort(targetNode.type, params.targetPortId)) nodeIds.add(targetNode.id);

  const detachedNodeId = params.detachedEdge?.targetNodeId;
  const detachedPortId = params.detachedEdge?.targetPortId;
  if (detachedNodeId && detachedPortId && detachedNodeId !== params.targetNodeId) {
    const detachedTarget = nodes.find((node) => node.id === detachedNodeId);
    if (detachedTarget && isDynamicInputPort(detachedTarget.type, detachedPortId)) nodeIds.add(detachedTarget.id);
  }
  return nodeIds;
}

function insertConnectedTextPromptMention(
  state: { edges: GraphEdge[]; nodes: ProductionNode[] },
  edgeId: string,
) {
  const edge = state.edges.find((item) => item.id === edgeId);
  if (!edge) return state;
  const target = state.nodes.find((node) => node.id === edge.targetNodeId);
  if (target?.type !== 'textPrompt') return state;
  const data = target.data as TextPromptNodeData;
  if (data.text.trim()) return state;
  const variable = getTextPromptVariables(target).find((item) => item.id === edge.targetPortId);
  if (!variable) return state;
  return {
    ...state,
    nodes: state.nodes.map((node) => node.id === target.id
      ? { ...node, data: { ...data, text: `@${variable.alias}` } } as ProductionNode
      : node),
  };
}
