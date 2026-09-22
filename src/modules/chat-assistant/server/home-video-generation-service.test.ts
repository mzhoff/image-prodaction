import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore } from '@prodactionpro/chat-application';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { videoRequestSchema } from '@/shared/media/video-generation-contracts';
import { submitHomeVideoGeneration } from './home-video-generation-service';
import { persistHomeVideoMessages, toHomeVideoResult } from './home-video-history';
import { applyHomeVideoAttachmentAssets, homeVideoAttachmentAssetId, validateHomeVideoAttachments } from './home-video-attachments';

type Dependencies = NonNullable<Parameters<typeof submitHomeVideoGeneration>[2]>;
const principal = { productId: 'image-production', userId: 'author', tenantId: '01900000-0000-7000-8000-000000000001' };
const request = videoRequestSchema.parse({ model: 'video-model', mode: 'text', prompt: 'A quiet sea',
  duration: 4, resolution: '720p', aspectRatio: '16:9' });
const input = { workspaceId: principal.tenantId, conversationId: 'home:one', idempotencyKey: 'client-1', request };

async function fixture() {
  const calls: string[] = [], jobs = new Map<string, GenerationJobDto>();
  const store = new InMemoryConversationStore();
  await store.create({ ...principal, id: input.conversationId, mode: 'image-generation' });
  const dependencies: Dependencies = {
    requireConversation: async (actor, conversationId) => {
      calls.push('authorize');
      assert.equal(actor.userId, principal.userId); assert.equal(conversationId, input.conversationId);
      return (await store.findById(conversationId))!;
    },
    credential: async () => { calls.push('credential'); return {} as never; },
    catalog: async () => [{ key: request.model, label: 'Video', description: '', route: { gateway: 'openrouter', modelId: 'gateway-video' },
      durations: [4], resolutions: ['720p'], aspectRatios: ['16:9'], firstFrame: true, lastFrame: false,
      references: true, audio: false, seed: false }],
    findJob: async (_actor, key) => jobs.get(key),
    validateAssets: async () => { calls.push('assets'); },
    subjects: async () => [],
    materialize: async (_actor, _ids, value) => value,
    submit: async (submission) => {
      calls.push('submit');
      assert.equal(submission.documentId, null); assert.equal(submission.operation, 'generate_video');
      assert.equal(submission.userId, principal.userId);
      const job = { id: 'job-1', status: 'queued', modelId: submission.modelId, provider: submission.provider,
        workspaceId: submission.workspaceId, idempotencyKey: submission.idempotencyKey, metadata: submission.metadata,
        maxAttempts: submission.maxAttempts, createdAt: '2026-09-21T10:00:00Z', documentId: null,
        enqueuedAt: '2026-09-21T10:00:00Z', requestObjectKey: 'request', finalAssetId: null } as GenerationJobDto;
      jobs.set(submission.idempotencyKey, job); return job;
    },
    persist: (job, conversationId, value) => persistHomeVideoMessages(job, conversationId, value, store, { publish() {} }),
  };
  return { calls, jobs, store, dependencies, run: (body: unknown = input) => submitHomeVideoGeneration(principal, body, dependencies) };
}

test('Home video uses documentless durable queue and factual chat history without an LLM turn', async () => {
  const f = await fixture(), response = await f.run();
  assert.equal(response.result.mediaKind, 'video'); assert.equal(response.result.model, request.model);
  assert.equal(response.userMessageId, 'home-video-user:job-1');
  const job = [...f.jobs.values()][0];
  assert.equal(job.modelId, 'gateway-video'); assert.equal(job.metadata?.conversationId, input.conversationId);
  assert.equal(job.metadata?.source, 'home-chat'); assert.ok(job.metadata?.requestHash);
  const messages = await f.store.listMessages(input.conversationId);
  assert.equal(messages.length, 2); assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].metadata?.mode, 'general-chat');
  assert.equal(messages[1].metadata?.source, 'home-generation');
});

test('replayed submit returns the original job without credential/catalog/paid submission or duplicate messages', async () => {
  const f = await fixture(), first = await f.run();
  f.calls.length = 0;
  const second = await f.run();
  assert.deepEqual(second, first); assert.deepEqual(f.calls, ['authorize']);
  assert.equal((await f.store.listMessages(input.conversationId)).length, 2);
});

test('idempotency conflict rejects changed prompt before queuing another video', async () => {
  const f = await fixture(); await f.run(); f.calls.length = 0;
  await assert.rejects(f.run({ ...input, request: { ...request, prompt: 'Changed' } }), { statusCode: 409 });
  assert.deepEqual(f.calls, ['authorize']); assert.equal(f.jobs.size, 1);
});

test('workspace mismatch and revoked conversation access stop before credentials and jobs', async () => {
  const f = await fixture();
  await assert.rejects(f.run({ ...input, workspaceId: '01900000-0000-7000-8000-000000000002' }), { statusCode: 403 });
  assert.equal(f.calls.length, 0);
  f.dependencies.requireConversation = async () => { throw new Error('forbidden'); };
  await assert.rejects(f.run(), /forbidden/); assert.equal(f.calls.length, 0);
});

test('blank prompt and unsupported model parameters never enqueue a provider job', async () => {
  for (const changed of [{ prompt: '  ' }, { duration: 10 }, { generateAudio: true }, { model: 'invented-model' }]) {
    const f = await fixture();
    await assert.rejects(f.run({ ...input, request: { ...request, ...changed } }));
    assert.equal(f.calls.includes('submit'), false);
  }
});

test('retry completes an interrupted payload enqueue using its original model and metadata', async () => {
  const f = await fixture(); await f.run();
  const job = [...f.jobs.values()][0]; job.requestObjectKey = null; job.enqueuedAt = null;
  f.calls.length = 0; await f.run();
  assert.deepEqual(f.calls, ['authorize', 'submit']); assert.equal(f.jobs.size, 1);
});

test('history persistence failure after enqueue is repaired by retry without another job', async () => {
  const f = await fixture(), persist = f.dependencies.persist;
  f.dependencies.persist = async () => { throw new Error('history unavailable'); };
  await assert.rejects(f.run(), /history unavailable/); assert.equal(f.jobs.size, 1);
  f.dependencies.persist = persist; f.calls.length = 0;
  await f.run(); assert.deepEqual(f.calls, ['authorize']);
  assert.equal((await f.store.listMessages(input.conversationId)).length, 2);
});

test('image attachments cannot be silently ignored, mixed with assets, or duplicated', () => {
  assert.throws(() => validateHomeVideoAttachments(request, ['image-1']), /Выберите режим/);
  assert.throws(() => validateHomeVideoAttachments({ ...request, mode: 'frames' }, ['a', 'b', 'c']), /первый и последний/);
  assert.throws(() => validateHomeVideoAttachments({ ...request, mode: 'references' }, ['a', 'a']), /один раз/);
  assert.throws(() => validateHomeVideoAttachments({ ...request, mode: 'frames', firstFrame: { assetId: principal.tenantId, description: '' } }, ['a']), /один способ/);
});

test('stable attachment asset IDs include owner and workspace to prevent cross-account reuse', () => {
  const id = homeVideoAttachmentAssetId(principal, 'a');
  assert.equal(id, homeVideoAttachmentAssetId(principal, 'a'));
  assert.notEqual(id, homeVideoAttachmentAssetId({ ...principal, userId: 'other' }, 'a'));
  assert.notEqual(id, homeVideoAttachmentAssetId({ ...principal, tenantId: 'other' }, 'a'));
  assert.match(id, /^[a-f0-9-]{36}$/);
});

test('ambiguous provider failure warns against repeating a potentially paid request', async () => {
  const f = await fixture(); await f.run();
  const job = { ...[...f.jobs.values()][0], status: 'failed' as const,
    error: { code: 'video_submit_unconfirmed', message: 'sensitive technical details', retryable: false } };
  assert.match(toHomeVideoResult(job, request).error!.message, /Не запускайте видео повторно/);
  assert.ok(!toHomeVideoResult(job, request).error!.message.includes('technical'));
});

test('structured intent freezes original prompt, compiled directions and sparse reference slots in durable history', async () => {
  const f = await fixture();
  f.dependencies.materialize = async (actor, ids, value) => applyHomeVideoAttachmentAssets(value,
    ids.map((id) => ({ assetId: homeVideoAttachmentAssetId(actor, id), description: '' })));
  const body = { ...input, intent: { version: 1, camera: { optics: 'fisheye', movement: 'dollyIn', speed: 'slow' },
    slots: { reference1: { attachmentId: 'a', description: 'Hero' }, reference3: { attachmentId: 'c', description: 'Landscape' } } } };
  const result = await f.run(body);
  assert.equal(result.result.prompt, request.prompt);
  assert.match(result.result.compiledPrompt, /fisheye-lens/);
  assert.equal(result.result.intent?.camera.movement, 'dollyIn');
  const job = [...f.jobs.values()][0];
  const saved = videoRequestSchema.parse(job.metadata?.videoRequest);
  assert.equal(saved.mode, 'references'); assert.deepEqual(saved.references.map((ref) => ref.slot), [1, 3]);
  assert.equal(job.metadata?.originalPrompt, request.prompt);
  const userMessage = (await f.store.listMessages(input.conversationId))[0];
  assert.deepEqual(userMessage.blocks[0], { type: 'text', content: request.prompt });
  assert.equal(userMessage.metadata?.compiledPrompt, saved.prompt);
  assert.ok(userMessage.metadata?.homeVideoIntent);
  f.calls.length = 0;
  assert.deepEqual(await f.run(body), result); assert.deepEqual(f.calls, ['authorize']);
});

test('changed cinematic controls conflict on retry instead of silently changing a paid request', async () => {
  const f = await fixture();
  const body = { ...input, intent: { camera: { movement: 'static' } } };
  await f.run(body); f.calls.length = 0;
  await assert.rejects(f.run({ ...input, intent: { camera: { movement: 'dollyIn' } } }), { statusCode: 409 });
  assert.deepEqual(f.calls, ['authorize']); assert.equal(f.jobs.size, 1);
});

test('mixed typed inputs, legacy-plus-typed inputs and unsupported ending frames fail before materialization or queueing', async () => {
  const invalidBodies = [
    { ...input, intent: { slots: { firstFrame: { attachmentId: 'a' }, reference1: { attachmentId: 'b' } } } },
    { ...input, intent: { slots: { lastFrame: { attachmentId: 'b' } } } },
    { ...input, attachmentIds: ['a'], intent: { slots: { firstFrame: { attachmentId: 'a' } } } },
    { ...input, intent: { slots: { firstFrame: { attachmentId: 'a' }, lastFrame: { attachmentId: 'b' } } } },
  ];
  for (const body of invalidBodies) {
    const f = await fixture();
    f.dependencies.materialize = async () => { throw new Error('should not read uploads'); };
    await assert.rejects(f.run(body), { statusCode: 422 });
    assert.equal(f.jobs.size, 0); assert.equal(f.calls.includes('submit'), false);
  }
});

test('authorized character snapshot and photo are pinned once; retries do not read a changed passport', async () => {
  const f = await fixture();
  const subjectId = '01900000-0000-7000-8000-000000000004';
  const assetId = '01900000-0000-7000-8000-000000000005';
  let snapshots = 0;
  f.dependencies.subjects = async (actor, ids) => {
    snapshots++; assert.deepEqual(actor, principal); assert.deepEqual(ids, [subjectId]);
    return [{ id: subjectId, name: 'Anna', revision: snapshots, passportText: snapshots === 1 ? 'Red coat' : 'Blue coat',
      reference: { assetId, checksumSha256: 'original-checksum', contentType: 'image/png' } }];
  };
  const body = { ...input, intent: { direction: { story: { subjectIds: [subjectId], style: { look: 'film70s' } }, scene: { lighting: 'soft' } } } };
  const first = await f.run(body);
  assert.match(first.result.compiledPrompt, /Red coat/);
  assert.deepEqual(first.result.subjects, [{ id: subjectId, name: 'Anna' }]);
  const saved = videoRequestSchema.parse([...f.jobs.values()][0].metadata?.videoRequest);
  assert.equal(saved.mode, 'references'); assert.equal(saved.references[0].assetId, assetId);
  assert.ok([...f.jobs.values()][0].metadata?.homeVideoSubjects);
  assert.ok((await f.store.listMessages(input.conversationId))[0].metadata?.homeVideoSubjects);
  assert.deepEqual(await f.run(body), first); assert.equal(snapshots, 1);
});

test('portrait/frame conflicts, unsupported model references and inaccessible subjects stop before upload or paid queue', async () => {
  const subjectId = '01900000-0000-7000-8000-000000000004';
  for (const kind of ['frames', 'model', 'access']) {
    const f = await fixture();
    f.dependencies.subjects = async () => {
      if (kind === 'access') throw new Error('Forbidden profile');
      return [{ id: subjectId, name: 'Anna', revision: 1, passportText: 'Red coat',
        reference: { assetId: '01900000-0000-7000-8000-000000000005', checksumSha256: 'hash', contentType: 'image/png' } }];
    };
    if (kind === 'model') {
      const models = await f.dependencies.catalog();
      f.dependencies.catalog = async () => models.map((model) => ({ ...model, references: false }));
    }
    f.dependencies.materialize = async () => { throw new Error('Unexpected upload'); };
    const body = { ...input, intent: { direction: { story: { subjectIds: [subjectId] } },
      ...(kind === 'frames' ? { slots: { firstFrame: { attachmentId: 'frame' } } } : {}) } };
    await assert.rejects(f.run(body), kind === 'access' ? /Forbidden/ : { statusCode: 422 });
    assert.equal(f.jobs.size, 0);
  }
});
