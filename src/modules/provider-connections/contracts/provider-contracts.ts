import type {
  ProviderErrorClassificationContext,
  ProviderErrorDescriptor,
} from './provider-error-contracts';

export const PROVIDER_MODALITIES = ['text', 'image', 'audio'] as const;

export type ProviderModality = typeof PROVIDER_MODALITIES[number];
export type ProviderMessageRole = 'system' | 'user' | 'assistant';
export type ProviderOperationState = 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
export type ProviderSafeMetadataValue = boolean | number | string | null;
export type ProviderSafeMetadata = Record<string, ProviderSafeMetadataValue>;

export interface ProviderTextPart {
  modality: 'text';
  text: string;
}

export interface ProviderImagePart {
  data?: string;
  mediaType?: string;
  modality: 'image';
  url?: string;
}

export interface ProviderAudioPart {
  data?: string;
  format?: string;
  mediaType?: string;
  modality: 'audio';
  url?: string;
}

export type ProviderMessagePart = ProviderTextPart | ProviderImagePart | ProviderAudioPart;

export interface ProviderMessage {
  parts: ProviderMessagePart[];
  role: ProviderMessageRole;
}

export interface ProviderImageParameters {
  aspectRatio?: string;
  size?: string;
}

export interface ProviderRequestParameters {
  image?: ProviderImageParameters;
  maxOutputTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  temperature?: number;
}

export interface ProviderExecuteRequest {
  expectedOutputModalities: ProviderModality[];
  messages: ProviderMessage[];
  metadata?: ProviderSafeMetadata;
  modelId: string;
  operation: string;
  parameters?: ProviderRequestParameters;
}

export interface ProviderTextOutput {
  modality: 'text';
  text: string;
}

export interface ProviderImageOutput {
  data?: string;
  mediaType?: string;
  modality: 'image';
  url?: string;
}

export interface ProviderAudioOutput {
  data?: string;
  format?: string;
  mediaType?: string;
  modality: 'audio';
  url?: string;
}

export type ProviderOutput = ProviderTextOutput | ProviderImageOutput | ProviderAudioOutput;

export interface ProviderUsage {
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  complete: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  providerCostUsd: string | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

export interface ProviderResult {
  metadata: ProviderSafeMetadata;
  modelId: string;
  outputs: ProviderOutput[];
  provider: string;
  providerOperationId: string | null;
  usage: ProviderUsage;
}

export interface ProviderCredentialSummary {
  isFreeTier: boolean | null;
  label: string | null;
  limitRemainingUsd: string | null;
  limitReset: string | null;
  limitUsd: string | null;
  usageDailyUsd: string | null;
  usageMonthlyUsd: string | null;
  usageTotalUsd: string | null;
  usageWeeklyUsd: string | null;
}

export interface ProviderModel {
  id: string;
  inputModalities: ProviderModality[];
  name: string;
  outputModalities: ProviderModality[];
}

export interface ProviderOperationStatus {
  error: ProviderErrorDescriptor | null;
  modelId: string | null;
  providerOperationId: string;
  state: ProviderOperationState;
  usage: ProviderUsage;
}

export interface ProviderCallContext {
  credential: string;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  readonly provider: string;
  classifyError(
    error: unknown,
    context?: ProviderErrorClassificationContext,
  ): ProviderErrorDescriptor;
  execute(
    request: ProviderExecuteRequest,
    context: ProviderCallContext,
  ): Promise<ProviderResult>;
  getCredentialSummary(context: ProviderCallContext): Promise<ProviderCredentialSummary>;
  getOperationStatus(
    providerOperationId: string,
    context: ProviderCallContext,
  ): Promise<ProviderOperationStatus>;
  listModels(context: ProviderCallContext): Promise<ProviderModel[]>;
  normalizeUsage(rawUsage: unknown): ProviderUsage;
  validateCredential(context: ProviderCallContext): Promise<ProviderCredentialSummary>;
}

export const EMPTY_PROVIDER_USAGE: ProviderUsage = {
  cacheReadTokens: null,
  cacheWriteTokens: null,
  complete: false,
  inputTokens: null,
  outputTokens: null,
  providerCostUsd: null,
  reasoningTokens: null,
  totalTokens: null,
};
