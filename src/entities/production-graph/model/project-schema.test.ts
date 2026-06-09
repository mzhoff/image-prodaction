import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeNodeDisplayState, normalizeProjectUiState } from './project-schema.ts';

test('normalizeNodeDisplayState maps legacy collapsed flag to Expanded/Collapsed state', () => {
  assert.equal(normalizeNodeDisplayState({ collapsed: true }), 'Collapsed');
  assert.equal(normalizeNodeDisplayState({ collapsed: false }), 'Expanded');
});

test('normalizeNodeDisplayState prefers explicit state over legacy collapsed', () => {
  assert.equal(normalizeNodeDisplayState({ collapsed: true, state: 'Expanded' }), 'Expanded');
});

test('normalizeProjectUiState migrates node ui state and filters unknown nodes', () => {
  const project = {
    nodes: [{ id: 'one' }, { id: 'two' }],
    sections: [{ id: 'section' }],
  };

  const uiState = {
    viewport: { x: 10, y: 20, zoom: 0.8 },
    nodes: {
      one: { collapsed: true },
      missing: { collapsed: false },
    },
    sections: {},
  };

  const normalized = normalizeProjectUiState(uiState, project as never);

  assert.equal(normalized.nodes.one.state, 'Collapsed');
  assert.equal(normalized.nodes.one.collapsed, true);
  assert.equal('missing' in normalized.nodes, false);
});
