import { getRenderedNodeSize } from './graph-store-dom';
import {
  getOwnerSectionIdForRect,
  getSectionAndDescendantIds,
  getSectionRect,
  intersectsRect,
} from './graph-section-layout';
import type { GraphRect } from './graph-section-layout';
import type { GraphSection, ProductionNode } from './types';

export function getNodeIdsInsideSectionTree(sectionId: string, sections: GraphSection[], nodes: ProductionNode[]) {
  if (!sections.some((section) => section.id === sectionId)) return [];
  const sectionIds = getSectionAndDescendantIds(sections, sectionId);

  return nodes
    .filter((node) => isNodeInsideSectionIds(node, sections, sectionIds))
    .map((node) => node.id);
}

export function isNodeInsideSectionIds(node: ProductionNode, sections: GraphSection[], sectionIds: Set<string>) {
  if (sectionIds.size === 0) return false;
  const nodeRect = getNodeRect(node);
  const ownerSectionId = getOwnerSectionIdForRect(nodeRect, sections);
  if (ownerSectionId) return sectionIds.has(ownerSectionId);

  return sections.some((section) => sectionIds.has(section.id) && intersectsRect(getSectionRect(section), nodeRect));
}

function getNodeRect(node: ProductionNode): GraphRect {
  const size = getRenderedNodeSize(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width: size.width,
    height: size.height,
  };
}
