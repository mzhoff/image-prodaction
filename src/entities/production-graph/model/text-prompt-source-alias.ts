import { getNodeDefinition } from './node-registry';
import { getTextPromptVariables } from './node-definitions';
import { getPipelineFieldIdFromPortId } from './pipeline-contract-fields';
import type {
  GraphEdge,
  PipelineInputNodeData,
  ProductionNode,
  TextPromptNodeData,
} from './types';

export function getTextPromptSourceAlias(
  sourceNode: ProductionNode | undefined,
  sourcePortId?: string,
) {
  if (!sourceNode) return undefined;

  if (sourceNode.type === 'pipelineInput' && sourcePortId) {
    const fieldId = getPipelineFieldIdFromPortId(sourcePortId);
    const field = fieldId
      ? (sourceNode.data as PipelineInputNodeData).fields.find((candidate) => candidate.id === fieldId)
      : undefined;
    const fieldKey = field?.key.trim();
    if (fieldKey) return fieldKey;
  }

  const title = sourceNode.data.title?.trim();
  if (!title || title === getNodeDefinition(sourceNode.type).title) return undefined;
  return title;
}

export function ensurePipelineInputPromptMentions(
  nodes: ProductionNode[],
  edges: GraphEdge[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incomingEdgesByNodeId = new Map<string, GraphEdge[]>();
  edges.forEach((edge) => incomingEdgesByNodeId.set(
    edge.targetNodeId,
    [...(incomingEdgesByNodeId.get(edge.targetNodeId) ?? []), edge],
  ));
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.type !== 'textPrompt') return node;
    const variablesById = new Map(getTextPromptVariables(node).map((variable) => [variable.id, variable]));
    const missingMentions = edges.flatMap((edge) => {
      if (edge.targetNodeId !== node.id) return [];
      const source = resolveTransparentPromptSource(edge, nodesById, incomingEdgesByNodeId);
      if (source?.node.type !== 'pipelineInput') return [];
      const variable = variablesById.get(edge.targetPortId);
      if (!variable) return [];
      const effectiveAlias = getTextPromptSourceAlias(source.node, source.portId);
      const text = (node.data as TextPromptNodeData).text;
      if (hasTextPromptMention(text, variable.alias)
        || (effectiveAlias && hasTextPromptMention(text, effectiveAlias))) return [];
      return [`@${variable.alias}`];
    });
    if (missingMentions.length === 0) return node;

    changed = true;
    const data = node.data as TextPromptNodeData;
    const suffix = missingMentions.join('\n\n');
    return {
      ...node,
      data: {
        ...data,
        text: data.text.trim() ? `${data.text.trimEnd()}\n\n${suffix}` : suffix,
      },
    } as ProductionNode;
  });
  return changed ? nextNodes : nodes;
}

function resolveTransparentPromptSource(
  edge: GraphEdge,
  nodesById: ReadonlyMap<string, ProductionNode>,
  incomingEdgesByNodeId: ReadonlyMap<string, GraphEdge[]>,
  visited = new Set<string>(),
): { node: ProductionNode; portId: string } | undefined {
  const source = nodesById.get(edge.sourceNodeId);
  if (!source) return undefined;
  if (source.type !== 'router') return { node: source, portId: edge.sourcePortId };
  if (visited.has(source.id)) return undefined;
  visited.add(source.id);
  const incomingEdge = incomingEdgesByNodeId.get(source.id)
    ?.find((candidate) => candidate.targetPortId === 'input');
  return incomingEdge
    ? resolveTransparentPromptSource(incomingEdge, nodesById, incomingEdgesByNodeId, visited)
    : undefined;
}

export function hasTextPromptMention(text: string, alias: string) {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s([{])@${escapedAlias}(?=$|[\\s.,;:!?)}\\]"'])`, 'u').test(text);
}
