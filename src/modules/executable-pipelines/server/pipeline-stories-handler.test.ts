import assert from 'node:assert/strict';
import test from 'node:test';
import { STORY_DOCUMENT_SCHEMA_CHECKSUM, requireProductionStoryDocument, storyDocumentAssets, validateStoryDocumentV1 } from '@/shared/contracts/stories-document';
import { getPipelineValueContractDefinitionError, getPipelineValueContractIssue } from '../core/pipeline-value-validation';
import { storiesOutputContract } from '../adapters/studio/studio-stories-descriptor';
import type { PipelineNodeHandlerInput, PipelineValue } from '../contracts/pipeline-contracts';
import { createStoriesHandler } from './pipeline-stories-handler';
import type { StoryStoredAsset } from './pipeline-stories-assets';
import { containsRuntimeArtifact, runtimeOutputArtifacts } from './runtime-v2-run-read';

const workspaceId = '019ed347-66a4-7124-8000-000000000001';
const image: StoryStoredAsset = { id: '019ed347-66a4-7124-8000-000000000002', workspaceId,
  status: 'ready', mediaKind: 'image', contentType: 'image/webp', byteSize: 2000, width: 1080, height: 1920,
  checksumSha256: 'a'.repeat(64), metadata: null };
const video: StoryStoredAsset = { ...image, id: '019ed347-66a4-7124-8000-000000000003', mediaKind: 'video',
  contentType: 'video/mp4', byteSize: 3000, metadata: { video: { container: 'mp4', codec: 'h264', contentType: 'video/mp4',
    durationSeconds: 4, width: 1080, height: 1920, frameRate: 30, rotationDegrees: 0, audioTracks: [], browserPlayable: true } } };
const poll = { schemaVersion: 'polls.definition@1.0.0', pollId: 'poll-1', revisionId: 'poll-1-r1',
  question: 'Удобно?', selectionMode: 'single', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] };
const read = async () => [image, video];
function input(): PipelineNodeHandlerInput {
  return { nodeId: 'stories', signal: new AbortController().signal,
    context: { workspaceId, runId: '019ed347-66a4-7124-8000-000000000004', pipelineId: 'test', pipelineVersion: 1, sourceApplication: 'test' },
    config: { documentSchemaChecksum: STORY_DOCUMENT_SCHEMA_CHECKSUM, storyTitle: 'Заголовок', subtitle: 'Подзаголовок', text: 'Текст',
      locale: 'ru-RU', styleProfileId: 'reverie-default', styleRevisionId: 'reverie-default-r1' },
    inputs: { image: { kind: 'image', assetId: image.id, checksumSha256: image.checksumSha256 } } };
}

test('Stories returns the common document and preserves asset references through Runtime v2', async () => {
  const request = input(); const result = await createStoriesHandler(read).execute(request);
  const document = requireProductionStoryDocument(result.story);
  assert.deepEqual(document.slides[0].layers.map((layer) => layer.kind), ['title', 'subtitle', 'text']);
  assert.equal(getPipelineValueContractDefinitionError(storiesOutputContract()), null);
  assert.equal(getPipelineValueContractIssue(result.story!, storiesOutputContract()), null);
  assert.deepEqual(runtimeOutputArtifacts(result.story!, request.context.runId), result.story);
  assert.equal(containsRuntimeArtifact(result.story!, image.id), true);
  assert.equal(containsRuntimeArtifact(result.story!, video.id), false);
  assert.match(document.preview.cover.source.kind, /productionArtifact/);
});

test('video, poster, duration and poll are real structured results', async () => {
  const request = input(); request.inputs = { video: { kind: 'video', assetId: video.id }, poster: { kind: 'image', assetId: image.id }, poll };
  const result = requireProductionStoryDocument((await createStoriesHandler(read).execute(request)).story);
  assert.equal(result.slides[0].background.asset.kind, 'video');
  assert.equal(result.slides[0].advance.mode, 'mediaEnd');
  assert.equal(result.slides[0].layers[3]?.kind, 'poll');
  assert.equal(containsRuntimeArtifact(result as unknown as PipelineValue, video.id), true);
  assert.equal(containsRuntimeArtifact(result as unknown as PipelineValue, image.id), true);
});

test('an authored draft is finalized at execution and cannot leak into a public result', async () => {
  const document = requireProductionStoryDocument((await createStoriesHandler(read).execute(input())).story);
  const request = input(); request.inputs = {};
  request.config.document = { ...document, schemaVersion: 'stories.document-draft@1.0.0' } as unknown as PipelineValue;
  assert.deepEqual((await createStoriesHandler(read).execute(request)).story, document);
  const invalid = { ...request, config: structuredClone(request.config) };
  invalid.config.document = { ...document, schemaVersion: 'stories.document-draft@1.0.0', slides: [] } as unknown as PipelineValue;
  await assert.rejects(createStoriesHandler(read).execute(invalid), /Дополните черновик/);
  request.inputs = { document: request.config.document };
  await assert.rejects(createStoriesHandler(read).execute(request), /Проверьте Stories/);
});

test('retries preserve the result; malformed, stale and cross-workspace inputs fail closed', async () => {
  assert.deepEqual(await createStoriesHandler(read).execute(input()), await createStoriesHandler(read).execute(input()));
  const long = input(); long.config.storyTitle = 'Ж'.repeat(101);
  await assert.rejects(createStoriesHandler(read).execute(long), /Сократите заголовок на 1 симв/);
  const emoji = input(); emoji.config.storyTitle = '🚀'.repeat(100);
  await createStoriesHandler(read).execute(emoji);
  const missing = input(); missing.inputs = { video: { kind: 'video', assetId: video.id } };
  await assert.rejects(createStoriesHandler(read).execute(missing), /постер/);
  await assert.rejects(createStoriesHandler(async () => [{ ...image, workspaceId: 'another' }]).execute(input()), /пространстве/);
  const old = input(); old.config.documentSchemaChecksum = 'f'.repeat(64);
  await assert.rejects(createStoriesHandler(read).execute(old), /контракта/);
  assert.match(getPipelineValueContractDefinitionError({ ...storiesOutputContract(), documentSchemaChecksum: 'f'.repeat(64) })!, /exact/);
});

test('authored multi-slide documents retain order and cannot reference arbitrary remote URLs or altered metadata', async () => {
  const result = requireProductionStoryDocument((await createStoriesHandler(read).execute(input())).story);
  result.slides.push({ ...structuredClone(result.slides[0]), id: 'slide-2' });
  const request = input(); request.inputs = { document: result as unknown as PipelineValue };
  assert.deepEqual((await createStoriesHandler(read).execute(request)).story, result);
  result.preview.cover.width = 1081;
  for (const slide of result.slides) slide.background.asset.width = 1081;
  await assert.rejects(createStoriesHandler(read).execute(request), /изменился/);
  result.preview.cover.width = 1080;
  result.preview.cover.source = { kind: 'remote', url: 'https://example.test/untrusted.webp', checksum: `sha256:${image.checksumSha256}` };
  for (const slide of result.slides) { slide.background.asset.width = 1080; slide.background.asset.source = result.preview.cover.source; }
  await assert.rejects(createStoriesHandler(read).execute(request), /медиатеки/);
});

test('sequence merges generated image and video slides by numeric input port with shared style', async () => {
  const first = (await createStoriesHandler(read).execute(input())).story!;
  const videoInput = input(); videoInput.inputs = { video: { kind: 'video', assetId: video.id }, poster: { kind: 'image', assetId: image.id }, poll };
  const second = (await createStoriesHandler(read).execute(videoInput)).story!;
  const request = input(); request.config.storyMode = 'sequence'; request.inputs = { 'document-2': second, document: first };
  const result = requireProductionStoryDocument((await createStoriesHandler(read).execute(request)).story);
  assert.deepEqual(result.slides.map((slide) => slide.background.asset.kind), ['image', 'video']);
  assert.deepEqual(result.slides.map((slide) => slide.id), ['slide-1', 'slide-2']);
  const other = structuredClone(requireProductionStoryDocument(second)); other.styleProfile.revisionId = 'other-r1';
  request.inputs['document-2'] = other as unknown as PipelineValue;
  await assert.rejects(createStoriesHandler(read).execute(request), /одинаковый язык и стиль/);
  request.inputs = {};
  await assert.rejects(createStoriesHandler(read).execute(request), /хотя бы один слайд/);
});

test('sequence unifies descriptions of a generated image reused as an authored video poster without changing inputs', async () => {
  const handler = createStoriesHandler(read);
  const first = requireProductionStoryDocument((await handler.execute(input())).story);
  const videoInput = input();
  videoInput.config.storyTitle = 'ВИДЕО И ОПРОС';
  videoInput.inputs = { video: { kind: 'video', assetId: video.id }, poster: { kind: 'image', assetId: image.id }, poll };
  const authored = requireProductionStoryDocument((await handler.execute(videoInput)).story);
  for (const asset of storyDocumentAssets(authored)) {
    asset.altText = asset.kind === 'image' ? 'ТЕСТОВЫЙ СИНИЙ ФОН' : 'ДВИЖУЩИЙСЯ ТЕСТОВЫЙ ФОН';
  }
  const draftInput = input(); draftInput.inputs = {};
  draftInput.config.document = { ...authored, schemaVersion: 'stories.document-draft@1.0.0' } as unknown as PipelineValue;
  const second = requireProductionStoryDocument((await handler.execute(draftInput)).story);
  const directMerge = validateStoryDocumentV1({ ...first, slides: [first.slides[0], { ...second.slides[0], id: 'slide-2' }] });
  assert.equal(directMerge.valid, false);
  if (!directMerge.valid) assert.deepEqual(directMerge.issues.map(({ code, path }) => ({ code, path })), [
    { code: 'asset.identity_conflict', path: '/slides/1/background/asset/poster/assetId' },
  ]);

  const request = input(); request.config.storyMode = 'sequence';
  request.inputs = { 'document-2': second as unknown as PipelineValue, document: first as unknown as PipelineValue };
  const untouched = structuredClone(request.inputs);
  const result = requireProductionStoryDocument((await handler.execute(request)).story);
  assert.deepEqual(result.slides.map((slide) => slide.background.asset.kind), ['image', 'video']);
  assert.deepEqual(result.slides[1].layers, second.slides[0].layers);
  assert.equal(result.slides[1].accessibilityLabel, 'ВИДЕО И ОПРОС');
  assert.equal(result.slides[1].background.asset.altText, 'ДВИЖУЩИЙСЯ ТЕСТОВЫЙ ФОН');
  assert.ok(storyDocumentAssets(result).filter((asset) => asset.assetId === image.id)
    .every((asset) => asset.altText === first.preview.cover.altText));
  assert.deepEqual(request.inputs, untouched);
  assert.deepEqual((await handler.execute(request)).story, result);

  // The same video may be reused in another slide, with its own narration.
  const third = structuredClone(second);
  third.slides[0].accessibilityLabel = 'ДРУГОЙ СЛАЙД С ТЕМ ЖЕ ВИДЕО';
  for (const asset of storyDocumentAssets(third)) asset.altText = 'ДРУГОЕ ОПИСАНИЕ';
  request.inputs['document-3'] = third as unknown as PipelineValue;
  const repeated = requireProductionStoryDocument((await handler.execute(request)).story);
  assert.deepEqual(repeated.slides[2].background.asset, repeated.slides[1].background.asset);
  assert.equal(repeated.slides[2].accessibilityLabel, third.slides[0].accessibilityLabel);
});

test('sequence still rejects conflicting versions and metadata of a reused asset', async () => {
  const handler = createStoriesHandler(read);
  const first = requireProductionStoryDocument((await handler.execute(input())).story);
  for (const conflict of ['checksum', 'dimensions', 'provenance'] as const) {
    const second = structuredClone(first);
    for (const asset of storyDocumentAssets(second)) {
      asset.altText = 'Другой слайд';
      if (conflict === 'checksum' && asset.source.kind === 'productionArtifact') asset.source.checksum = `sha256:${'b'.repeat(64)}`;
      if (conflict === 'dimensions') asset.width = 720;
      if (conflict === 'provenance') asset.provenance = {
        producerKey: 'image-production', artifactId: asset.assetId, capabilityKey: 'content.generate-image', pipelineVersion: 'version-2',
      };
    }
    assert.equal(validateStoryDocumentV1(second).valid, true);
    const request = input(); request.config.storyMode = 'sequence';
    request.inputs = { document: first as unknown as PipelineValue, 'document-2': second as unknown as PipelineValue };
    await assert.rejects(handler.execute(request), /Проверьте Stories/, conflict);
  }
});
