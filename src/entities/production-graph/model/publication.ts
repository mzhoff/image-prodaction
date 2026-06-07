export type PublicationPlatformId =
  | 'telegram'
  | 'vk'
  | 'dzen'
  | 'vc'
  | 'instagram'
  | 'tiktok'
  | 'linkedin';

export type PublicationContentUnitId =
  | 'telegram-post'
  | 'vk-post'
  | 'dzen-article'
  | 'vc-article'
  | 'instagram-carousel'
  | 'tiktok-video'
  | 'linkedin-post';

export type PublicationFormatId =
  | 'post'
  | 'article'
  | 'carousel'
  | 'short-video'
  | 'video';

export type PublicationComponentType =
  | 'title'
  | 'lead'
  | 'body'
  | 'caption'
  | 'cta'
  | 'hashtags'
  | 'link'
  | 'image'
  | 'video'
  | 'metadata';

export type PublicationComponentSlot =
  | 'title'
  | 'lead'
  | 'body'
  | 'caption'
  | 'cta'
  | 'hashtags'
  | 'source'
  | 'cover'
  | 'gallery'
  | 'video'
  | 'metadata';

export type PublicationAttachmentKind = 'image' | 'video' | 'audio';
export type PublicationStatus = 'draft' | 'ready' | 'queued' | 'published' | 'archived';
export type PublicationValidationSeverity = 'info' | 'warning' | 'error';
export type PublicationValidationStatus = 'empty' | 'ready' | 'warning' | 'error';

export interface PublicationComponent {
  id: string;
  type: PublicationComponentType;
  slot: PublicationComponentSlot;
  order: number;
  title?: string;
  contentText?: string;
  contentHtml?: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
}

export interface PublicationAttachment {
  id: string;
  kind: PublicationAttachmentKind;
  assetId: string;
  order: number;
  slot?: PublicationComponentSlot;
  alt?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
}

export interface PublicationArtifact {
  id: string;
  platformId: PublicationPlatformId;
  contentUnitId: PublicationContentUnitId;
  status: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  title?: string;
  summary?: string;
  contentPlain?: string;
  contentHtml?: string;
  sourceNodeId?: string;
  sourceSectionId?: string;
  kanbanCardId?: string;
  components: PublicationComponent[];
  attachments: PublicationAttachment[];
  metadata?: Record<string, unknown>;
}

export interface PublicationSlotDefinition {
  id: PublicationComponentSlot;
  label: string;
  accepts: PublicationComponentType[];
  required?: boolean;
}

export type PublicationConstraint =
  | PublicationTextLengthConstraint
  | PublicationMediaCountConstraint
  | PublicationHashtagConstraint
  | PublicationRequiredConstraint;

export interface PublicationTextLengthConstraint {
  kind: 'text-length';
  field: 'title' | 'lead' | 'body' | 'caption';
  label: string;
  max?: number;
  recommendedMin?: number;
  recommendedMax?: number;
  severity?: PublicationValidationSeverity;
  note?: string;
}

export interface PublicationMediaCountConstraint {
  kind: 'media-count';
  mediaKind: 'image' | 'video';
  label: string;
  max?: number;
  min?: number;
  severity?: PublicationValidationSeverity;
  note?: string;
}

export interface PublicationHashtagConstraint {
  kind: 'hashtag-count';
  label: string;
  max?: number;
  recommendedMin?: number;
  recommendedMax?: number;
  severity?: PublicationValidationSeverity;
  note?: string;
}

export interface PublicationRequiredConstraint {
  kind: 'required';
  field: 'title' | 'lead' | 'body' | 'caption' | 'image' | 'video';
  label: string;
  severity?: PublicationValidationSeverity;
  note?: string;
}

export interface PublicationContentUnitDefinition {
  id: PublicationContentUnitId;
  platformId: PublicationPlatformId;
  formatId: PublicationFormatId;
  name: string;
  description: string;
  slots: PublicationSlotDefinition[];
  constraints: PublicationConstraint[];
  generationHints?: string[];
}

export interface PublicationPlatformDefinition {
  id: PublicationPlatformId;
  name: string;
  shortName: string;
  color: string;
  description: string;
  contentUnitIds: PublicationContentUnitId[];
  autoposting: 'ready' | 'api-review' | 'manual-copy';
}

export interface PublicationArtifactMetrics {
  titleLength: number;
  leadLength: number;
  bodyLength: number;
  captionLength: number;
  textLength: number;
  imageCount: number;
  videoCount: number;
  hashtagCount: number;
}

export interface PublicationValidationIssue {
  id: string;
  severity: PublicationValidationSeverity;
  code: string;
  message: string;
  field?: string;
  current?: number;
  limit?: number;
  recommendation?: string;
}

export interface PublicationValidationReport {
  status: PublicationValidationStatus;
  metrics: PublicationArtifactMetrics;
  issues: PublicationValidationIssue[];
}

export function createPublicationArtifact(input: {
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
}): PublicationArtifact {
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

export function getPublicationMetrics(artifact: PublicationArtifact): PublicationArtifactMetrics {
  const title = getPublicationFieldText(artifact, 'title');
  const lead = getPublicationFieldText(artifact, 'lead');
  const body = getPublicationFieldText(artifact, 'body');
  const caption = getPublicationFieldText(artifact, 'caption');
  const allText = [title, lead, body, caption, artifact.summary].filter(Boolean).join('\n');

  return {
    titleLength: countCharacters(title),
    leadLength: countCharacters(lead),
    bodyLength: countCharacters(body),
    captionLength: countCharacters(caption),
    textLength: countCharacters(allText),
    imageCount: countMedia(artifact, 'image'),
    videoCount: countMedia(artifact, 'video'),
    hashtagCount: extractHashtags(allText).length,
  };
}

export function validatePublicationArtifact(
  artifact: PublicationArtifact,
  definition: PublicationContentUnitDefinition,
): PublicationValidationReport {
  const metrics = getPublicationMetrics(artifact);
  const issues = definition.constraints.flatMap((constraint, index) => validateConstraint(artifact, metrics, constraint, index));
  const hasContent = metrics.textLength > 0 || metrics.imageCount > 0 || metrics.videoCount > 0;
  const status = !hasContent
    ? 'empty'
    : issues.some((issue) => issue.severity === 'error')
      ? 'error'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : 'ready';

  return { status, metrics, issues };
}

export function getPublicationFieldText(
  artifact: PublicationArtifact,
  field: 'title' | 'lead' | 'body' | 'caption',
) {
  if (field === 'title' && artifact.title?.trim()) return artifact.title.trim();
  if (field === 'body' && artifact.contentPlain?.trim()) return artifact.contentPlain.trim();

  const slotText = artifact.components
    .filter((component) => component.slot === field && component.contentText?.trim())
    .sort((first, second) => first.order - second.order)
    .map((component) => component.contentText?.trim() ?? '')
    .join('\n\n')
    .trim();
  if (slotText) return slotText;

  if (field === 'caption') {
    return artifact.attachments
      .map((attachment) => attachment.caption?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  return '';
}

function validateConstraint(
  artifact: PublicationArtifact,
  metrics: PublicationArtifactMetrics,
  constraint: PublicationConstraint,
  index: number,
): PublicationValidationIssue[] {
  if (constraint.kind === 'text-length') {
    return validateTextLength(metrics, constraint, index);
  }

  if (constraint.kind === 'media-count') {
    return validateMediaCount(metrics, constraint, index);
  }

  if (constraint.kind === 'hashtag-count') {
    return validateHashtagCount(metrics, constraint, index);
  }

  return validateRequired(artifact, metrics, constraint, index);
}

function validateTextLength(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationTextLengthConstraint,
  index: number,
): PublicationValidationIssue[] {
  const current = getTextMetric(metrics, constraint.field);
  const issues: PublicationValidationIssue[] = [];
  if (typeof constraint.max === 'number' && current > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.field, index, 'max'),
      severity: constraint.severity ?? 'error',
      code: 'text-too-long',
      field: constraint.field,
      current,
      limit: constraint.max,
      message: `${constraint.label}: ${current} characters, limit ${constraint.max}.`,
    });
  }

  if (
    current > 0
    && typeof constraint.recommendedMin === 'number'
    && typeof constraint.recommendedMax === 'number'
    && (current < constraint.recommendedMin || current > constraint.recommendedMax)
  ) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.field, index, 'recommended'),
      severity: 'info',
      code: 'text-outside-recommended-range',
      field: constraint.field,
      current,
      recommendation: `${constraint.recommendedMin}-${constraint.recommendedMax} characters`,
      message: `${constraint.label}: recommended range is ${constraint.recommendedMin}-${constraint.recommendedMax} characters.`,
    });
  }

  return issues;
}

function validateMediaCount(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationMediaCountConstraint,
  index: number,
): PublicationValidationIssue[] {
  const current = constraint.mediaKind === 'image' ? metrics.imageCount : metrics.videoCount;
  const issues: PublicationValidationIssue[] = [];

  if (typeof constraint.min === 'number' && current < constraint.min) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.mediaKind, index, 'min'),
      severity: constraint.severity ?? 'warning',
      code: 'media-too-few',
      field: constraint.mediaKind,
      current,
      limit: constraint.min,
      message: `${constraint.label}: at least ${constraint.min} required.`,
    });
  }

  if (typeof constraint.max === 'number' && current > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.mediaKind, index, 'max'),
      severity: constraint.severity ?? 'error',
      code: 'media-too-many',
      field: constraint.mediaKind,
      current,
      limit: constraint.max,
      message: `${constraint.label}: ${current} attached, limit ${constraint.max}.`,
    });
  }

  return issues;
}

function validateHashtagCount(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationHashtagConstraint,
  index: number,
): PublicationValidationIssue[] {
  const issues: PublicationValidationIssue[] = [];
  if (typeof constraint.max === 'number' && metrics.hashtagCount > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, 'hashtags', index, 'max'),
      severity: constraint.severity ?? 'warning',
      code: 'hashtags-too-many',
      field: 'hashtags',
      current: metrics.hashtagCount,
      limit: constraint.max,
      message: `${constraint.label}: ${metrics.hashtagCount} hashtags, limit ${constraint.max}.`,
    });
  }

  if (
    metrics.hashtagCount > 0
    && typeof constraint.recommendedMin === 'number'
    && typeof constraint.recommendedMax === 'number'
    && (metrics.hashtagCount < constraint.recommendedMin || metrics.hashtagCount > constraint.recommendedMax)
  ) {
    issues.push({
      id: makeIssueId(constraint.kind, 'hashtags', index, 'recommended'),
      severity: 'info',
      code: 'hashtags-outside-recommended-range',
      field: 'hashtags',
      current: metrics.hashtagCount,
      recommendation: `${constraint.recommendedMin}-${constraint.recommendedMax} hashtags`,
      message: `${constraint.label}: recommended range is ${constraint.recommendedMin}-${constraint.recommendedMax}.`,
    });
  }

  return issues;
}

function validateRequired(
  artifact: PublicationArtifact,
  metrics: PublicationArtifactMetrics,
  constraint: PublicationRequiredConstraint,
  index: number,
): PublicationValidationIssue[] {
  const hasValue = constraint.field === 'image'
    ? metrics.imageCount > 0
    : constraint.field === 'video'
      ? metrics.videoCount > 0
      : getPublicationFieldText(artifact, constraint.field).length > 0;

  if (hasValue) return [];
  return [{
    id: makeIssueId(constraint.kind, constraint.field, index, 'required'),
    severity: constraint.severity ?? 'warning',
    code: 'required-field-empty',
    field: constraint.field,
    message: `${constraint.label}: required content is missing.`,
  }];
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

function getTextMetric(metrics: PublicationArtifactMetrics, field: PublicationTextLengthConstraint['field']) {
  if (field === 'title') return metrics.titleLength;
  if (field === 'lead') return metrics.leadLength;
  if (field === 'caption') return metrics.captionLength;
  return metrics.bodyLength;
}

function countMedia(artifact: PublicationArtifact, kind: 'image' | 'video') {
  const attachmentCount = artifact.attachments.filter((attachment) => attachment.kind === kind).length;
  const componentCount = artifact.components.filter((component) => component.type === kind && Boolean(component.assetId)).length;
  return attachmentCount + componentCount;
}

function countCharacters(value: string) {
  return Array.from(value.trim()).length;
}

function extractHashtags(value: string) {
  return Array.from(new Set(value.match(/#[\p{L}\p{N}_-]+/gu) ?? []));
}

function makeIssueId(kind: string, field: string, index: number, suffix: string) {
  return `${kind}-${field}-${index}-${suffix}`;
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
