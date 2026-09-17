import assert from 'node:assert/strict';
import test from 'node:test';
import { STORY_CONTENT_LIMITS_V1 } from '@prodaction/stories-platform-contracts/limits/1.0.0';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { canConnectPorts } from '@/entities/production-graph/model/node-definitions';
import { createReverieStoriesAiPreset, type ReverieStoriesAiPresetInput } from '@/entities/production-graph/model/reverie-stories-ai-preset';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { requireProductionStoryDocument } from '@/shared/contracts/stories-document';
import { executeCompiledPipeline } from '../../core/pipeline-executor';
import type { PipelineArtifactReference, PipelineValue } from '../../contracts/pipeline-contracts';
import { createAiStructuredHandler, type PipelineStructuredGenerator } from '../../server/pipeline-structured-ai-handler';
import { createStoriesHandler } from '../../server/pipeline-stories-handler';
import type { StoryStoredAsset } from '../../server/pipeline-stories-assets';
import { createVideoPipelineHandlers } from '../../server/pipeline-video-handlers';
import { isProductionPipelineHandlerSupported } from '../../server/pipeline-production-manifest';
import { createStaticPipelineHandlerRegistry } from '../../testing/static-pipeline-handler-registry';
import { compileStudioSection } from './studio-pipeline-compiler';
import { storiesOutputContract } from './studio-stories-descriptor';

const workspaceId = '019ed347-66a4-7124-8000-000000000001';
const image: StoryStoredAsset = { id: '019ed347-66a4-7124-8000-000000000002', workspaceId,
  status: 'ready', mediaKind: 'image', contentType: 'image/webp', byteSize: 2000, width: 1080, height: 1920,
  checksumSha256: 'a'.repeat(64), metadata: null };
const video: StoryStoredAsset = { ...image, id: '019ed347-66a4-7124-8000-000000000003', mediaKind: 'video',
  contentType: 'video/mp4', byteSize: 3000, metadata: { video: { container: 'mp4', codec: 'h264', contentType: 'video/mp4',
    durationSeconds: 3, width: 1080, height: 1920, frameRate: 30, rotationDegrees: 0, audioTracks: [], browserPlayable: true } } };

function fixture(): ReverieStoriesAiPresetInput {
  const asset = (record: StoryStoredAsset): AssetRecord => ({ id: record.id, kind: record.mediaKind,
    name: record.mediaKind, mimeType: record.contentType, width: record.width!, height: record.height!,
    createdAt: '2026-09-12T00:00:00.000Z', storage: { type: 'remote', assetId: record.id } });
  return { media: { image: asset(image), video: asset(video), poster: asset(image) },
    authoringProfileBundle: { schemaVersion: 'stories.authoring-profile-bundle@1',
      hostProfile: { schemaVersion: 'stories.profile@3.0.0', profileKey: 'tokberi.local.v3', placementKey: 'tokberi.station_sheet.how_it_works',
        rendererVersion: '3.0.0', allowedAssetSourceKinds: ['remote'], allowedRemoteAssetHosts: ['cdn.example.com'], allowedMediaKinds: ['image', 'video'],
        allowedLayerKinds: ['title', 'subtitle', 'text', 'poll', 'actions'], allowedBusinessActionIds: ['support.open'], allowedPollModes: ['single', 'multiple'],
        allowedStyleProfileIds: ['reverie-default'], allowedBaseProfileKeys: ['reverie'], allowedFontFamilyAliases: ['heading', 'body'], fallbackKey: 'how_it_works' },
      styleProfile: { schemaVersion: 'stories.style-profile@1.0.0', profileId: 'reverie-default', revisionId: 'reverie-default-r1',
        name: 'REVERIE', baseProfileKey: 'reverie', tokens: {} },
    },
  };
}

function compilation() {
  const preset = createReverieStoriesAiPreset(fixture());
  return compileStudioSection(preset.snapshot.project, preset.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
}

test('AI Stories preset compiles six typed text outputs into two semantic slides and one terminal', () => {
  const input = fixture(); const before = structuredClone(input);
  const preset = createReverieStoriesAiPreset(input);
  const snapshot = validateDocumentSnapshot(preset.snapshot);
  const graph = snapshot.project;
  for (const edge of graph.edges) assert.equal(canConnectPorts(graph.nodes.find((node) => node.id === edge.sourceNodeId)!, edge.sourcePortId,
    graph.nodes.find((node) => node.id === edge.targetNodeId)!, edge.targetPortId), true, edge.id);
  assert.equal(graph.nodes.some((node) => node.type === 'pipelineOutput'), false);
  assert.equal(graph.assets.length, 2, 'a shared image/poster has one asset record');
  assert.deepEqual(graph.runs, []); assert.deepEqual(graph.publications, []);
  assert.deepEqual(input, before);
  const result = compileStudioSection(graph, preset.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
  assert.equal(result.sourceMetadata.capabilityKey, 'content.generate-stories');
  assert.deepEqual(result.compiledPlan.definition.outputs, { story: { nodeId: 'stories-ai-sequence', outputKey: 'story' } });
  assert.deepEqual(result.compiledPlan.definition.outputContracts, { story: storiesOutputContract() });
  assert.deepEqual(Object.keys(result.compiledPlan.definition.inputs), ['brief']);
  const ai = result.compiledPlan.definition.nodes.find((node) => node.handlerType === 'ai.structured.generate')!;
  const defaults = createDefaultNode('structuredOutput', { x: 0, y: 0 }).data;
  for (const key of ['model', 'reasoning', 'temperature'] as const) assert.equal(ai.config[key], defaults[key as keyof typeof defaults]);
  assert.deepEqual(ai.inputs.source, { source: 'pipeline-input', inputKey: 'brief' });
  assert.equal((ai.config.fields as PipelineValue[]).length, 6);
  for (const index of [1, 2]) {
    const slide = result.compiledPlan.definition.nodes.find((node) => node.id === `stories-ai-slide${index}`)!;
    for (const role of ['title', 'subtitle', 'text'] as const) assert.deepEqual(slide.inputs[role], {
      source: 'node-output', nodeId: 'stories-ai-copy', outputKey: `field:slide${index}_${role}`,
    });
    assert.equal(slide.config.styleProfileId, 'reverie-default');
    assert.equal(slide.config.styleRevisionId, 'reverie-default-r1');
    assert.equal(slide.config.document, undefined);
  }
  const imported = result.compiledPlan.definition.nodes.find((node) => node.handlerType === 'video.import')!;
  assert.deepEqual(imported.config.outputPorts, ['original']);
  const second = result.compiledPlan.definition.nodes.find((node) => node.id === 'stories-ai-slide2')!;
  assert.deepEqual(second.inputs.video, { source: 'node-output', nodeId: imported.id, outputKey: 'original' });
});

test('preset rejects local-only media and a host without video support', () => {
  const local = fixture(); local.media.video.storage = { type: 'indexeddb', blobKey: 'local-file' };
  assert.throws(() => createReverieStoriesAiPreset(local), /загруженные/);
  const limited = fixture(); limited.authoringProfileBundle.hostProfile.allowedMediaKinds = ['image'];
  assert.throws(() => createReverieStoriesAiPreset(limited), /поддерживать/);
});

function generatedCopy(): Record<string, PipelineValue> {
  return { slide1_title: 'БАТАРЕЯ САДИТСЯ?', slide1_subtitle: 'Зарядка рядом', slide1_text: 'Найдите станцию в приложении.',
    slide2_title: 'ВОЗЬМИТЕ ПАУЭРБАНК', slide2_subtitle: 'Продолжайте свой день', slide2_text: 'Следуйте подсказкам на экране станции.' };
}

function execute(generate: PipelineStructuredGenerator) {
  const artifact = (record: StoryStoredAsset): PipelineArtifactReference => ({ kind: record.mediaKind,
    assetId: record.id, checksumSha256: record.checksumSha256 });
  return executeCompiledPipeline({ plan: compilation().compiledPlan, inputs: { brief: 'Как взять пауэрбанк. Регистр — прописные буквы.' },
    context: { workspaceId, runId: '019ed347-66a4-7124-8000-000000000004', pipelineId: 'test', pipelineVersion: 1, sourceApplication: 'test' },
    signal: new AbortController().signal,
    handlers: createStaticPipelineHandlerRegistry([
      createAiStructuredHandler(generate), createStoriesHandler(async () => [image, video]),
      { handlerType: 'asset.reference', handlerVersion: '1', async execute(input) {
        assert.equal(input.config.assetId, image.id); return { asset: artifact(image) };
      } },
      ...createVideoPipelineHandlers({ async resolveVideo(input) {
        assert.equal(input.config.assetId, video.id); return artifact(video);
      }, async deriveVideo() { assert.fail('preset must not create derived media'); } }),
    ]),
  });
}

test('mocked AI runs through real structured and Stories handlers without a provider or persistence', async () => {
  let generations = 0;
  const result = await execute(async (input) => {
    generations += 1;
    assert.equal(input.source, 'Как взять пауэрбанк. Регистр — прописные буквы.');
    return generatedCopy();
  });
  const document = requireProductionStoryDocument(result.outputs.story);
  assert.equal(generations, 1);
  assert.deepEqual(document.slides.map((slide) => slide.background.asset.kind), ['image', 'video']);
  assert.deepEqual(document.slides.map((slide) => slide.layers.map((layer) => layer.kind)), [['title', 'subtitle', 'text'], ['title', 'subtitle', 'text']]);
  assert.equal(document.slides[1].advance.mode, 'mediaEnd');
  assert.equal(document.slides[1].layers[0]?.kind === 'title' && document.slides[1].layers[0].text, 'ВОЗЬМИТЕ ПАУЭРБАНК');
});

test('valid structured JSON exceeding Stories limits is rejected downstream without automatic shortening', async () => {
  const ai = compilation().compiledPlan.definition.nodes.find((node) => node.handlerType === 'ai.structured.generate')!;
  assert.equal(JSON.stringify(ai.config.schema).includes('maxLength'), false, 'generic Structured Output does not expose this constraint');
  for (const role of ['title', 'subtitle', 'text'] as const) {
    let generations = 0;
    const generated = generatedCopy(); generated[`slide1_${role}`] = 'Я'.repeat(STORY_CONTENT_LIMITS_V1[role] + 1);
    await assert.rejects(execute(async () => { generations += 1; return generated; }), /Сократите .* на 1 симв/);
    assert.equal(generations, 1, 'length failure is not silently retried as a provider error');
    assert.equal((generated[`slide1_${role}`] as string).length, STORY_CONTENT_LIMITS_V1[role] + 1);
  }
});
