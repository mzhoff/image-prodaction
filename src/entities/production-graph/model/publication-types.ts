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
