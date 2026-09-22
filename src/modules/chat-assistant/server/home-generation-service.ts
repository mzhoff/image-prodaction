import { createHash } from 'node:crypto';
import type { ChatAttachmentApplicationService, ConversationStore } from '@prodactionpro/chat-application';
import type { ToolActionProposal, ToolCallRequest, ToolCallResult, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import { createUuidV7, isUuid } from '@/shared/lib/id';
import { getGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';
import { submitGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { GenerationPayloadTooLargeError, serializeGenerationPayload } from '@/modules/generation/server/generation-payload-store';
import type { QueuedGenerateImagePayload } from '@/modules/generation/server/image-generation-contracts';
import { HOME_GENERATION_PRESENTATION } from '../contracts/home-generation';
import { requireHomeConversation } from './home-conversation-service';
import { findHomeGenerationJob, homeGenerationRepository, type HomeGenerationRepository } from './home-generation-repository';
import { homeJobFailureMessage } from '../contracts/home-generation-errors';
import { loadHomeReferenceImages, readHomeGenerationMessage, selectHomeReferences } from './home-generation-references';
import type { HomeGenerationRecord } from './home-chat-schema';
import { readHomeImageSettings } from './home-image-settings-service';
import { loadHomeSubjectImages } from './home-subject-snapshots';
import { applyPinnedHomeImageSettings, homeGenerationReferenceCount } from '../core/home-generation-settings';

interface Dependencies {
  requireConversation(principal: ChatPrincipal, id: string): Promise<unknown>;
  resolveCredential: typeof resolveOpenRouterCredential;
  resolveModel: typeof openRouterImageCatalog.resolve;
  submit: typeof submitGenerationJob;
  getJob: typeof getGenerationJob;
  findJob: typeof findHomeGenerationJob;
  references: typeof loadHomeReferenceImages;
  imageSettings: typeof readHomeImageSettings;
  subjectImages: typeof loadHomeSubjectImages;
  repository: HomeGenerationRepository;
  now(): Date;
  createId(): string;
}
const defaults: Dependencies = {
  requireConversation: requireHomeConversation, resolveCredential: resolveOpenRouterCredential,
  resolveModel: (...args) => openRouterImageCatalog.resolve(...args), submit: submitGenerationJob,
  getJob: getGenerationJob, references: loadHomeReferenceImages,
  findJob: findHomeGenerationJob,
  imageSettings: readHomeImageSettings, subjectImages: loadHomeSubjectImages,
  repository: homeGenerationRepository, now: () => new Date(), createId: createUuidV7,
};

export class HomeGenerationService {
  private readonly store: ConversationStore;
  private readonly attachments: ChatAttachmentApplicationService;
  private readonly dependencies: Dependencies;
  constructor(store: ConversationStore, attachments: ChatAttachmentApplicationService, dependencies: Dependencies = defaults) {
    this.store = store; this.attachments = attachments; this.dependencies = dependencies;
  }

  async prepare(request: ToolCallRequest, context: ToolExecutionContext): Promise<ToolActionProposal> {
    const principal = principalFromContext(context);
    await this.dependencies.requireConversation(principal, context.conversationId);
    const source = await readHomeGenerationMessage(this.store, context);
    const existing = await this.dependencies.repository.find(context.conversationId, source.sourceTurnId);
    if (existing) return toProposal(existing);
    const pinned = await this.dependencies.imageSettings(principal, context.conversationId, source.selectors);
    const input = applyPinnedHomeImageSettings(request.input, pinned);
    const references = selectHomeReferences(source.attachments, input.referenceIndexes);
    await this.attachments.assertReadyReferences(references, principal);
    await this.dependencies.resolveCredential(context.userId, principal.tenantId!);
    await this.dependencies.resolveModel(input.model, input, homeGenerationReferenceCount(references.length, input.subjects));
    const now = this.dependencies.now();
    const record = await this.dependencies.repository.create({
      id: this.dependencies.createId(), conversationId: context.conversationId, workspaceId: principal.tenantId!,
      userId: context.userId, sourceTurnId: source.sourceTurnId, sourceMessageId: source.sourceMessageId,
      toolCallId: context.toolCallId, input, attachments: references, jobId: null, createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    });
    return toProposal(record);
  }

  async execute(request: ToolCallRequest, context: ToolExecutionContext): Promise<ToolCallResult> {
    const principal = principalFromContext(context);
    await this.dependencies.requireConversation(principal, context.conversationId);
    const id = request.executionRef;
    if (!id || !isUuid(id)) return denied();
    const record = await this.dependencies.repository.byId(id);
    if (!record || record.conversationId !== context.conversationId || record.userId !== context.userId
      || record.workspaceId !== principal.tenantId) return denied();
    const source = await readHomeGenerationMessage(this.store, context);
    if (source.sourceTurnId !== record.sourceTurnId) return denied();
    // Completed/replayed confirmation never submits another provider request.
    const existingJob = record.jobId ? await this.dependencies.getJob(context.userId, record.jobId)
      : await this.dependencies.findJob(record);
    if (existingJob && (existingJob.status !== 'queued' || (existingJob.requestObjectKey && existingJob.enqueuedAt))) {
      await this.dependencies.repository.bindJob(record.id, existingJob.id);
      return { ok: true, output: toHomeGenerationResult(record, existingJob) };
    }
    if (!existingJob && record.expiresAt.getTime() <= this.dependencies.now().getTime()) {
      return { ok: false, safeError: { code: 'HOME_GENERATION_EXPIRED',
        message: 'Подтверждение устарело. Отправьте запрос ещё раз.', retryable: false } };
    }
    await this.dependencies.resolveCredential(context.userId, record.workspaceId);
    await this.dependencies.resolveModel(record.input.model, record.input, homeGenerationReferenceCount(record.attachments.length, record.input.subjects));
    const payload: QueuedGenerateImagePayload = {
      documentId: null, homeConversationId: context.conversationId, workspaceId: record.workspaceId,
      prompt: record.input.prompt, model: record.input.model, size: record.input.size, aspectRatio: record.input.aspectRatio,
      inputs: { actors: [], actions: [], composition: [], camera: [], background: [], style: [], light: [], color: [], metaphor: [], text: [] },
      subjectInputs: (record.input.subjects ?? []).map((subject) => subject.passportText), locationInputs: [],
      referenceImages: [
        ...await this.dependencies.subjectImages(principal, record.input.subjects ?? []),
        ...await this.dependencies.references(this.attachments, record.attachments, principal),
      ],
    };
    let serializedPayload: Uint8Array;
    try { serializedPayload = serializeGenerationPayload(payload); }
    catch (error) {
      if (!(error instanceof GenerationPayloadTooLargeError)) throw error;
      return { ok: false, safeError: { code: 'HOME_GENERATION_PAYLOAD_TOO_LARGE',
        message: 'Общий размер изображений слишком большой. Уменьшите основные фото героев или вложенные референсы и отправьте новый запрос. Генерация не запускалась.',
        retryable: false } };
    }
    const job = await this.dependencies.submit({ userId: context.userId, workspaceId: record.workspaceId,
      // Existing worker reuses checkpoints and blocks ambiguous provider redispatch.
      documentId: null, provider: 'openrouter', modelId: payload.model, operation: 'generate_image', maxAttempts: 3,
      idempotencyKey: `home-image:${record.id}`, payload,
      metadata: { source: 'home-chat', conversationId: context.conversationId, sourceTurnId: record.sourceTurnId,
        sourceMessageId: record.sourceMessageId, toolCallId: record.toolCallId,
        requestHash: createHash('sha256').update(serializedPayload).digest('hex') },
    });
    await this.dependencies.repository.bindJob(record.id, job.id);
    return { ok: true, output: toHomeGenerationResult(record, job) };
  }
}

export function toHomeGenerationResult(record: HomeGenerationRecord, job: Awaited<ReturnType<typeof getGenerationJob>>) {
  return {
    jobId: job.id, status: job.cancelRequestedAt && job.status === 'running' ? 'canceled' : job.status,
    assetId: job.finalAssetId ?? undefined, contentUrl: job.finalAssetId ? `/api/assets/${job.finalAssetId}/content` : undefined,
    statusUrl: `/api/generation-jobs/${job.id}`, prompt: record.input.prompt, model: record.input.model,
    aspectRatio: record.input.aspectRatio, size: record.input.size,
    subjects: (record.input.subjects ?? []).map(({ id, name }) => ({ id, name })),
    error: job.error ? { code: job.error.code, message: homeJobFailureMessage(job.error.code, job.error.retryable), retryable: job.error.retryable } : undefined,
  };
}

function toProposal(record: HomeGenerationRecord): ToolActionProposal {
  return { executionRef: record.id, presentationType: HOME_GENERATION_PRESENTATION,
    expiresAt: record.expiresAt.toISOString(), safePreview: {
      prompt: record.input.prompt, model: record.input.model, size: record.input.size,
      aspectRatio: record.input.aspectRatio, referenceCount: homeGenerationReferenceCount(record.attachments.length, record.input.subjects),
      submitAuthorized: record.input.submitAuthorized === true,
      subjects: (record.input.subjects ?? []).map(({ id, name, reference }) => ({ id, name, referenceCount: reference ? 1 : 0 })),
      notice: record.input.submitAuthorized
        ? 'Создаётся одно изображение за счёт баланса Workspace. Точная стоимость появится после выполнения.'
        : 'После подтверждения будет создано одно изображение за счёт баланса Workspace. Точная стоимость появится после выполнения.',
    } };
}
function principalFromContext(context: ToolExecutionContext): ChatPrincipal {
  return { productId: context.productId, tenantId: context.tenantId, userId: context.userId };
}
function denied(): ToolCallResult {
  return { ok: false, safeError: { code: 'HOME_GENERATION_UNAVAILABLE', message: 'Запрос недоступен. Отправьте новое сообщение.', retryable: false } };
}
