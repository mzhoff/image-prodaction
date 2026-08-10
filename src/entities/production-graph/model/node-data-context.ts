import type { PublicationContentUnitId, PublicationPlatformId } from './publication';
import type { BaseNodeData } from './node-data-image';

export type SubjectType = 'person' | 'character' | 'product' | 'object' | 'vehicle' | 'animal' | 'place';
export type SubjectPreserveStrength = 'strict' | 'balanced' | 'flexible';
export interface SubjectBuilderNodeData extends BaseNodeData {
  identitySummary: string;
  immutableTraits: string;
  libraryImageAssetIds?: string[];
  librarySubjectId?: string;
  libraryUpdatedAt?: string;
  message?: string;
  mutableAttributes: string;
  name: string;
  negativeConstraints: string;
  notes: string;
  preserveStrength: SubjectPreserveStrength;
  referenceModel?: string;
  referenceGenerationBatchPending?: boolean;
  referenceGenerationRequests?: Record<string, { fingerprint: string; idempotencyKey: string; jobId?: string }>;
  editGenerationRequests?: Record<string, { fingerprint: string; idempotencyKey: string }>;
  result?: string;
  sourceCount?: number;
  subjectType: SubjectType;
}

export interface SubjectRecord {
  id: string; createdAt: string; identitySummary: string; imageAssetIds: string[];
  immutableTraits: string; mutableAttributes: string; name: string; negativeConstraints: string;
  notes: string; passportText: string; preserveStrength: SubjectPreserveStrength;
  sourceNodeId?: string; subjectType: SubjectType; title: string; updatedAt: string;
}

export type LocationType = 'interior' | 'exterior' | 'urban' | 'nature' | 'studio' | 'abstract';
export type LocationPreserveStrength = 'strict' | 'balanced' | 'flexible';
export interface LocationBuilderNodeData extends BaseNodeData {
  atmosphere: string; description: string; libraryImageAssetIds?: string[];
  libraryLocationId?: string; libraryUpdatedAt?: string; locationType: LocationType;
  message?: string; mutableAttributes: string; name: string; negativeConstraints: string;
  notes: string; preserveStrength: LocationPreserveStrength; result?: string;
  sourceCount?: number; spatialLayout: string;
}

export interface LocationRecord {
  id: string; atmosphere: string; createdAt: string; description: string; imageAssetIds: string[];
  locationType: LocationType; mutableAttributes: string; name: string; negativeConstraints: string;
  notes: string; passportText: string; preserveStrength: LocationPreserveStrength;
  sourceNodeId?: string; spatialLayout: string; title: string; updatedAt: string;
}

export interface TelegramPublicationNodeData extends BaseNodeData {
  artifactId?: string;
  contentUnitId: PublicationContentUnitId;
  body?: string;
  caption?: string;
  cta?: string;
  mediaInputCount?: number;
  mediaOrder: string[];
  message?: string;
  messageRichText?: string;
  messageRichTextSource?: string;
  messageSourceText?: string;
  messageText: string;
  platformId: PublicationPlatformId;
  publicationTitle?: string;
  result?: string;
  sourceImageCount?: number;
  sourceTextCount?: number;
}
