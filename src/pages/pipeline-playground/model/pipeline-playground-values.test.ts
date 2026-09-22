import assert from 'node:assert/strict';
import test from 'node:test';
import type { PipelinePlaygroundField } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import { createInitialDrafts, isArtifactReference,
  TERMINAL_PIPELINE_STATUSES } from './pipeline-playground-values';

test('playground drafts initialize required booleans without inventing other values', () => {
  const fields: PipelinePlaygroundField[] = [
    { name: 'enabled', label: 'Enabled', description: null, kind: 'boolean', required: true },
    { name: 'caption', label: 'Caption', description: null, kind: 'text', required: true },
  ];
  assert.deepEqual(createInitialDrafts(fields), { enabled: false, caption: undefined });
});

test('playground artifact and terminal status guards reject partial values', () => {
  assert.equal(isArtifactReference({ kind: 'image', assetId: 'asset-1' }), true);
  assert.equal(isArtifactReference({ kind: 'audio', assetId: 'asset-1' }), true);
  assert.equal(isArtifactReference({ kind: 'video', assetId: 'asset-1' }), true);
  assert.equal(isArtifactReference({ kind: 'image' }), false);
  assert.equal(TERMINAL_PIPELINE_STATUSES.has('succeeded'), true);
  assert.equal(TERMINAL_PIPELINE_STATUSES.has('running'), false);
});

test('published defaults become editable drafts without losing false, zero or structured data', () => {
  const base = { label: 'Input', description: null, required: true };
  assert.deepEqual(createInitialDrafts([
    { ...base, name: 'count', kind: 'number', defaultValue: 0 },
    { ...base, name: 'enabled', kind: 'boolean', defaultValue: true },
    { ...base, name: 'off', kind: 'boolean', defaultValue: false },
    { ...base, name: 'text', kind: 'text', defaultValue: 'Start here' },
    { ...base, name: 'lines', kind: 'text_collection', defaultValue: ['A', 'B'] },
    { ...base, name: 'data', kind: 'json', defaultValue: { count: 2 } },
    { ...base, name: 'clip', kind: 'video', defaultValue: { kind: 'video', assetId: 'clip-1' } },
  ]), { count: '0', enabled: true, off: false, text: 'Start here', lines: 'A\nB', data: '{\n  "count": 2\n}', clip: { kind: 'video', assetId: 'clip-1' } });
});
