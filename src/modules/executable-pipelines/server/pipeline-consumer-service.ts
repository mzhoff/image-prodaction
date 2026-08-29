import { and, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import {
  executablePipeline,
  pipelineConsumer,
  pipelineEndpoint,
} from '../adapters/postgres/pipeline-schema';
import type { PipelineConsumerExecutionPolicy } from '../contracts/pipeline-consumer-contracts';

const DEFAULT_EXECUTION_POLICY: PipelineConsumerExecutionPolicy = {
  maxAttempts: 3,
};

export async function ensurePipelineConsumerForEndpoint(input: {
  endpointId: string;
  name: string;
  sourceApplication: string;
}) {
  const name = normalizeConsumerName(input.name);
  const sourceApplication = normalizeSourceApplication(input.sourceApplication);

  return getDb().transaction(async (tx) => {
    const [target] = await tx.select({
      executionPolicy: pipelineEndpoint.executionPolicy,
      pinnedVersionId: pipelineEndpoint.activeVersionId,
      pipelineId: pipelineEndpoint.pipelineId,
    }).from(pipelineEndpoint)
      .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineEndpoint.pipelineId))
      .where(and(
        eq(pipelineEndpoint.id, input.endpointId),
        eq(pipelineEndpoint.enabled, true),
        eq(executablePipeline.status, 'active'),
      ))
      .limit(1);
    if (!target) throw new Error('Active pipeline endpoint was not found.');

    const [existing] = await tx.select({
      id: pipelineConsumer.id,
      pinnedVersionId: pipelineConsumer.pinnedVersionId,
    }).from(pipelineConsumer).where(and(
      eq(pipelineConsumer.pipelineId, target.pipelineId),
      eq(pipelineConsumer.sourceApplication, sourceApplication),
    )).limit(1);
    if (existing) return existing;

    const [created] = await tx.insert(pipelineConsumer).values({
      id: createUuidV7(),
      pipelineId: target.pipelineId,
      pinnedVersionId: target.pinnedVersionId,
      name,
      sourceApplication,
      executionPolicy: normalizeExecutionPolicy(target.executionPolicy),
    }).onConflictDoNothing({
      target: [pipelineConsumer.pipelineId, pipelineConsumer.sourceApplication],
    }).returning({
      id: pipelineConsumer.id,
      pinnedVersionId: pipelineConsumer.pinnedVersionId,
    });
    if (created) return created;

    const [raced] = await tx.select({
      id: pipelineConsumer.id,
      pinnedVersionId: pipelineConsumer.pinnedVersionId,
    }).from(pipelineConsumer).where(and(
      eq(pipelineConsumer.pipelineId, target.pipelineId),
      eq(pipelineConsumer.sourceApplication, sourceApplication),
    )).limit(1);
    if (!raced) throw new Error('Pipeline consumer could not be created or found.');
    return raced;
  });
}

function normalizeExecutionPolicy(value: Record<string, unknown>): PipelineConsumerExecutionPolicy {
  const maxAttempts = value.maxAttempts;
  return {
    ...DEFAULT_EXECUTION_POLICY,
    maxAttempts: Number.isSafeInteger(maxAttempts) && Number(maxAttempts) >= 1 && Number(maxAttempts) <= 10
      ? Number(maxAttempts)
      : DEFAULT_EXECUTION_POLICY.maxAttempts,
  };
}

function normalizeConsumerName(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) throw new Error('Pipeline consumer name is invalid.');
  return normalized;
}

function normalizeSourceApplication(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(normalized)) {
    throw new Error('Source application is invalid.');
  }
  return normalized;
}
