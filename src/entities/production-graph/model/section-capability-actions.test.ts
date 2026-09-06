import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { normalizeProjectSections } from './normalize-project-sections';
import { createEmptyProjectUiState } from './project-schema';
import { useProductionGraphStore } from './use-production-graph-store';

const sectionId = 'integration-section';

beforeEach(() => {
  useProductionGraphStore.setState({
    version: 1, nodes: [], edges: [], assets: [], presets: [], subjects: [], locations: [], publications: [], runs: [],
    sections: [{ id: sectionId, title: 'Summary', position: { x: 0, y: 0 }, size: { width: 640, height: 420 } }],
    selectedNodeIds: [], selectedSectionIds: [], historyPast: [], historyFuture: [], uiState: createEmptyProjectUiState(),
  });
});

test('section capability edits the draft with undo/redo and survives normalization', () => {
  const before = useProductionGraphStore.getState().sections[0];
  assert.deepEqual(useProductionGraphStore.getState().setSectionCapabilityKey(sectionId, '  content.generate-article-summary  '), { ok: true });
  assert.equal(before.capabilityKey, undefined);
  const state = useProductionGraphStore.getState();
  assert.equal(state.sections[0].capabilityKey, 'content.generate-article-summary');
  assert.equal(state.historyPast.length, 1);
  assert.equal(normalizeProjectSections(state.sections)[0].capabilityKey, 'content.generate-article-summary');
  state.undo();
  assert.equal(useProductionGraphStore.getState().sections[0].capabilityKey, undefined);
  useProductionGraphStore.getState().redo();
  assert.equal(useProductionGraphStore.getState().sections[0].capabilityKey, 'content.generate-article-summary');
});

test('empty capability clears the draft property, and no-op edits do not grow history', () => {
  const actions = useProductionGraphStore.getState();
  actions.setSectionCapabilityKey(sectionId, 'brand.generate-article-cover');
  actions.setSectionCapabilityKey(sectionId, 'brand.generate-article-cover');
  assert.equal(useProductionGraphStore.getState().historyPast.length, 1);
  assert.deepEqual(actions.setSectionCapabilityKey(sectionId, '  '), { ok: true });
  assert.equal(Object.hasOwn(useProductionGraphStore.getState().sections[0], 'capabilityKey'), false);
  assert.equal(useProductionGraphStore.getState().historyPast.length, 2);
  useProductionGraphStore.getState().undo();
  assert.equal(useProductionGraphStore.getState().sections[0].capabilityKey, 'brand.generate-article-cover');
});

test('invalid keys and missing sections are rejected without modifying history', () => {
  const actions = useProductionGraphStore.getState();
  for (const key of ['Uppercase', '.invalid', 'two..dots', 'with space', 'a'.repeat(121)]) {
    assert.equal(actions.setSectionCapabilityKey(sectionId, key).ok, false);
    assert.equal(normalizeProjectSections([{ ...actions.sections[0], capabilityKey: key }])[0].capabilityKey, undefined);
  }
  assert.equal(actions.setSectionCapabilityKey('missing', 'content.summary').ok, false);
  assert.equal(useProductionGraphStore.getState().historyPast.length, 0);
  assert.equal(useProductionGraphStore.getState().sections[0].capabilityKey, undefined);
});
