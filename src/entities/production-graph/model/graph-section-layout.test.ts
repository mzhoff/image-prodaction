import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOwnerSectionIdForRect,
  normalizeSectionHierarchyByGeometry,
  sortSectionsForRender,
} from './graph-section-layout.ts';
import type { GraphSection } from './types.ts';

test('normalizeSectionHierarchyByGeometry parents fully contained sections', () => {
  const sections = normalizeSectionHierarchyByGeometry([
    createSection('small', 20, 20, 100, 100),
    createSection('nested', 40, 40, 20, 20),
    createSection('workflow', 0, 0, 240, 180),
  ]);

  assert.equal(sections.find((section) => section.id === 'small')?.parentId, 'workflow');
  assert.equal(sections.find((section) => section.id === 'nested')?.parentId, 'small');
  assert.equal(sections.find((section) => section.id === 'workflow')?.parentId, undefined);
});

test('normalizeSectionHierarchyByGeometry ignores partial section intersection', () => {
  const sections = normalizeSectionHierarchyByGeometry([
    createSection('first', 0, 0, 100, 100),
    createSection('second', 80, 80, 100, 100),
  ]);

  assert.equal(sections.find((section) => section.id === 'first')?.parentId, undefined);
  assert.equal(sections.find((section) => section.id === 'second')?.parentId, undefined);
});

test('sortSectionsForRender places parent sections before children', () => {
  const sections = normalizeSectionHierarchyByGeometry([
    createSection('child', 20, 20, 100, 100),
    createSection('parent', 0, 0, 240, 180),
  ]);

  assert.deepEqual(sortSectionsForRender(sections).map((section) => section.id), ['parent', 'child']);
});

test('getOwnerSectionIdForRect keeps partial sibling ownership on the smaller section', () => {
  const sections = normalizeSectionHierarchyByGeometry([
    createSection('workflow', 0, 0, 200, 200),
    createSection('neighbor', 150, 0, 100, 100),
  ]);

  assert.equal(getOwnerSectionIdForRect({ x: 20, y: 20, width: 40, height: 40 }, sections), 'workflow');
  assert.equal(getOwnerSectionIdForRect({ x: 160, y: 20, width: 40, height: 40 }, sections), 'neighbor');
});

function createSection(id: string, x: number, y: number, width: number, height: number): GraphSection {
  return {
    id,
    title: id,
    position: { x, y },
    size: { width, height },
  };
}
