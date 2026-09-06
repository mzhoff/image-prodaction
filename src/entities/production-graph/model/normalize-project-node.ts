import { normalizeNodeSize } from './node-layout';
import { normalizeContextNode } from './normalize-project-context-nodes';
import { normalizeImageNode } from './normalize-project-image-nodes';
import { getNodeDefinition } from './node-registry';
import { normalizePublicationNode } from './normalize-project-publication-nodes';
import { normalizePipelineNode } from './normalize-project-pipeline-nodes';
import { normalizeTextNode } from './normalize-project-text-nodes';
import type { ProductionNode } from './types';

export function normalizeNodeRuntimeStatus(node: ProductionNode): ProductionNode {
  if (node.status === 'running') return { ...node, status: 'idle' };
  if (node.status === 'idle' || node.status === 'success' || node.status === 'error') return node;
  return { ...node, status: 'idle' };
}

export function normalizeNode(node: ProductionNode): ProductionNode {
  const normalized = normalizeImageNode(node)
    ?? normalizeTextNode(node)
    ?? normalizeContextNode(node)
    ?? normalizePublicationNode(node)
    ?? normalizePipelineNode(node)
    ?? {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
    };
  const customTitle = typeof node.data.title === 'string' ? node.data.title.trim() : '';
  const normalizedTitle = typeof normalized.data.title === 'string'
    ? normalized.data.title.trim()
    : '';
  const title = customTitle || normalizedTitle || getNodeDefinition(node.type).title;
  if (normalized.data.title === title) return normalized;
  return { ...normalized, data: { ...normalized.data, title } } as ProductionNode;
}
