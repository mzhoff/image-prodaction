import { createId } from '@/shared/lib/id';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';

const MIN_SECTION_WIDTH = 120;
const MIN_SECTION_HEIGHT = 80;

export function createGraphSectionActions(set: StoreSet): Pick<
  ProductionGraphState,
  'addSection' | 'moveSectionBy' | 'renameSection' | 'resizeSection' | 'selectSection'
> {
  return {
    addSection: (rect) => {
      const sectionId = createId('section');
      set((state) => {
        const index = state.sections.length + 1;
        const width = Math.max(MIN_SECTION_WIDTH, rect.width);
        const height = Math.max(MIN_SECTION_HEIGHT, rect.height);

        return {
          ...withHistory(state),
          sections: [
            ...state.sections,
            {
              id: sectionId,
              title: `Section ${index}`,
              position: { x: rect.x, y: rect.y },
              size: { width, height },
            },
          ],
          selectedNodeIds: [],
          selectedSectionIds: [sectionId],
        };
      });
      return sectionId;
    },
    moveSectionBy: (sectionId, delta, nodeIds = []) => {
      const nodesToMove = new Set(nodeIds);
      set((state) => ({
        sections: state.sections.map((section) => (
          section.id === sectionId
            ? { ...section, position: { x: section.position.x + delta.x, y: section.position.y + delta.y } }
            : section
        )),
        nodes: state.nodes.map((node) => (
          nodesToMove.has(node.id)
            ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } }
            : node
        )),
      }));
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
        sections: state.sections.map((section) => (
          section.id === sectionId
            ? {
                ...section,
                position: { x: rect.x, y: rect.y },
                size: {
                  width: Math.max(MIN_SECTION_WIDTH, rect.width),
                  height: Math.max(MIN_SECTION_HEIGHT, rect.height),
                },
              }
            : section
        )),
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
  };
}
