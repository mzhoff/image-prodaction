import { createId } from '@/shared/lib/id';
import { cloneSnapshot, withHistory } from './graph-history';
import { clearGraphPersistBackups } from './graph-persistence';
import { getRenderedNodeSize } from './graph-store-dom';
import { compactDynamicInputsForNodes } from './dynamic-input-slot';
import {
  getSectionAndDescendantIds,
  normalizeSectionHierarchyByGeometry,
} from './graph-section-layout';
import { isNodeInsideSectionIds } from './graph-section-membership';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import { createEmptyProjectUiState } from './project-schema';
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

      set((state) => {
        const nodeUiState = { ...state.uiState.nodes };
        const sectionUiState = { ...state.uiState.sections };
        const sectionsToDelete = getSectionAndDescendantIds(state.sections, selectedSections);
        selected.forEach((nodeId) => delete nodeUiState[nodeId]);
        sectionsToDelete.forEach((sectionId) => delete sectionUiState[sectionId]);

        const remainingNodes = state.nodes.filter((node) => !selected.has(node.id));
        const remainingEdges = state.edges.filter((edge) => !selected.has(edge.sourceNodeId) && !selected.has(edge.targetNodeId));
        const compactedGraph = compactDynamicInputsForNodes(remainingNodes, remainingEdges);

        return {
          ...withHistory(state),
          nodes: compactedGraph.nodes,
          sections: normalizeSectionHierarchyByGeometry(state.sections.filter((section) => !sectionsToDelete.has(section.id))),
          edges: compactedGraph.edges,
          selectedNodeIds: [],
          selectedSectionIds: [],
          uiState: {
            ...state.uiState,
            nodes: nodeUiState,
            sections: sectionUiState,
          },
        };
      });
    },
    moveNode: (nodeId, position) => {
      set((state) => {
        const node = state.nodes.find((item) => item.id === nodeId);
        if (!node || node.locked || isNodeInsideLockedSection(node, state.sections)) return {};
        return {
          nodes: state.nodes.map((item) => (item.id === nodeId ? { ...item, position } : item)),
        };
      });
    },
    moveSelectedNodesBy: (delta) => {
      const selected = new Set(get().selectedNodeIds);
      const selectedSections = new Set(get().selectedSectionIds);
      set((state) => {
        const sectionsToMove = getSectionAndDescendantIds(state.sections, selectedSections);
        const nextSections = state.sections.map((section) => (
          sectionsToMove.has(section.id)
            ? { ...section, position: { x: section.position.x + delta.x, y: section.position.y + delta.y } }
            : section
        ));

        return {
          nodes: state.nodes.map((node) => (
            (selected.has(node.id) || isNodeInsideSelectedSections(node, state.sections, sectionsToMove))
            && !node.locked
            && !isNodeInsideLockedSection(node, state.sections)
              ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
              : node
          )),
          sections: normalizeSectionHierarchyByGeometry(nextSections),
        };
      });
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
          subjects: [],
          locations: [],
          publications: [],
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
    resetProject: () => {
      clearGraphPersistBackups();
      set((state) => ({ ...withHistory(state), ...normalizeProject(initialProject), uiState: createEmptyProjectUiState() }));
    },
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

function isNodeInsideLockedSection(
  node: ReturnType<StoreGet>['nodes'][number],
  sections: ReturnType<StoreGet>['sections'],
) {
  const nodeSize = getRenderedNodeSize(node);
  return sections.some((section) => (
    section.locked
    && section.position.x <= node.position.x + nodeSize.width
    && section.position.x + section.size.width >= node.position.x
    && section.position.y <= node.position.y + nodeSize.height
    && section.position.y + section.size.height >= node.position.y
  ));
}

function isNodeInsideSelectedSections(
  node: ReturnType<StoreGet>['nodes'][number],
  sections: ReturnType<StoreGet>['sections'],
  selectedSectionsWithDescendants: Set<string>,
) {
  return isNodeInsideSectionIds(node, sections, selectedSectionsWithDescendants);
}
