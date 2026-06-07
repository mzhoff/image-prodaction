import type { GraphSection } from './types';

export interface GraphRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getSectionRect(section: GraphSection): GraphRect {
  return {
    x: section.position.x,
    y: section.position.y,
    width: section.size.width,
    height: section.size.height,
  };
}

export function containsRect(container: GraphRect, item: GraphRect) {
  return (
    item.x >= container.x
    && item.x + item.width <= container.x + container.width
    && item.y >= container.y
    && item.y + item.height <= container.y + container.height
  );
}

export function intersectsRect(first: GraphRect, second: GraphRect) {
  return (
    first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y
  );
}

export function normalizeSectionHierarchyByGeometry(sections: GraphSection[]): GraphSection[] {
  return sections.map((section) => {
    const parentId = findNearestContainingSectionId(section, sections);
    if (section.parentId === parentId) return section;
    if (!parentId) {
      const { parentId: _parentId, ...nextSection } = section;
      return nextSection;
    }
    return { ...section, parentId };
  });
}

export function getSectionAndDescendantIds(sections: GraphSection[], rootIds: string | Iterable<string>) {
  const sectionIds = new Set(typeof rootIds === 'string' ? [rootIds] : rootIds);
  let changed = true;

  while (changed) {
    changed = false;
    sections.forEach((section) => {
      if (!section.parentId || sectionIds.has(section.id) || !sectionIds.has(section.parentId)) return;
      sectionIds.add(section.id);
      changed = true;
    });
  }

  return sectionIds;
}

export function sortSectionsForRender(sections: GraphSection[]) {
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  return [...sections]
    .map((section, index) => ({
      area: getRectArea(getSectionRect(section)),
      depth: getSectionDepth(section, sectionsById),
      index,
      section,
    }))
    .sort((first, second) => (
      first.depth - second.depth
      || second.area - first.area
      || first.index - second.index
    ))
    .map((item) => item.section);
}

function findNearestContainingSectionId(section: GraphSection, sections: GraphSection[]) {
  const rect = getSectionRect(section);
  return sections
    .filter((candidate) => (
      candidate.id !== section.id
      && strictlyContainsRect(getSectionRect(candidate), rect)
    ))
    .sort((first, second) => getRectArea(getSectionRect(first)) - getRectArea(getSectionRect(second)))
    [0]?.id;
}

export function getOwnerSectionIdForRect(rect: GraphRect, sections: GraphSection[]) {
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  return sections
    .filter((section) => intersectsRect(getSectionRect(section), rect))
    .sort((first, second) => (
      getSectionDepth(second, sectionsById) - getSectionDepth(first, sectionsById)
      || getRectArea(getSectionRect(first)) - getRectArea(getSectionRect(second))
    ))
    [0]?.id;
}

function strictlyContainsRect(container: GraphRect, item: GraphRect) {
  return containsRect(container, item) && getRectArea(container) > getRectArea(item);
}

function getSectionDepth(sectionOrId: GraphSection | string, sectionsById: Map<string, GraphSection>) {
  const section = typeof sectionOrId === 'string' ? sectionsById.get(sectionOrId) : sectionOrId;
  if (!section) return 0;

  const visited = new Set<string>();
  let depth = 0;
  let parentId = section.parentId;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = sectionsById.get(parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId;
  }

  return depth;
}

function getRectArea(rect: GraphRect) {
  return rect.width * rect.height;
}
