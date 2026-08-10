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
  assert.equal(isArtifactReference({ kind: 'audio', assetId: 'asset-1' }), false);
  assert.equal(isArtifactReference({ kind: 'image' }), false);
  assert.equal(TERMINAL_PIPELINE_STATUSES.has('succeeded'), true);
  assert.equal(TERMINAL_PIPELINE_STATUSES.has('running'), false);
});
