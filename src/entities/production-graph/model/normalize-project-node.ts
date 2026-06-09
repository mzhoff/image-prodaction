import { normalizeNodeSize } from './node-layout';
import { normalizeContextNode } from './normalize-project-context-nodes';
import { normalizeImageNode } from './normalize-project-image-nodes';
import { normalizePublicationNode } from './normalize-project-publication-nodes';
import { normalizeTextNode } from './normalize-project-text-nodes';
import type { ProductionNode } from './types';

export function normalizeNodeRuntimeStatus(node: ProductionNode): ProductionNode {
  if (node.status === 'running') return { ...node, status: 'idle' };
  if (node.status === 'idle' || node.status === 'success' || node.status === 'error') return node;
  return { ...node, status: 'idle' };
}

export function normalizeNode(node: ProductionNode): ProductionNode {
  return normalizeImageNode(node)
    ?? normalizeTextNode(node)
    ?? normalizeContextNode(node)
    ?? normalizePublicationNode(node)
    ?? {
      ...node,
      size: normalizeNodeSize(node.type, node.size),
    };
}
