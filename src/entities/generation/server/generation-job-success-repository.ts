import { and, eq, sql } from 'drizzle-orm';
import type { GenerationJobRepository } from './generation-job-repository-contracts';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { generationJob } from '@/shared/db/schema/generation';

type SucceedInput = Parameters<GenerationJobRepository['succeed']>[0];

export async function succeedGenerationJobRecord(input: SucceedInput) {
  return getDb().transaction(async (transaction) => {
    const [updated] = await transaction.update(generationJob).set({
      status: sql`case when ${generationJob.cancelRequestedAt} is not null
        then 'canceled'::generation_job_status else 'succeeded'::generation_job_status end`,
      retryable: false,
      errorCode: sql`case when ${generationJob.cancelRequestedAt} is not null
        then 'generation_canceled' else null end`,
      errorMessage: sql`case when ${generationJob.cancelRequestedAt} is not null
        then 'Generation was canceled by the user.' else null end`,
      finalAssetId: sql`case when ${generationJob.cancelRequestedAt} is not null
        then null else ${input.finalAssetId}::uuid end`,
      internalCreditsBalanceAfter: input.usage.internalCreditsBalanceAfter === null
        ? generationJob.internalCreditsBalanceAfter
        : input.usage.internalCreditsBalanceAfter,
      leaseExpiresAt: null,
      retryAvailableAt: null,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
    }).where(and(
      eq(generationJob.id, input.id),
      eq(generationJob.status, 'running'),
      eq(generationJob.attemptCount, input.attemptCount),
    )).returning();
    if (!updated) return undefined;
    if (input.finalAssetId && updated.status === 'succeeded') {
      await publishGeneratedAsset(transaction, updated.workspaceId, input);
    }
    return updated;
  });
}

async function publishGeneratedAsset(
  transaction: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  workspaceId: string,
  input: SucceedInput,
) {
  const commonConditions = and(
    eq(asset.id, input.finalAssetId!),
    eq(asset.generationJobId, input.id),
    eq(asset.workspaceId, workspaceId),
    eq(asset.origin, 'generated'),
    eq(asset.status, 'ready'),
  );
  const [published] = await transaction.update(asset).set({
    libraryVisible: true,
    updatedAt: input.finishedAt,
  }).where(and(commonConditions, eq(asset.libraryVisible, false))).returning({ id: asset.id });
  const [alreadyPublished] = published ? [] : await transaction.select({ id: asset.id })
    .from(asset)
    .where(and(commonConditions, eq(asset.libraryVisible, true)))
    .limit(1);
  if (!published && !alreadyPublished) {
    throw new Error('Generated asset could not be atomically published with its job.');
  }
}
