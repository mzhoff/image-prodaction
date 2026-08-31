import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  getPipelineSemanticContractPreset,
  getPipelineSemanticContractPresets,
} from './pipeline-semantic-contract-presets.ts';
import { normalizePipelineSemanticContractSnapshot } from './pipeline-contract-fields.ts';
import { getSystemPipelinePreset } from './system-pipeline-presets.ts';
import type { CompositionNodeData } from './types.ts';

test('Stories boundary presets embed closed schemas with matching immutable checksums', () => {
  const input = getPipelineSemanticContractPreset('story.production.request.v1');
  const output = getPipelineSemanticContractPreset('story.production.result.v1');

  assert.ok(input);
  assert.ok(output);
  assert.equal(input.boundary, 'input');
  assert.equal(output.boundary, 'output');
  assert.equal(input.semanticContract.schema.type, 'object');
  assert.equal(output.semanticContract.schema.type, 'object');
  assert.equal(
    input.semanticContract.schemaChecksum,
    createHash('sha256').update(stableStringify(input.semanticContract.schema)).digest('hex'),
  );
  assert.equal(
    output.semanticContract.schemaChecksum,
    createHash('sha256').update(stableStringify(output.semanticContract.schema)).digest('hex'),
  );
  assert.deepEqual(
    Object.keys(input.semanticContract.schema.properties),
    input.fields.map((field) => field.key),
  );
});

test('preset readers return detached snapshots and normalizer rejects tampered metadata', () => {
  const [first] = getPipelineSemanticContractPresets('input');
  const [second] = getPipelineSemanticContractPresets('input');
  assert.ok(first);
  assert.ok(second);
  first.fields[0]!.key = 'changed';
  assert.equal(second.fields[0]?.key, 'storyId');
  assert.ok(normalizePipelineSemanticContractSnapshot(second.semanticContract));
  assert.equal(normalizePipelineSemanticContractSnapshot({
    ...second.semanticContract,
    schemaChecksum: 'not-a-checksum',
  }), undefined);
});

test('Stories pipeline presets distinguish executable asset rendering from local Composition preview', () => {
  const executable = getSystemPipelinePreset('story.asset.render.v1');
  const preview = getSystemPipelinePreset('story.slide.preview.v1');
  assert.ok(executable?.executable);
  assert.equal(preview?.executable, false);
  const composition = preview?.template.project.nodes.find((node) => node.type === 'composition');
  assert.ok(composition);
  const compositionData = composition.data as CompositionNodeData;
  assert.equal(compositionData.canvasWidth, 1080);
  assert.equal(compositionData.canvasHeight, 1920);
  assert.match(preview?.template.project.sections[0]?.title ?? '', /authoring only/);
  assert.equal(
    executable.template.project.sections[0]?.capabilityKey,
    'story.asset.render.v1',
  );
});

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}
