import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatConversationApplicationService, InMemoryConversationStore, type ChatAttachmentApplicationService } from '@prodactionpro/chat-application';
import type { ToolCallRequest, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { HomeGenerationService } from './home-generation-service';
import type { HomeGenerationRecord } from './home-chat-schema';
import type { HomeGenerationRepository } from './home-generation-repository';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { HOME_GENERATE_IMAGE_TOOL, homeGenerationTools } from '../contracts/home-generation';
import { selectHomeReferences } from './home-generation-references';
import { toolsForAssistantMode } from './home-tool-policy';
import { selectedHomeMode, effectiveHomeRequestMode } from './home-conversation-mode';
import { homeJobFailureMessage } from '../contracts/home-generation-errors';
import type { PinnedHomeImageSettings } from '../contracts/home-image-settings';
import type { ManagedChatAttachmentRef } from '@prodactionpro/chat-domain';

const principal = { productId: 'image-production', tenantId: '01900000-0000-7000-8000-000000000001', userId: 'user' };
const request: ToolCallRequest = { toolName: HOME_GENERATE_IMAGE_TOOL, riskLevel: 'write', input: { prompt: 'A red fox' } };
const context: ToolExecutionContext = { ...principal, conversationId: 'home:test', turnId: 'turn1', toolCallId: 'tool1' };
type Dependencies = NonNullable<ConstructorParameters<typeof HomeGenerationService>[2]>;

async function fixture() {
  const store = new InMemoryConversationStore();
  await store.create({ ...principal, id: context.conversationId, mode: 'image-generation' });
  async function addMessage(turnId: string, mode = 'image-generation', originalTurnId?: string, contextSelectors?: unknown, attachments: ManagedChatAttachmentRef[] = [], text = 'Create a fox') {
    await store.claimAgentTurn({ ...principal, id: turnId, requestId: turnId,
      conversationId: context.conversationId, originalTurnId });
    if (!originalTurnId) await store.appendMessage({ id: `message:${turnId}`, conversationId: context.conversationId,
      role: 'user', createdAt: new Date().toISOString(), blocks: [{ type: 'text', content: text }],
      metadata: { turnId, mode, contextSelectors, attachments } });
    await store.completeAgentTurn(turnId, { result: {} as never });
  }
  await addMessage('turn1');
  const rows = new Map<string, HomeGenerationRecord>();
  const repository: HomeGenerationRepository = {
    async find(conversationId, sourceTurnId) { return [...rows.values()].find((row) => row.conversationId === conversationId && row.sourceTurnId === sourceTurnId); },
    async byId(id) { return rows.get(id); },
    async create(row) { const existing = await this.find(row.conversationId, row.sourceTurnId); if (existing) return existing; rows.set(row.id, row); return row; },
    async bindJob(id, jobId) { rows.get(id)!.jobId = jobId; },
  };
  const submitted: Array<Parameters<Dependencies['submit']>[0]> = [];
  const jobs = new Map<string, GenerationJobDto>();
  const dependencies: Dependencies = {
    repository, async requireConversation(actor, id) {
      assert.equal(actor.userId, principal.userId); assert.equal(actor.tenantId, principal.tenantId);
      assert.equal(id, context.conversationId);
    },
    resolveCredential: async () => ({ apiKey: 'fake', connection: { id: 'provider' } }) as never,
    resolveModel: async () => ({} as never),
    references: async () => [],
    imageSettings: async () => undefined,
    subjectImages: async () => [],
    getJob: async (_userId, jobId) => jobs.get(jobId)!,
    findJob: async (record) => [...jobs.values()].find((job) => job.idempotencyKey === `home-image:${record.id}`),
    async submit(input) {
      submitted.push(input);
      const prior = [...jobs.values()].find((job) => job.idempotencyKey === input.idempotencyKey);
      if (prior) return prior;
      const job = { id: `job:${jobs.size}`, status: 'queued', finalAssetId: null, workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey, enqueuedAt: new Date().toISOString(), requestObjectKey: 'saved-payload' } as GenerationJobDto;
      jobs.set(job.id, job); return job;
    },
    now: () => new Date('2026-09-21T10:00:00Z'),
    createId: () => `01900000-0000-7000-8000-${String(rows.size + 1).padStart(12, '0')}`,
  };
  const attachments = { assertReadyReferences: async () => undefined } as unknown as ChatAttachmentApplicationService;
  return { store, addMessage, rows, jobs, submitted, dependencies, service: new HomeGenerationService(store, attachments, dependencies) };
}

test('Home confirms one documentless durable job; duplicate delivery returns it without resubmission', async () => {
  const f = await fixture();
  const proposal = await f.service.prepare(request, context);
  assert.equal(f.submitted.length, 0);
  const confirmed = { ...request, executionRef: proposal.executionRef };
  const first = await f.service.execute(confirmed, context);
  assert.deepEqual(await f.service.execute(confirmed, context), first);
  assert.equal(f.submitted.length, 1);
  assert.equal(f.submitted[0].documentId, null);
  assert.equal(f.submitted[0].maxAttempts, 3);
  assert.equal(f.submitted[0].userId, principal.userId);
  assert.equal(f.submitted[0].metadata?.source, 'home-chat');
});

test('Retry source turn shares immutable proposal; a new message gets another job', async () => {
  const f = await fixture();
  const original = await f.service.prepare(request, context);
  await f.addMessage('retry1', 'image-generation', 'turn1');
  const retryContext = { ...context, turnId: 'retry1', toolCallId: 'retrytool' };
  const retry = await f.service.prepare({ ...request, input: { prompt: 'Changed by model retry' } }, retryContext);
  assert.equal(retry.executionRef, original.executionRef);
  assert.equal(retry.safePreview.prompt, 'A red fox');
  await f.service.execute({ ...request, executionRef: retry.executionRef }, retryContext);
  await f.addMessage('turn2');
  const nextContext = { ...context, turnId: 'turn2', toolCallId: 'tool2' };
  const next = await f.service.prepare(request, nextContext);
  await f.service.execute({ ...request, executionRef: next.executionRef }, nextContext);
  assert.notEqual(next.executionRef, original.executionRef);
  assert.equal(f.jobs.size, 2);
});

test('Text mode and another Workspace cannot prepare a paid image action', async () => {
  const f = await fixture();
  await f.addMessage('text1', 'general-chat');
  await assert.rejects(() => f.service.prepare(request, { ...context, turnId: 'text1' }), /Изображение/);
  await assert.rejects(() => f.service.prepare(request, { ...context, tenantId: 'other' }));
  assert.equal(f.submitted.length, 0);
  assert.deepEqual(toolsForAssistantMode(homeGenerationTools, 'general-chat'), []);
  assert.deepEqual(toolsForAssistantMode(homeGenerationTools, 'product-copilot'), []);
});

test('Confirmation cannot execute another message proposal or expired proposal', async () => {
  const f = await fixture();
  const proposal = await f.service.prepare(request, context);
  await f.addMessage('turn2');
  const confirmed = { ...request, executionRef: proposal.executionRef };
  assert.equal((await f.service.execute(confirmed, { ...context, turnId: 'turn2' })).ok, false);
  f.dependencies.now = () => new Date('2026-09-21T11:00:00Z');
  assert.equal((await f.service.execute(confirmed, context)).ok, false);
  assert.equal(f.submitted.length, 0);
});

test('Reference indexes cannot refer to another message or non-image', () => {
  assert.throws(() => selectHomeReferences([], [0]), /Референс/);
  assert.deepEqual(selectHomeReferences([], []), []);
});

test('An interrupted payload enqueue resumes the same confirmed job, including after proposal expiry', async () => {
  const f = await fixture();
  const proposal = await f.service.prepare(request, context);
  const row = f.rows.get(proposal.executionRef)!;
  const job = { id: 'existing-job', status: 'queued', idempotencyKey: `home-image:${row.id}` } as GenerationJobDto;
  f.jobs.set(job.id, job);
  f.dependencies.now = () => new Date('2026-09-21T11:00:00Z');
  const result = await f.service.execute({ ...request, executionRef: proposal.executionRef }, context);
  assert.equal(result.ok, true);
  assert.equal(f.submitted.length, 1);
  assert.equal(f.submitted[0].idempotencyKey, job.idempotencyKey);
  assert.equal(f.jobs.size, 1);
});

test('Text mode survives reload and retry reconstruction without image tools', async () => {
  const f = await fixture();
  await f.addMessage('text2', 'general-chat');
  await f.addMessage('retry-text', 'general-chat', 'text2');
  assert.equal(await selectedHomeMode(context.conversationId, f.store), 'general-chat');
  assert.equal(await effectiveHomeRequestMode({ conversationId: context.conversationId, principal,
    purpose: 'assistant', request: { message: 'Create a fox', mode: 'image-generation', turnId: 'retry-text' } }, f.store), 'general-chat');
});

test('Uncertain paid outcome does not tell the user to generate and pay again', () => {
  assert.match(homeJobFailureMessage('provider_outcome_unknown'), /Не запускайте повторную/);
  assert.match(homeJobFailureMessage('generation_output_persistence_failed', true), /повторит сохранение/);
});

test('Immutable settings from the original message survive retry and control the actual generation payload', async () => {
  const f = await fixture();
  const selector = { route: '/', entity: { type: 'home-image-settings', id: 'snapshot-original' } };
  await f.addMessage('selected-turn', 'image-generation', undefined, selector);
  const chosen: PinnedHomeImageSettings = { id: 'snapshot-original',
    settings: { model: 'user-model', aspectRatio: '9:16', size: '2K', subjectIds: ['hero'] },
    subjects: [{ id: 'hero', name: 'Alice', revision: 2, passportText: 'Pinned passport' }] };
  const validations: Array<{ model: string; count: number }> = [];
  f.dependencies.imageSettings = async (_principal, _conversation, selectors) => {
    assert.deepEqual(selectors, selector); return chosen;
  };
  f.dependencies.resolveModel = async (model, _input, count) => {
    validations.push({ model, count }); return {} as never;
  };
  const selectedContext = { ...context, turnId: 'selected-turn', toolCallId: 'selected-tool' };
  const proposed = await f.service.prepare({ ...request, input: { prompt: 'Alice outside',
    model: 'llm-substitution', aspectRatio: '1:1', size: '4K' } }, selectedContext);
  assert.equal(proposed.safePreview.model, 'user-model');
  await f.addMessage('selected-retry', 'image-generation', 'selected-turn');
  f.dependencies.imageSettings = async () => { throw new Error('Retry must reuse the original proposal snapshot'); };
  const retryContext = { ...selectedContext, turnId: 'selected-retry' };
  const retry = await f.service.prepare(request, retryContext);
  await f.service.execute({ ...request, executionRef: retry.executionRef }, retryContext);
  const payload = f.submitted[0].payload as { model: string; aspectRatio: string; size: string; subjectInputs: string[] };
  assert.deepEqual(payload.subjectInputs, ['Pinned passport']);
  assert.equal(payload.model, 'user-model'); assert.equal(payload.aspectRatio, '9:16'); assert.equal(payload.size, '2K');
  assert.ok(validations.every((item) => item.model === 'user-model'));
});

test('An edit-model settings snapshot cannot bypass validation of actual message references', async () => {
  const f = await fixture();
  f.dependencies.imageSettings = async () => ({ id: 'preflight-passed', subjects: [],
    settings: { model: 'edit-model', aspectRatio: '1:1', size: '1K', subjectIds: [] } });
  f.dependencies.resolveModel = async (_model, _settings, actualCount) => {
    assert.equal(actualCount, 0);
    throw new Error('This model requires a reference image.');
  };
  await assert.rejects(() => f.service.prepare(request, context), /requires a reference/);
  assert.equal(f.rows.size, 0);
  assert.equal(f.submitted.length, 0);
});

test('Four valid 8 MiB references are rejected before job creation when their serialized payload exceeds storage size', async () => {
  const f = await fixture();
  const attached = Array.from({ length: 3 }, (_, i): ManagedChatAttachmentRef => ({
    attachmentId: `reference-${i}`, kind: 'image', name: `reference-${i}.png`, mimeType: 'image/png', sizeBytes: 8 * 1024 * 1024,
  }));
  await f.addMessage('large-refs', 'image-generation', undefined, undefined, attached);
  const selectedContext = { ...context, turnId: 'large-refs' };
  f.dependencies.imageSettings = async () => ({ id: 'selected',
    settings: { model: 'selected-model', aspectRatio: '1:1', size: '1K', subjectIds: ['hero'] },
    subjects: [{ id: 'hero', name: 'Alice', revision: 1, passportText: 'Alice',
      reference: { assetId: 'primary', checksumSha256: 'checksum', contentType: 'image/png' } }],
  });
  const dataUrl = `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024).toString('base64')}`;
  f.dependencies.subjectImages = async () => [{ dataUrl, sourceAssetId: 'primary', sourceNodeTypes: ['subjectBuilder'], slots: ['actors'] }];
  f.dependencies.references = async (_service, refs) => {
    assert.equal(refs.length, 3); return refs.map(() => ({ dataUrl, slots: [] }));
  };
  const proposal = await f.service.prepare(request, selectedContext);
  assert.equal(proposal.safePreview.referenceCount, 4);
  const result = await f.service.execute({ ...request, executionRef: proposal.executionRef }, selectedContext);
  assert.equal(result.ok, false);
  assert.equal(result.safeError?.code, 'HOME_GENERATION_PAYLOAD_TOO_LARGE');
  assert.match(result.safeError?.message ?? '', /Генерация не запускалась/);
  assert.equal(f.submitted.length, 0);
  assert.equal(f.jobs.size, 0);
  assert.equal(f.rows.get(proposal.executionRef)?.jobId, null);
});

test('A blank original description cannot be authorized by attachments, retry text or a model-generated prompt', async () => {
  const f = await fixture();
  await f.addMessage('blank', 'image-generation', undefined, undefined, [
    { attachmentId: 'reference', kind: 'image', name: 'reference.png', mimeType: 'image/png' },
  ], ' \n\t ');
  await assert.rejects(() => f.service.prepare(request, { ...context, turnId: 'blank' }), /Добавьте описание/);
  await f.addMessage('blank-retry', 'image-generation', 'blank');
  await assert.rejects(() => f.service.prepare(request, { ...context, turnId: 'blank-retry' }), /Добавьте описание/);
  assert.equal(f.rows.size, 0);
  assert.equal(f.submitted.length, 0);
});

test('Explicit image submit consumes the public signed write-tool protocol once and preserves retry identity', async () => {
  const f = await fixture();
  f.dependencies.now = () => new Date();
  f.dependencies.imageSettings = async () => ({ id: 'chosen', subjects: [], settings: {
    model: 'chosen-model', aspectRatio: '1:1', size: '1K', subjectIds: [], submitAuthorized: true,
  } });
  const service = new ChatConversationApplicationService(f.store, {
    defaultModel: 'test-model', toolExecution: { approvalSecret: 'x'.repeat(32), allowReadWithoutApproval: true },
  }, { prepareTool: (...args) => f.service.prepare(...args), callTool: (...args) => f.service.execute(...args) });
  const proposal = await service.proposeToolCall({ ...request, conversationId: context.conversationId,
    idempotencyKey: 'original-tool', turnId: context.turnId }, principal);
  assert.equal(proposal.riskLevel, 'write');
  assert.equal(proposal.status, 'needs-confirmation');
  assert.equal(proposal.safePreview?.submitAuthorized, true);
  assert.equal(f.submitted.length, 0);
  const approval = { approvalToken: proposal.approvalToken!, approvalExpiresAt: proposal.approvalExpiresAt! };
  const completed = await service.confirmToolCall(proposal.id, approval, principal);
  assert.equal(completed.status, 'completed');
  assert.equal((await service.confirmToolCall(proposal.id, approval, principal)).output?.jobId, completed.output?.jobId);
  await f.addMessage('authorized-retry', 'image-generation', 'turn1');
  const retry = await f.service.prepare(request, { ...context, turnId: 'authorized-retry' });
  assert.equal(retry.executionRef, (await f.store.findToolCall(proposal.id))?.executionRef);
  assert.equal(retry.safePreview.submitAuthorized, true);
  assert.equal(f.submitted.length, 1);
});

test('Legacy pending proposals remain manually confirmable and do not acquire submit authorization later', async () => {
  const f = await fixture();
  const legacy = await f.service.prepare(request, context);
  assert.equal(legacy.safePreview.submitAuthorized, false);
  f.dependencies.imageSettings = async () => ({ id: 'new-opt-in', subjects: [], settings: {
    model: 'model', aspectRatio: '1:1', size: '1K', subjectIds: [], submitAuthorized: true,
  } });
  assert.equal((await f.service.prepare(request, context)).safePreview.submitAuthorized, false);
  assert.equal((await f.service.execute({ ...request, executionRef: legacy.executionRef }, context)).ok, true);
  assert.equal(f.submitted.length, 1);
});
