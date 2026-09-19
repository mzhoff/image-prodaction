import { removeGeneratePromptSectionEdge } from './sync-generate-prompt-sections';
import { compactDynamicInputNodeState } from './dynamic-input-slot';
import { invalidateCompositionResult } from './composition-connection-state';
import { invalidateExportImageResult } from './export-image-connection-state';
import type { DeleteEdgeOptions } from './store-types';
import type { GraphEdge, ProductionNode } from './types';

/** One removal transaction: invalidate downstream results, then compact each affected node once. */
export function removeGraphEdges(nodes: ProductionNode[], edges: GraphEdge[], edgeIds: string[], options?: DeleteEdgeOptions) {
  const ids = new Set(edgeIds);
  const removed = edges.filter((edge) => ids.has(edge.id));
  let next = { nodes, edges };
  for (const edge of removed) {
    next = removeGeneratePromptSectionEdge(next.nodes, next.edges, edge);
    next.nodes = invalidateExportImageResult(invalidateCompositionResult(next.nodes, edge.targetNodeId, {
      clearLayerContent: !options?.preserveCompositionLayerContent, targetPortId: edge.targetPortId,
    }), edge.targetNodeId);
  }
  if (!options?.preserveDynamicInputSlots && !options?.preserveTextConcatSlots) {
    for (const nodeId of new Set(removed.map((edge) => edge.targetNodeId))) {
      next = compactDynamicInputNodeState(next.nodes, next.edges, nodeId);
    }
  }
  return next;
}
