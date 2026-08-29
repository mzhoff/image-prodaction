import assert from 'node:assert/strict';
import test from 'node:test';
import { validateImageBytes } from '@/shared/storage/image-policy';
import { QR_CODE_DEFAULTS } from '@/shared/qr-code';
import type {
  AssetDto,
  UploadImageAssetInput,
} from '@/entities/asset/server/asset-service';
import { AssetStorageError } from '@/entities/asset/server/asset-service';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import type { PipelineExecutionContext } from '../contracts/pipeline-contracts';
import {
  createDeterministicQrAssetId,
  createQrCodePipelineHandler,
  createStoredQrCodeGenerator,
  hashQrCodeRequest,
  renderQrCodePng,
} from './pipeline-qr-code';

const context: PipelineExecutionContext = {
  pipelineId: '01900000-0000-7000-8000-000000000010',
  pipelineVersion: 1,
  runId: '01900000-0000-7000-8000-000000000020',
  sourceApplication: 'test',
  workspaceId: '01900000-0000-7000-8000-000000000001',
};

test('QR renderer produces a deterministic 1024px PNG with the safe defaults', async () => {
  const content = 'https://talkberry.example/register?campaign=pilot';
  const first = await renderQrCodePng({ content, options: QR_CODE_DEFAULTS });
  const second = await renderQrCodePng({ content, options: QR_CODE_DEFAULTS });
  const validated = validateImageBytes(first, {
    claimedContentType: 'image/png',
    maxBytes: 2_000_000,
  });
  assert.equal(validated.width, 1024);
  assert.equal(validated.height, 1024);
  assert.deepEqual(first, second);
});

test('QR handler validates URL input without exposing it in an error', async () => {
  const secretUrl = 'https://user:private@example.com/path';
  let calls = 0;
  const handler = createQrCodePipelineHandler(async () => {
    calls += 1;
    return { assetId: 'asset', kind: 'image' };
  });
  await assert.rejects(handler.execute({
    config: { ...QR_CODE_DEFAULTS },
    context,
    inputs: { text: secretUrl },
    nodeId: 'qr-code',
    signal: new AbortController().signal,
  }), (error: unknown) => error instanceof Error
    && error.message === 'QR URL must not contain embedded credentials.'
    && !error.message.includes(secretUrl));
  assert.equal(calls, 0);
});

test('QR handler uses fallback content and returns the generated image artifact', async () => {
  const handler = createQrCodePipelineHandler(async (input) => {
    assert.equal(input.content, 'https://talkberry.example/register');
    assert.deepEqual(input.options, QR_CODE_DEFAULTS);
    return { assetId: 'asset-qr', kind: 'image', mimeType: 'image/png' };
  });
  assert.deepEqual(await handler.execute({
    config: {
      ...QR_CODE_DEFAULTS,
      fallbackText: 'https://talkberry.example/register',
    },
    context,
    inputs: {},
    nodeId: 'qr-code',
    signal: new AbortController().signal,
  }), {
    image: { assetId: 'asset-qr', kind: 'image', mimeType: 'image/png' },
  });
});

test('QR handler marks only temporary asset storage failures as retryable', async () => {
  const handler = createQrCodePipelineHandler(async () => {
    throw new AssetStorageError();
  });
  await assert.rejects(handler.execute({
    config: {
      ...QR_CODE_DEFAULTS,
      fallbackText: 'https://talkberry.example/register',
    },
    context,
    inputs: {},
    nodeId: 'qr-code',
    signal: new AbortController().signal,
  }), (error: unknown) => error instanceof PipelineNodeHandlerError
    && error.retryable
    && error.message === 'QR image storage is temporarily unavailable.');
});

test('stored QR generator persists only a request hash and reuses a stable asset id', async () => {
  const uploads: UploadImageAssetInput[] = [];
  const fakeAsset = createAssetDto();
  const generator = createStoredQrCodeGenerator(
    { actorUserId: 'user-1', documentId: '01900000-0000-7000-8000-000000000002' },
    {
      renderPng: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      uploadAsset: async (input) => {
        uploads.push(input);
        return { ...fakeAsset, id: input.requestedAssetId ?? fakeAsset.id };
      },
    },
  );
  const content = 'https://talkberry.example/register?secret=campaign-value';
  const input = {
    config: { ...QR_CODE_DEFAULTS },
    content,
    context,
    nodeId: 'qr-code',
    options: QR_CODE_DEFAULTS,
    signal: new AbortController().signal,
  };
  const first = await generator(input);
  const second = await generator(input);
  assert.equal(first.assetId, second.assetId);
  assert.equal(uploads[0]?.requestedAssetId, uploads[1]?.requestedAssetId);
  const serializedMetadata = JSON.stringify(uploads[0]?.metadata);
  assert.ok(!serializedMetadata.includes(content));
  assert.ok(serializedMetadata.includes(hashQrCodeRequest(content, QR_CODE_DEFAULTS)));
  assert.equal(uploads[0]?.operation, 'pipeline_qr_generate');
  assert.equal(uploads[0]?.claimedContentType, 'image/png');
});

test('deterministic QR asset id is a stable UUIDv7 scoped by run, node, and request', () => {
  const requestHash = hashQrCodeRequest('https://talkberry.example/a', QR_CODE_DEFAULTS);
  const first = createDeterministicQrAssetId(context.runId, 'qr-code', requestHash);
  assert.equal(first, createDeterministicQrAssetId(context.runId, 'qr-code', requestHash));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, createDeterministicQrAssetId(context.runId, 'other-node', requestHash));
});

function createAssetDto(): AssetDto {
  return {
    byteSize: 100,
    checksumSha256: 'a'.repeat(64),
    contentType: 'image/png',
    createdAt: '2026-08-25T00:00:00.000Z',
    documentId: '01900000-0000-7000-8000-000000000002',
    generationJobId: null,
    height: 1024,
    id: '01900000-0000-7000-8000-000000000030',
    libraryVisible: false,
    mediaKind: 'image',
    metadata: null,
    modelId: null,
    operation: 'pipeline_qr_generate',
    origin: 'unknown',
    originalName: 'qr-code.png',
    provider: null,
    status: 'ready',
    updatedAt: '2026-08-25T00:00:00.000Z',
    width: 1024,
    workspaceId: context.workspaceId,
  };
}
