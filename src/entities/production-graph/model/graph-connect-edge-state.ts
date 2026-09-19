import { removeGeneratePromptSectionEdge } from './sync-generate-prompt-sections';
import { createId } from '@/shared/lib/id';
import { compactDynamicInputNodeState, isDynamicInputPort } from './dynamic-input-slot';
import { getTextPromptVariables } from './node-definitions';
import { hasTextPromptMention } from './text-prompt-source-alias';
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
  const targetNode = nodes.find((node) => node.id === params.targetNodeId);
  const isCropSource = targetNode?.type === 'cropImage'
    && (params.targetPortId === 'image' || params.targetPortId === 'video');
  const base = params.detachedEdge ? removeGeneratePromptSectionEdge(nodes, edges, params.detachedEdge) : { nodes, edges };
  let nextEdges = base.edges.filter((edge) => edge.id !== params.detachedEdge?.id
    && !(isCropSource && edge.targetNodeId === params.targetNodeId
      && (edge.targetPortId === 'image' || edge.targetPortId === 'video')
      && edge.targetPortId !== params.targetPortId));
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
  let nextState = { edges: nextEdges, nodes: base.nodes };
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
  const source = state.nodes.find((node) => node.id === edge.sourceNodeId);
  const target = state.nodes.find((node) => node.id === edge.targetNodeId);
  if (target?.type !== 'textPrompt') return state;
  const data = target.data as TextPromptNodeData;
  if (data.text.trim() && source?.type !== 'pipelineInput') return state;
  const variable = getTextPromptVariables(target).find((item) => item.id === edge.targetPortId);
  if (!variable) return state;
  const mention = `@${variable.alias}`;
  if (hasTextPromptMention(data.text, variable.alias)) return state;
  const text = data.text.trim()
    ? `${data.text.trimEnd()}\n\n${mention}`
    : mention;
  return {
    ...state,
    nodes: state.nodes.map((node) => node.id === target.id
      ? { ...node, data: { ...data, text } } as ProductionNode
      : node),
  };
}
