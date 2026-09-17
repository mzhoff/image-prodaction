import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { excludePinnedTimelineAssets } from '@/entities/asset/server/pipeline-timeline-asset-retention';
import { TIMELINE_PUBLIC_SCHEMA, createTimelinePublicResult } from '@/shared/media/timeline-public-contract';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { compilePipelineDefinition } from '../core/pipeline-compiler';
import { executeCompiledPipeline } from '../core/pipeline-executor';
import { getPipelineValueContractDefinitionError, getPipelineValueContractIssue } from '../core/pipeline-value-validation';
import type { PipelineNodeHandlerInput, PipelineValue } from '../contracts/pipeline-contracts';
import { createTimelineHandoffHandler } from './pipeline-timeline-handler';
import { pinTimelinePublicationAssets, validateTimelineAssets, type TimelineStoredAsset } from './pipeline-timeline-assets';
import { containsRuntimeArtifact, runtimeOutputArtifacts } from './runtime-v2-run-read';

const sourceId = '019ed347-66a4-7124-8000-000000000001';
const frameId = '019ed347-66a4-7124-8000-000000000002';
const workspaceId = '019ed347-66a4-7124-8000-000000000003';
const checksum = 'a'.repeat(64);
const source: TimelineStoredAsset = { id: sourceId, workspaceId, status: 'ready', mediaKind: 'video',
  checksumSha256: checksum, byteSize: 1024, contentType: 'video/mp4', operation: null, metadata: null };
const frame: TimelineStoredAsset = { ...source, id: frameId, mediaKind: 'image', contentType: 'image/jpeg',
  checksumSha256: 'b'.repeat(64), operation: 'timeline_frame', metadata: { sourceAssetId: sourceId, sourceChecksumSha256: checksum, timelineTimeMs: 500 } };
const analysis: TimelineAnalysis = { version: 1, sourceAssetId: sourceId, sourceChecksum: checksum, durationMs: 1000,
  frameTimesMs: [0, 250, 500, 750], shots: [{ id: 'shot-1', startMs: 0, endMs: 1000,
    frames: [{ timeMs: 500, assetId: frameId }, { timeMs: 750 }], description: '',
  }],
};
const read = async () => [source, frame];
function input(): PipelineNodeHandlerInput {
  return { config: { analysis: analysis as unknown as PipelineValue, assetChecksums: { [sourceId]: checksum, [frameId]: frame.checksumSha256 } },
    context: { runId: '019ed347-66a4-7124-8000-000000000004', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test', workspaceId },
    nodeId: 'handoff', inputs: { video: { kind: 'video', assetId: sourceId, checksumSha256: checksum } }, signal: new AbortController().signal,
  };
}

test('Timeline runtime emits normalized complete JSON, including unmaterialized still timestamps, without AI', async () => {
  const request = input();
  const result = await createTimelineHandoffHandler(read).execute(request);
  assert.equal(getPipelineValueContractDefinitionError({ kind: 'json', required: true, schema: TIMELINE_PUBLIC_SCHEMA }), null);
  assert.equal(getPipelineValueContractIssue(result.timeline!, { kind: 'json', required: true, schema: TIMELINE_PUBLIC_SCHEMA }), null);
  const publicResult = result.timeline as unknown as ReturnType<typeof createTimelinePublicResult>;
  assert.equal(publicResult.shots[0]?.description, '');
  assert.deepEqual(publicResult.shots[0]?.frameIds, ['shot-1@500', 'shot-1@750']);
  assert.equal(publicResult.frames[0]?.asset?.assetId, frameId);
  assert.equal(publicResult.frames[1]?.asset, undefined);
  assert.equal(Object.hasOwn(publicResult, 'frameTimesMs'), false);
  assert.equal(containsRuntimeArtifact(result.timeline!, sourceId), true);
  assert.equal(containsRuntimeArtifact(result.timeline!, frameId), true);
  const delivered = runtimeOutputArtifacts(result.timeline!, request.context.runId) as unknown as typeof publicResult;
  assert.equal(delivered.frames[0]?.shotId, 'shot-1');
  assert.equal(delivered.frames[0]?.timeMs, 500);
  assert.equal(delivered.frames[0]?.asset?.contentUrl, `/v2/runtime/runs/${request.context.runId}/artifacts/${frameId}`);
});

test('Timeline runtime rejects mismatched video/checksum, invalid config, missing pins and cancellation', async () => {
  const handler = createTimelineHandoffHandler(read);
  await assert.rejects(() => handler.execute({ ...input(), inputs: { video: { kind: 'video', assetId: frameId, checksumSha256: checksum } } }), /does not match/);
  await assert.rejects(() => handler.execute({ ...input(), inputs: { video: { kind: 'video', assetId: sourceId, checksumSha256: 'c'.repeat(64) } } }), /does not match/);
  await assert.rejects(() => handler.execute({ ...input(), config: { analysis: {} } }), /reviewed snapshot/);
  await assert.rejects(() => handler.execute({ ...input(), config: { analysis: analysis as unknown as PipelineValue } }), /not pinned/);
  await assert.rejects(() => handler.execute({ ...input(), config: { ...input().config, assetChecksums: { [sourceId]: checksum, [frameId]: 'c'.repeat(64) } } }), /published checksum/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => handler.execute({ ...input(), signal: controller.signal }), /abort/i);
});

test('publication validates source/frame Workspace ownership, exact timestamp and immutable provenance', async () => {
  for (const invalid of [
    { ...frame, workspaceId: 'another' }, { ...frame, operation: 'upload' }, { ...frame, status: 'deleted' as const },
    { ...frame, metadata: { ...frame.metadata, timelineTimeMs: 750 } },
    { ...frame, metadata: { ...frame.metadata, sourceChecksumSha256: 'changed' } },
    { ...frame, metadata: { ...frame.metadata, sourceAssetId: 'another' } },
  ]) await assert.rejects(() => validateTimelineAssets(analysis, workspaceId, async () => [source, invalid]), /Timeline|selected/);
  await assert.rejects(() => validateTimelineAssets(analysis, workspaceId, async () => [{ ...source, checksumSha256: 'c'.repeat(64) }, frame]), /source has changed/);
});

test('publication replaces untrusted pin data and does not mutate the Studio compiled plan', async () => {
  const plan = compilePipelineDefinition({ schemaVersion: 1, inputs: { video: { kind: 'video', required: true } },
    nodes: [{ id: 'handoff', handlerType: 'timeline.handoff', handlerVersion: '1', config: { analysis: analysis as unknown as PipelineValue, assetChecksums: { fake: 'secret' } },
      inputs: { video: { source: 'pipeline-input', inputKey: 'video' } } }], outputs: { result: { nodeId: 'handoff', outputKey: 'timeline' } },
  });
  const pinned = await pinTimelinePublicationAssets(plan, workspaceId, read);
  assert.deepEqual(pinned.definition.nodes[0]?.config.assetChecksums, { [sourceId]: checksum, [frameId]: frame.checksumSha256 });
  assert.deepEqual(plan.definition.nodes[0]?.config.assetChecksums, { fake: 'secret' });
});

test('a pinned pipeline executes video input to the complete typed Timeline output contract', async () => {
  const request = input();
  const plan = await pinTimelinePublicationAssets(compilePipelineDefinition({ schemaVersion: 1,
    inputs: { video: { kind: 'video', required: true } },
    nodes: [{ id: 'handoff', handlerType: 'timeline.handoff', handlerVersion: '1',
      config: { analysis: analysis as unknown as PipelineValue }, inputs: { video: { source: 'pipeline-input', inputKey: 'video' } } }],
    outputs: { timeline: { nodeId: 'handoff', outputKey: 'timeline' } },
    outputContracts: { timeline: { kind: 'json', required: true, schema: TIMELINE_PUBLIC_SCHEMA } },
  }), workspaceId, read);
  const handler = createTimelineHandoffHandler(read);
  const result = await executeCompiledPipeline({ plan, inputs: request.inputs, context: request.context, signal: request.signal,
    handlers: { resolve: (type) => type === 'timeline.handoff' ? handler : null },
  });
  assert.equal(getPipelineValueContractIssue(result.outputs.timeline!, { kind: 'json', required: true, schema: TIMELINE_PUBLIC_SCHEMA }), null);
  assert.equal(containsRuntimeArtifact(result.outputs.timeline!, frameId), true);
});

test('orphan cleanup excludes only exact published Timeline checksums in the same Workspace', () => {
  const query = new PgDialect().sqlToQuery(excludePinnedTimelineAssets()).sql;
  assert.match(query, /pipeline_version/);
  assert.match(query, /workspace_id = "asset"\."workspace_id"/);
  assert.match(query, /assetChecksums/);
  assert.match(query, /checksum_sha256/);
  assert.match(query, /timeline\.handoff/);
});

test('typed selected outputs are pinned frame galleries, text and an exact verified video fragment', async () => {
  const complete = structuredClone(analysis);
  const secondFrameId = '019ed347-66a4-7124-8000-000000000005';
  const clipId = '019ed347-66a4-7124-8000-000000000006';
  complete.shots[0]!.frames[1]!.assetId = secondFrameId;
  complete.shots[0]!.description = 'Selected fragment';
  const secondFrame: TimelineStoredAsset = { ...frame, id: secondFrameId, checksumSha256: 'c'.repeat(64), metadata: { ...frame.metadata, timelineTimeMs: 750 } };
  const clip: TimelineStoredAsset = { ...source, id: clipId, checksumSha256: 'd'.repeat(64), operation: 'video_trim', metadata: {
    sourceAssetId: sourceId, sourceChecksumSha256: checksum, range: { startMs: 0, endMs: 1000 },
  } };
  const rows = [source, frame, secondFrame, clip];
  const richRead = async (_workspace: string, ids: string[]) => rows.filter((record) => ids.includes(record.id));
  const config = { analysis: complete as unknown as PipelineValue, outputScope: 'selected', activeShotIndex: 0,
    outputPorts: ['frames', 'descriptions', 'videoResult'], clipAssetId: clipId };
  const plan = await pinTimelinePublicationAssets(compilePipelineDefinition({ schemaVersion: 1, inputs: {}, nodes: [{
    id: 'handoff', handlerType: 'timeline.handoff', handlerVersion: '1', config, inputs: { video: { source: 'literal', value: input().inputs.video! } },
  }], outputs: { frames: { nodeId: 'handoff', outputKey: 'frames' } } }), workspaceId, richRead);
  const pinnedConfig = plan.definition.nodes[0]!.config;
  assert.equal((pinnedConfig.assetChecksums as Record<string, unknown>)[clipId], clip.checksumSha256);
  const result = await createTimelineHandoffHandler(richRead).execute({ ...input(), config: pinnedConfig });
  assert.deepEqual((result.frames as Array<{ assetId: string }>).map((asset) => asset.assetId), [frameId, secondFrameId]);
  assert.equal(result.descriptions, 'Selected fragment');
  assert.equal((result.videoResult as { assetId: string }).assetId, clipId);
  assert.equal(getPipelineValueContractIssue(result.frames!, { kind: 'image_collection', required: true }), null);
  rows[3] = { ...clip, metadata: { ...clip.metadata, range: { startMs: 250, endMs: 1000 } } };
  await assert.rejects(() => createTimelineHandoffHandler(richRead).execute({ ...input(), config: pinnedConfig }), /reviewed source and range/);
  rows[3] = { ...clip, workspaceId: 'other' };
  await assert.rejects(() => pinTimelinePublicationAssets(plan, workspaceId, richRead), /reviewed source and range/);
});

test('all scope returns the continuous original video and full descriptions without needing a clip', async () => {
  const request = input();
  request.config = { ...request.config, outputScope: 'all', outputPorts: ['descriptions', 'videoResult'] };
  const result = await createTimelineHandoffHandler(read).execute(request);
  assert.equal((result.videoResult as { assetId: string }).assetId, sourceId);
  assert.equal(result.descriptions, '');
  await assert.rejects(() => createTimelineHandoffHandler(read).execute({ ...request, config: {
    ...request.config, outputPorts: ['frames'],
  } }), /Prepare all selected Timeline frames/);
  await assert.rejects(() => createTimelineHandoffHandler(read).execute({ ...request, config: {
    ...request.config, outputScope: 'selected', outputPorts: ['videoResult'],
  } }), /Prepare the selected/);
});
