import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, ProductionNode } from '@/entities/production-graph/model/types';
import type { PipelineValueKind } from '../../contracts/pipeline-contracts';
import type { StudioPipelineBoundary } from '../../contracts/pipeline-publication-contracts';
import { PipelineDomainError } from '../../contracts/pipeline-errors';

export function resolveLeafOutput(
  leaf: ProductionNode,
  incomingEdges: GraphEdge[],
  incomingByNode: ReadonlyMap<string, GraphEdge[]>,
  nodeById: ReadonlyMap<string, ProductionNode>,
  runtimeNodeIdSet: ReadonlySet<string>,
) {
  if (leaf.type === 'exportImage') {
    if (!runtimeNodeIdSet.has(leaf.id) || incomingEdges.length === 0) return null;
    const collection = incomingEdges.length > 1;
    return {
      kind: collection ? 'image_collection' as const : 'image' as const,
      node: leaf,
      outputKey: collection ? 'images' : 'image',
      portId: collection ? 'images' : 'image',
    };
  }
  if (leaf.type === 'preview' || leaf.type === 'router') {
    const edge = incomingEdges[0];
    const resolved = edge ? resolveTransparentSource(edge, incomingByNode, nodeById) : null;
    if (!resolved || !runtimeNodeIdSet.has(resolved.source.id)) return null;
    const output = getRuntimeOutput(resolved.source, resolved.sourcePortId);
    const portId = leaf.type === 'preview' ? 'image' : 'output';
    return output ? { ...output, node: resolved.source, portId } : null;
  }
  if (!runtimeNodeIdSet.has(leaf.id)) return null;
  const port = getNodePorts(leaf).find((candidate) => candidate.side === 'output');
  if (!port) return null;
  const output = getRuntimeOutput(leaf, port.id);
  return output ? { ...output, node: leaf, portId: port.id } : null;
}

export function getRuntimeOutput(
  node: ProductionNode,
  sourcePortId: string,
): { kind: PipelineValueKind; outputKey: string } | null {
  if (node.type === 'textPrompt' && sourcePortId === 'text') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textConcat' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textGeneration' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textFormatter' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textSplitter' && sourcePortId === 'items') return { kind: 'text_collection', outputKey: 'items' };
  if (node.type === 'textSplitter' && /^item-\d+$/.test(sourcePortId)) return { kind: 'text', outputKey: sourcePortId };
  if (node.type === 'imageToText' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'generateImage' && sourcePortId === 'image') return { kind: 'image', outputKey: 'image' };
  return null;
}

export function resolveTransparentSource(
  edge: GraphEdge,
  incomingByNode: ReadonlyMap<string, GraphEdge[]>,
  nodeById: ReadonlyMap<string, ProductionNode>,
  visited = new Set<string>(),
): { source: ProductionNode; sourcePortId: string } | null {
  const source = nodeById.get(edge.sourceNodeId);
  if (!source) return null;
  if (source.type !== 'router') return { source, sourcePortId: edge.sourcePortId };
  if (visited.has(source.id)) throw invalidPipeline('Обнаружен цикл из Router-нод.');
  visited.add(source.id);
  const routerInputs = incomingByNode.get(source.id) ?? [];
  if (routerInputs.length !== 1) {
    throw invalidPipeline(`Router «${getNodeTitle(source)}» должен иметь ровно один вход.`);
  }
  return resolveTransparentSource(routerInputs[0]!, incomingByNode, nodeById, visited);
}

export function createBoundary(
  node: ProductionNode,
  portId: string,
  name: string,
  kind: PipelineValueKind,
): StudioPipelineBoundary {
  return { nodeId: node.id, nodeTitle: getNodeTitle(node), portId, name, kind };
}

export function groupEdges(edges: GraphEdge[], key: 'sourceNodeId' | 'targetNodeId') {
  const grouped = new Map<string, GraphEdge[]>();
  for (const edge of edges) grouped.set(edge[key], [...(grouped.get(edge[key]) ?? []), edge]);
  return grouped;
}

export function createUniqueKey(value: string, fallback: string, used: Set<string>) {
  const normalized = value.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || fallback;
  let candidate = /^[a-z]/.test(normalized) ? normalized : `${fallback}_${normalized}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${normalized}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

export function getNodeTitle(node: ProductionNode) {
  return node.data.title?.trim() || node.type;
}

export function invalidPipeline(message: string) {
  return new PipelineDomainError({ code: 'pipeline_definition_invalid', message });
}
