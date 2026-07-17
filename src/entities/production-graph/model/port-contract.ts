import {
  canConnectPorts,
  getTextPromptVariablePortIndex,
} from './node-definitions';
import { isDynamicInputPort } from './dynamic-input-slot';
import type { GraphEdge, ProductionNode } from './types';

export const INPUT_ALREADY_CONNECTED_REASON = 'This input is already connected.';
export const PROMPT_VARIABLE_CONNECTED_REASON = 'This Prompt variable is already connected.';

export interface TargetPortConflictResolution {
  blockedEdge?: GraphEdge;
  isSwapAllowed: boolean;
  isBlocked: boolean;
  reason?: string;
}

export interface ResolveTargetPortConflictParams {
  edges: GraphEdge[];
  targetNode: ProductionNode;
  targetPortId: string;
  detachedEdge?: GraphEdge;
}

export function resolveTargetPortConnectionConflict(params: ResolveTargetPortConflictParams): TargetPortConflictResolution {
  const { edges, targetNode, targetPortId, detachedEdge } = params;

  const isDuplicateTargetPort = edges.find((edge) => (
    edge.targetNodeId === targetNode.id
    && edge.targetPortId === targetPortId
    && edge.id !== detachedEdge?.id
  ));
  if (!isDuplicateTargetPort) {
    return { isBlocked: false, isSwapAllowed: false };
  }

  if (targetNode.type === 'generateImage') {
    return { isBlocked: false, isSwapAllowed: false };
  }

  const isPromptVariableSlot = targetNode.type === 'textPrompt' && isTextPromptVariablePortId(targetPortId);
  if (isPromptVariableSlot) {
    const isTextPromptVariableSwap = detachedEdge
      && detachedEdge.targetNodeId === targetNode.id
      && isTextPromptVariablePortId(detachedEdge.targetPortId);
    if (isTextPromptVariableSwap) {
      return { isBlocked: false, isSwapAllowed: true, blockedEdge: isDuplicateTargetPort };
    }
    return {
      isBlocked: true,
      isSwapAllowed: false,
      blockedEdge: isDuplicateTargetPort,
      reason: PROMPT_VARIABLE_CONNECTED_REASON,
    };
  }

  if (isDynamicInputSlotPort(targetNode, targetPortId)) {
    const isDynamicSwap = Boolean(
      detachedEdge
        && detachedEdge.targetNodeId === targetNode.id
        && isDynamicInputSlotPort(targetNode, detachedEdge.targetPortId),
    );
    return {
      isBlocked: !isDynamicSwap,
      isSwapAllowed: isDynamicSwap,
      blockedEdge: isDuplicateTargetPort,
      reason: isDynamicSwap ? undefined : INPUT_ALREADY_CONNECTED_REASON,
    };
  }

  return {
    isBlocked: true,
    isSwapAllowed: false,
    blockedEdge: isDuplicateTargetPort,
    reason: INPUT_ALREADY_CONNECTED_REASON,
  };
}

export function isDynamicInputSlotPort(node: ProductionNode, portId: string) {
  return isDynamicInputPort(node.type, portId);
}

export function isTextPromptVariablePortId(portId: string) {
  return getTextPromptVariablePortIndex(portId) >= 0;
}

export interface CanKeepSingleIncomingEdgeParams {
  edges: GraphEdge[];
  nodes: ProductionNode[];
}

export function canKeepSingleIncomingEdge(params: CanKeepSingleIncomingEdgeParams) {
  const { edges, nodes } = params;
  const nodeById = new Map<string, ProductionNode>(nodes.map((node) => [node.id, node]));
  const blocked = new Set<string>();
  const kept: GraphEdge[] = [];

  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.sourceNodeId);
    const targetNode = nodeById.get(edge.targetNodeId);
    if (!sourceNode || !targetNode) continue;
    if (!canConnectPorts(sourceNode, edge.sourcePortId, targetNode, edge.targetPortId)) continue;

    const target = `${edge.targetNodeId}::${edge.targetPortId}`;
    if (
      blocked.has(target)
      && targetNode.type !== 'generateImage'
      && !isDynamicInputSlotPort(targetNode, edge.targetPortId)
    ) {
      continue;
    }
    blocked.add(target);
    kept.push(edge);
  }

  return kept;
}
