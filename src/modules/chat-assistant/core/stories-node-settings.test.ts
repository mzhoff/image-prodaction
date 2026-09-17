import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings';

test('Stories authoring accepts all three text roles and counts Unicode consistently', () => {
  const values = { storyTitle: '🚀'.repeat(100), subtitle: 'Я'.repeat(160), text: 'Я'.repeat(600) };
  assert.deepEqual(sanitizePipelineNodeSettings('reverieStories', values), values);
  for (const [key, limit] of [['storyTitle', 100], ['subtitle', 160], ['text', 600]] as const) {
    assert.throws(() => sanitizePipelineNodeSettings('reverieStories', { [key]: 'Я'.repeat(limit + 1) }), /Исходный текст не изменён/);
  }
});
test('MCP does not let an agent invent authored document assets or alter the shared schema', () => {
  const warnings: string[] = [];
  const settings = sanitizePipelineNodeSettings('reverieStories', { document: {}, documentSchemaChecksum: 'invented' }, 'story', warnings);
  assert.deepEqual(settings, {});
  assert.equal(warnings.length, 2);
});
