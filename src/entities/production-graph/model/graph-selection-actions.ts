import { createId } from '@/shared/lib/id';
import { cloneSnapshot, withHistory } from './graph-history';
import { clearGraphPersistBackups } from './graph-persistence';
import { getRenderedNodeSize } from './graph-store-dom';
import {
  getSectionAndDescendantIds,
  normalizeSectionHierarchyByGeometry,
} from './graph-section-layout';
import { isNodeInsideSectionIds } from './graph-section-membership';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import {
  TELEGRAM_MEDIA_MAX_INPUTS,
  TELEGRAM_MEDIA_MIN_INPUTS,
  TEXT_CONCAT_MIN_INPUTS,
  getTelegramMediaInputPortId,
  getTelegramMediaInputPortIndex,
  getTextConcatInputPortId,
  getTextConcatInputPortIndex,
} from './node-definitions';
import { createEmptyProjectUiState } from './project-schema';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { GraphEdge, ProductionNode, ProductionNodeData, TelegramPublicationNodeData, TextConcatNodeData } from './types';

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
        const compactedGraph = compactDynamicInputSlots(remainingNodes, remainingEdges);

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

function compactDynamicInputSlots(nodes: ProductionNode[], edges: GraphEdge[]) {
  let nextEdges = edges;
  let nextNodes = nodes;

  nodes.forEach((node) => {
    if (node.type === 'textConcat') {
      nextEdges = compactTextConcatEdges(nextEdges, node.id);
      nextNodes = updateTextConcatInputCount(nextNodes, node.id, nextEdges);
    }
    if (node.type === 'telegramPublication') {
      nextEdges = compactTelegramMediaEdges(nextEdges, node.id);
      nextNodes = updateTelegramMediaInputCount(nextNodes, node.id, nextEdges);
    }
  });

  return { edges: nextEdges, nodes: nextNodes };
}

function compactTextConcatEdges(edges: GraphEdge[], nodeId: string) {
  const inputEdges = edges
    .filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0)
    .sort((first, second) => getTextConcatInputPortIndex(first.targetPortId) - getTextConcatInputPortIndex(second.targetPortId));
  const nextPortByEdgeId = new Map(inputEdges.map((edge, index) => [edge.id, getTextConcatInputPortId(index)]));
  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
}

function compactTelegramMediaEdges(edges: GraphEdge[], nodeId: string) {
  const inputEdges = edges
    .filter((edge) => edge.targetNodeId === nodeId && getTelegramMediaInputPortIndex(edge.targetPortId) >= 0)
    .sort((first, second) => getTelegramMediaInputPortIndex(first.targetPortId) - getTelegramMediaInputPortIndex(second.targetPortId));
  const nextPortByEdgeId = new Map(inputEdges.map((edge, index) => [edge.id, getTelegramMediaInputPortId(index)]));
  return edges.map((edge) => (
    nextPortByEdgeId.has(edge.id)
      ? { ...edge, targetPortId: nextPortByEdgeId.get(edge.id) ?? edge.targetPortId }
      : edge
  ));
}

function updateTextConcatInputCount(nodes: ProductionNode[], nodeId: string, edges: GraphEdge[]) {
  const usedCount = edges.filter((edge) => edge.targetNodeId === nodeId && getTextConcatInputPortIndex(edge.targetPortId) >= 0).length;
  const inputCount = Math.max(TEXT_CONCAT_MIN_INPUTS, usedCount + 1);
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'textConcat') return node;
    const data = node.data as TextConcatNodeData;
    if (data.inputCount === inputCount) return node;
    return { ...node, data: { ...node.data, inputCount } as ProductionNodeData };
  });
}

function updateTelegramMediaInputCount(nodes: ProductionNode[], nodeId: string, edges: GraphEdge[]) {
  const usedCount = edges.filter((edge) => edge.targetNodeId === nodeId && getTelegramMediaInputPortIndex(edge.targetPortId) >= 0).length;
  const inputCount = Math.max(
    TELEGRAM_MEDIA_MIN_INPUTS,
    Math.min(TELEGRAM_MEDIA_MAX_INPUTS, usedCount + 1),
  );
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'telegramPublication') return node;
    const data = node.data as TelegramPublicationNodeData;
    if (data.mediaInputCount === inputCount) return node;
    return { ...node, data: { ...node.data, mediaInputCount: inputCount } as ProductionNodeData };
  });
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
