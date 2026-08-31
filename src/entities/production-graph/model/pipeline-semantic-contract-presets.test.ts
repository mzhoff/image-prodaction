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

test('Stories output preset embeds a closed schema with a matching immutable checksum', () => {
  const output = getPipelineSemanticContractPreset('story.production.result.v1');

  assert.ok(output);
  assert.equal(getPipelineSemanticContractPreset('story.production.request.v1'), undefined);
  assert.equal(output.boundary, 'output');
  assert.equal(output.semanticContract.schema.type, 'object');
  assert.equal(
    output.semanticContract.schemaChecksum,
    createHash('sha256').update(stableStringify(output.semanticContract.schema)).digest('hex'),
  );
  assert.deepEqual(
    Object.keys(output.semanticContract.schema.properties),
    output.fields.map((field) => field.key),
  );
  assert.deepEqual(output.semanticContract.schema.required, ['background']);
  assert.deepEqual(output.fields.filter((field) => field.required).map((field) => field.key), ['background']);
});

test('preset readers return detached snapshots and normalizer rejects tampered metadata', () => {
  const [first] = getPipelineSemanticContractPresets('output');
  const [second] = getPipelineSemanticContractPresets('output');
  assert.ok(first);
  assert.ok(second);
  first.fields[0]!.key = 'changed';
  assert.equal(second.fields[0]?.key, 'background');
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
