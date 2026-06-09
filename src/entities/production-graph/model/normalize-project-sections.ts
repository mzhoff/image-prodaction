import { normalizeSectionHierarchyByGeometry } from './graph-section-layout';
import type { GraphProject } from './types';

export function normalizeProjectSections(sections: GraphProject['sections']) {
  return normalizeSectionHierarchyByGeometry((sections ?? []).map((section, index) => normalizeSection(section, index)));
}

function normalizeSection(section: GraphProject['sections'][number], index: number) {
  return {
    id: section.id || `section-${index + 1}`,
    title: section.title || `Section ${index + 1}`,
    parentId: typeof section.parentId === 'string' ? section.parentId : undefined,
    position: section.position ?? { x: 0, y: 0 },
    size: section.size ?? { width: 640, height: 420 },
    color: normalizeSectionColor(section.color),
    locked: section.locked === true,
  };
}

function normalizeSectionColor(color: unknown) {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : undefined;
}
