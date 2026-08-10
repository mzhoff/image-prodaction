import { generationJob } from '@/shared/db/schema/generation';

export type GenerationJobRecord = typeof generationJob.$inferSelect;

export interface NewGenerationJobRecord {
  createdByUserId: string;
  documentId: string | null;
  id: string;
  idempotencyKey: string;
  maxAttempts: number;
  metadata: Record<string, unknown> | null;
  modelId: string;
  operation: string;
  provider: string;
  workspaceId: string;
}

export interface GenerationUsageRecord {
  inputTokens: string | null;
  internalCreditsBalanceAfter: string | null;
  internalCreditsCharged: string | null;
  outputTokens: string | null;
  providerCostUsd: string | null;
  totalTokens: string | null;
}

export interface GenerationJobRepository {
  claimNext(input: { claimedAt: Date; leaseExpiresAt: Date }): Promise<GenerationJobRecord | undefined>;
  createOrFind(input: NewGenerationJobRecord): Promise<{ created: boolean; record: GenerationJobRecord }>;
  fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    finishedAt: Date;
    id: string;
    retryAvailableAt?: Date | null;
    retryable: boolean;
    usage: GenerationUsageRecord;
  }): Promise<GenerationJobRecord | undefined>;
  expireLease(id: string, expiredAt: Date): Promise<GenerationJobRecord | undefined>;
  findAccessible(id: string, userId: string): Promise<GenerationJobRecord | undefined>;
  findById(id: string): Promise<GenerationJobRecord | undefined>;
  heartbeat(input: {
    attemptCount: number;
    heartbeatAt: Date;
    id: string;
    leaseExpiresAt: Date;
  }): Promise<GenerationJobRecord | undefined>;
  start(id: string, startedAt: Date, leaseExpiresAt: Date): Promise<GenerationJobRecord | undefined>;
  succeed(input: {
    attemptCount: number;
    finalAssetId: string | null;
    finishedAt: Date;
    id: string;
    usageComplete: boolean;
    usage: GenerationUsageRecord;
  }): Promise<GenerationJobRecord | undefined>;
}
