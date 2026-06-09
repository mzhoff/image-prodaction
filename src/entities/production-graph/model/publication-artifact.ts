import type {
  PublicationArtifact,
  PublicationAttachment,
  PublicationAttachmentKind,
  PublicationComponent,
  PublicationComponentSlot,
  PublicationComponentType,
  PublicationContentUnitId,
  PublicationPlatformId,
  PublicationStatus,
} from './publication-types';

export interface CreatePublicationArtifactInput {
  id: string;
  platformId: PublicationPlatformId;
  contentUnitId: PublicationContentUnitId;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  summary?: string;
  contentPlain?: string;
  contentHtml?: string;
  sourceNodeId?: string;
  sourceSectionId?: string;
  kanbanCardId?: string;
  components?: PublicationComponent[];
  attachments?: PublicationAttachment[];
  metadata?: Record<string, unknown>;
  status?: PublicationStatus;
}

export function createPublicationArtifact(input: CreatePublicationArtifactInput): PublicationArtifact {
  const now = new Date().toISOString();
  return {
    id: input.id,
    platformId: input.platformId,
    contentUnitId: input.contentUnitId,
    status: input.status ?? 'draft',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    title: input.title,
    summary: input.summary,
    contentPlain: input.contentPlain,
    contentHtml: input.contentHtml,
    sourceNodeId: input.sourceNodeId,
    sourceSectionId: input.sourceSectionId,
    kanbanCardId: input.kanbanCardId,
    components: normalizePublicationComponents(input.components),
    attachments: normalizePublicationAttachments(input.attachments),
    metadata: input.metadata,
  };
}

export function normalizePublicationArtifacts(value: unknown): PublicationArtifact[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): PublicationArtifact[] => {
    if (!isRecord(item)) return [];
    const id = getString(item.id);
    const platformId = normalizePublicationPlatformId(item.platformId);
    const contentUnitId = normalizePublicationContentUnitId(item.contentUnitId);
    if (!id || !platformId || !contentUnitId) return [];

    return [createPublicationArtifact({
      id,
      platformId,
      contentUnitId,
      createdAt: getString(item.createdAt),
      updatedAt: getString(item.updatedAt),
      title: getString(item.title),
      summary: getString(item.summary),
      contentPlain: getString(item.contentPlain),
      contentHtml: getString(item.contentHtml),
      sourceNodeId: getString(item.sourceNodeId),
      sourceSectionId: getString(item.sourceSectionId),
      kanbanCardId: getString(item.kanbanCardId),
      components: normalizePublicationComponents(item.components),
      attachments: normalizePublicationAttachments(item.attachments),
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
      status: normalizePublicationStatus(item.status),
    })];
  });
}

function normalizePublicationComponents(value: unknown): PublicationComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): PublicationComponent[] => {
    if (!isRecord(item)) return [];
    const id = getString(item.id);
    const type = normalizePublicationComponentType(item.type);
    const slot = normalizePublicationComponentSlot(item.slot);
    if (!id || !type || !slot) return [];

    return [{
      id,
      type,
      slot,
      order: getFiniteNumber(item.order, index),
      title: getString(item.title),
      contentText: getString(item.contentText),
      contentHtml: getString(item.contentHtml),
      assetId: getString(item.assetId),
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
    }];
  }).sort((first, second) => first.order - second.order);
}

function normalizePublicationAttachments(value: unknown): PublicationAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): PublicationAttachment[] => {
    if (!isRecord(item)) return [];
    const id = getString(item.id);
    const kind = normalizePublicationAttachmentKind(item.kind);
    const assetId = getString(item.assetId);
    if (!id || !kind || !assetId) return [];

    return [{
      id,
      kind,
      assetId,
      order: getFiniteNumber(item.order, index),
      slot: normalizePublicationComponentSlot(item.slot),
      alt: getString(item.alt),
      caption: getString(item.caption),
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
    }];
  }).sort((first, second) => first.order - second.order);
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function getFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePublicationPlatformId(value: unknown): PublicationPlatformId | undefined {
  return isOneOf(value, ['telegram', 'vk', 'dzen', 'vc', 'instagram', 'tiktok', 'linkedin']);
}

function normalizePublicationContentUnitId(value: unknown): PublicationContentUnitId | undefined {
  return isOneOf(value, ['telegram-post', 'vk-post', 'dzen-article', 'vc-article', 'instagram-carousel', 'tiktok-video', 'linkedin-post']);
}

function normalizePublicationStatus(value: unknown): PublicationStatus | undefined {
  return isOneOf(value, ['draft', 'ready', 'queued', 'published', 'archived']) ?? 'draft';
}

function normalizePublicationComponentType(value: unknown): PublicationComponentType | undefined {
  return isOneOf(value, ['title', 'lead', 'body', 'caption', 'cta', 'hashtags', 'link', 'image', 'video', 'metadata']);
}

function normalizePublicationComponentSlot(value: unknown): PublicationComponentSlot | undefined {
  return isOneOf(value, ['title', 'lead', 'body', 'caption', 'cta', 'hashtags', 'source', 'cover', 'gallery', 'video', 'metadata']);
}

function normalizePublicationAttachmentKind(value: unknown): PublicationAttachmentKind | undefined {
  return isOneOf(value, ['image', 'video', 'audio']);
}

function isOneOf<const T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
