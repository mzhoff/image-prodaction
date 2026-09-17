import type { GraphEdge, GraphPoint, ProductionNode } from '@/entities/production-graph/model/types';
import { getEdgePath, type PortPointLookup } from './edge-path';

/** Presentation-only: never writes graph data, history, or persistence. */
export function createNodeDragPreview(
  container: HTMLElement,
  nodes: ProductionNode[],
  edges: GraphEdge[],
  nodeIds: Set<string>,
  sectionIds: Set<string>,
  options: { measuredPortPoints: PortPointLookup; collapsedGenerateComposingNodeIds: Set<string> },
) {
  const moving = nodes.filter((node) => nodeIds.has(node.id));
  const elements = [...container.querySelectorAll<HTMLElement>('[data-node-id], [data-section-id]')]
    .filter((element) => nodeIds.has(element.dataset.nodeId ?? '') || sectionIds.has(element.dataset.sectionId ?? ''));
  const paths = new Map([...container.querySelectorAll<SVGPathElement>('[data-edge-id]')]
    .map((element) => [element.dataset.edgeId, element]));
  const adjacent = edges.filter((edge) => nodeIds.has(edge.sourceNodeId) || nodeIds.has(edge.targetNodeId));
  const originalTransforms = elements.map((element) => element.style.transform);
  const originalPaths = adjacent.map((edge) => paths.get(edge.id)?.getAttribute('d'));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  container.dataset.dragPreview = 'true';

  return {
    move(delta: GraphPoint) {
      elements.forEach((element) => { element.style.transform = `translate(${delta.x}px, ${delta.y}px)`; });
      moving.forEach((node) => nodesById.set(node.id, {
        ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
      }));
      adjacent.forEach((edge) => {
        const path = getEdgePath(edge, nodesById, options);
        if (path) paths.get(edge.id)?.setAttribute('d', path);
      });
    },
    dispose() {
      elements.forEach((element, index) => { element.style.transform = originalTransforms[index]; });
      adjacent.forEach((edge, index) => {
        const path = originalPaths[index];
        if (path) paths.get(edge.id)?.setAttribute('d', path);
      });
      delete container.dataset.dragPreview;
      container.dispatchEvent(new Event('canvas-drag-preview-end'));
    },
  };
}
