import { createId } from '@/shared/lib/id';
import { cloneSnapshot, withHistory } from './graph-history';
import {
  getSectionAndDescendantIds,
  normalizeSectionHierarchyByGeometry,
} from './graph-section-layout';
import { getNodeIdsInsideSectionTree } from './graph-section-membership';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

const MIN_SECTION_WIDTH = 120;
const MIN_SECTION_HEIGHT = 80;

const SECTION_DUPLICATE_OFFSET = 48;
const DEFAULT_SECTION_COLOR = '#d9d9d9';

export function createGraphSectionActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  | 'addSection'
  | 'deleteSection'
  | 'duplicateSection'
  | 'moveSectionBy'
  | 'renameSection'
  | 'resizeSection'
  | 'selectSection'
  | 'setSectionColor'
  | 'toggleSectionLock'
> {
  return {
    addSection: (rect) => {
      const sectionId = createId('section');
      set((state) => {
        const index = state.sections.length + 1;
        const width = Math.max(MIN_SECTION_WIDTH, rect.width);
        const height = Math.max(MIN_SECTION_HEIGHT, rect.height);
        const nextSection = {
          id: sectionId,
          title: `Section ${index}`,
          position: { x: rect.x, y: rect.y },
          size: { width, height },
          color: DEFAULT_SECTION_COLOR,
          locked: false,
        };

        return {
          ...withHistory(state),
          sections: normalizeSectionHierarchyByGeometry([...state.sections, nextSection]),
          selectedNodeIds: [],
          selectedSectionIds: [sectionId],
        };
      });
      return sectionId;
    },
    deleteSection: (sectionId) => {
      set((state) => {
        const section = state.sections.find((item) => item.id === sectionId);
        if (!section) return {};
        const sectionIds = getSectionAndDescendantIds(state.sections, sectionId);
        const nodeIds = new Set(getNodeIdsInsideSectionTree(sectionId, state.sections, state.nodes));
        return {
          ...withHistory(state),
          sections: state.sections.filter((item) => !sectionIds.has(item.id)),
          nodes: state.nodes.filter((node) => !nodeIds.has(node.id)),
          edges: state.edges.filter((edge) => !nodeIds.has(edge.sourceNodeId) && !nodeIds.has(edge.targetNodeId)),
          selectedNodeIds: [],
          selectedSectionIds: state.selectedSectionIds.filter((id) => !sectionIds.has(id)),
        };
      });
    },
    duplicateSection: (sectionId) => {
      const state = get();
      const section = state.sections.find((item) => item.id === sectionId);
      if (!section) return;

      const sourceNodeIds = new Set(getNodeIdsInsideSectionTree(section.id, state.sections, state.nodes));
      const sourceNodes = state.nodes.filter((node) => sourceNodeIds.has(node.id));
      const idMap = new Map(sourceNodes.map((node) => [node.id, createId('node')]));
      const duplicatedNodes = cloneSnapshot({
        nodes: sourceNodes,
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
      }).nodes.map((node) => ({
        ...node,
        id: idMap.get(node.id) ?? createId('node'),
        position: {
          x: node.position.x + SECTION_DUPLICATE_OFFSET,
          y: node.position.y + SECTION_DUPLICATE_OFFSET,
        },
      }));
      const duplicatedEdges = state.edges
        .filter((edge) => idMap.has(edge.sourceNodeId) && idMap.has(edge.targetNodeId))
        .map((edge) => ({
          ...edge,
          id: createId('edge'),
          sourceNodeId: idMap.get(edge.sourceNodeId) ?? edge.sourceNodeId,
          targetNodeId: idMap.get(edge.targetNodeId) ?? edge.targetNodeId,
        }));
      const duplicatedSection = {
        ...section,
        id: createId('section'),
        title: `${section.title} copy`,
        position: {
          x: section.position.x + SECTION_DUPLICATE_OFFSET,
          y: section.position.y + SECTION_DUPLICATE_OFFSET,
        },
        locked: false,
      };

      set((currentState) => ({
        ...withHistory(currentState),
        sections: [...currentState.sections, duplicatedSection],
        nodes: [...currentState.nodes, ...duplicatedNodes],
        edges: [...currentState.edges, ...duplicatedEdges],
        selectedNodeIds: duplicatedNodes.map((node) => node.id),
        selectedSectionIds: [duplicatedSection.id],
      }));
    },
    moveSectionBy: (sectionId, delta, nodeIds = []) => {
      const nodesToMove = new Set(nodeIds);
      set((state) => {
        const section = state.sections.find((item) => item.id === sectionId);
        if (section?.locked) return {};
        const sectionIdsToMove = getSectionAndDescendantIds(state.sections, sectionId);
        const nextNodesToMove = nodesToMove.size > 0
          ? nodesToMove
          : new Set(getNodeIdsInsideSectionTree(sectionId, state.sections, state.nodes));
        const nextSections = state.sections.map((item) => (
          sectionIdsToMove.has(item.id)
            ? { ...item, position: { x: item.position.x + delta.x, y: item.position.y + delta.y } }
            : item
        ));
        return {
          sections: normalizeSectionHierarchyByGeometry(nextSections),
          nodes: state.nodes.map((node) => (
            nextNodesToMove.has(node.id)
              ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
              : node
          )),
        };
      });
    },
    renameSection: (sectionId, title) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      set((state) => ({
        ...(state.sections.some((section) => section.id === sectionId && section.title !== nextTitle) ? withHistory(state) : {}),
        sections: state.sections.map((section) => (
          section.id === sectionId && section.title !== nextTitle ? { ...section, title: nextTitle } : section
        )),
      }));
    },
    resizeSection: (sectionId, rect) => {
      set((state) => ({
        sections: normalizeSectionHierarchyByGeometry(state.sections.map((section) => (
          section.id === sectionId && !section.locked
            ? {
                ...section,
                position: { x: rect.x, y: rect.y },
                size: {
                  width: Math.max(MIN_SECTION_WIDTH, rect.width),
                  height: Math.max(MIN_SECTION_HEIGHT, rect.height),
                },
              }
            : section
        ))),
      }));
    },
    selectSection: (sectionId, additive = false) => {
      set((state) => {
        if (!additive) return { selectedNodeIds: [], selectedSectionIds: [sectionId] };
        const selected = new Set(state.selectedSectionIds);
        if (selected.has(sectionId)) selected.delete(sectionId);
        else selected.add(sectionId);
        return { selectedNodeIds: state.selectedNodeIds, selectedSectionIds: Array.from(selected) };
      });
    },
    setSectionColor: (sectionId, color) => {
      const nextColor = normalizeSectionColor(color);
      set((state) => ({
        ...(state.sections.some((section) => section.id === sectionId && section.color !== nextColor) ? withHistory(state) : {}),
        sections: state.sections.map((section) => (
          section.id === sectionId && section.color !== nextColor ? { ...section, color: nextColor } : section
        )),
      }));
    },
    toggleSectionLock: (sectionId) => {
      set((state) => ({
        ...(state.sections.some((section) => section.id === sectionId) ? withHistory(state) : {}),
        sections: state.sections.map((section) => (
          section.id === sectionId ? { ...section, locked: !section.locked } : section
        )),
      }));
    },
  };
}

function normalizeSectionColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_SECTION_COLOR;
}
