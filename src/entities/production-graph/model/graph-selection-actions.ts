import { createId } from '@/shared/lib/id';
import { cloneSnapshot, withHistory } from './graph-history';
import { getRenderedNodeSize } from './graph-store-dom';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

export function createGraphSelectionActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  | 'deleteSelected'
  | 'moveNode'
  | 'moveSelectedNodesBy'
  | 'pasteNodes'
  | 'resetProject'
  | 'selectNode'
  | 'selectNodesInRect'
> {
  return {
    deleteSelected: () => {
      const selected = new Set(get().selectedNodeIds);
      const selectedSections = new Set(get().selectedSectionIds);
      if (selected.size === 0 && selectedSections.size === 0) return;

      set((state) => ({
        ...withHistory(state),
        nodes: state.nodes.filter((node) => !selected.has(node.id)),
        sections: state.sections.filter((section) => !selectedSections.has(section.id)),
        edges: state.edges.filter((edge) => !selected.has(edge.sourceNodeId) && !selected.has(edge.targetNodeId)),
        selectedNodeIds: [],
        selectedSectionIds: [],
      }));
    },
    moveNode: (nodeId, position) => {
      set((state) => ({
        nodes: state.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node)),
      }));
    },
    moveSelectedNodesBy: (delta) => {
      const selected = new Set(get().selectedNodeIds);
      const selectedSections = new Set(get().selectedSectionIds);
      set((state) => ({
        nodes: state.nodes.map((node) => (
          selected.has(node.id) || isNodeInsideSelectedSections(node, state.sections, selectedSections)
            ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
            : node
        )),
        sections: state.sections.map((section) => (
          selectedSections.has(section.id)
            ? { ...section, position: { x: section.position.x + delta.x, y: section.position.y + delta.y } }
            : section
        )),
      }));
    },
    pasteNodes: (nodesToPaste, edgesToPaste, position) => {
      if (nodesToPaste.length === 0) return;

      const minX = Math.min(...nodesToPaste.map((node) => node.position.x));
      const minY = Math.min(...nodesToPaste.map((node) => node.position.y));
      const idMap = new Map(nodesToPaste.map((node) => [node.id, createId('node')]));
      const nextNodes = nodesToPaste.map((node) => ({
        ...cloneSnapshot({
          nodes: [node],
          sections: [],
          edges: [],
          assets: [],
          presets: [],
          runs: [],
          selectedNodeIds: [],
          selectedSectionIds: [],
        }).nodes[0],
        id: idMap.get(node.id) ?? createId('node'),
        position: { x: position.x + node.position.x - minX, y: position.y + node.position.y - minY },
      }));
      const nextEdges = edgesToPaste
        .filter((edge) => idMap.has(edge.sourceNodeId) && idMap.has(edge.targetNodeId))
        .map((edge) => ({
          ...edge,
          id: createId('edge'),
          sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
          targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId,
        }));

      set((state) => ({
        ...withHistory(state),
        nodes: [...state.nodes, ...nextNodes],
        edges: [...state.edges, ...nextEdges],
        selectedNodeIds: nextNodes.map((node) => node.id),
        selectedSectionIds: [],
      }));
    },
    resetProject: () => set((state) => ({ ...withHistory(state), ...normalizeProject(initialProject) })),
    selectNode: (nodeId, additive = false) => {
      set((state) => {
        if (!additive) return { selectedNodeIds: [nodeId], selectedSectionIds: [] };
        const selected = new Set(state.selectedNodeIds);
        if (selected.has(nodeId)) selected.delete(nodeId);
        else selected.add(nodeId);
        return { selectedNodeIds: Array.from(selected), selectedSectionIds: state.selectedSectionIds };
      });
    },
    selectNodesInRect: (rect) => {
      set((state) => ({
        selectedNodeIds: state.nodes
          .filter((node) => {
            const renderedSize = getRenderedNodeSize(node);
            return (
              node.position.x <= rect.x + rect.width
              && node.position.x + renderedSize.width >= rect.x
              && node.position.y <= rect.y + rect.height
              && node.position.y + renderedSize.height >= rect.y
            );
          })
          .map((node) => node.id),
        selectedSectionIds: state.sections
          .filter((section) => (
            section.position.x >= rect.x
            && section.position.x + section.size.width <= rect.x + rect.width
            && section.position.y >= rect.y
            && section.position.y + section.size.height <= rect.y + rect.height
          ))
          .map((section) => section.id),
      }));
    },
  };
}

function isNodeInsideSelectedSections(
  node: ReturnType<StoreGet>['nodes'][number],
  sections: ReturnType<StoreGet>['sections'],
  selectedSections: Set<string>,
) {
  if (selectedSections.size === 0) return false;
  const nodeSize = getRenderedNodeSize(node);
  return sections.some((section) => (
    selectedSections.has(section.id)
    && section.position.x <= node.position.x + nodeSize.width
    && section.position.x + section.size.width >= node.position.x
    && section.position.y <= node.position.y + nodeSize.height
    && section.position.y + section.size.height >= node.position.y
  ));
}
