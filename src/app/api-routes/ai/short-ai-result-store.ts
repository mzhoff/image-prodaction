import { and, eq, isNull } from 'drizzle-orm';
import { createGenerationPayloadStore } from '@/modules/generation';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';

export async function saveShortAiResultCheckpoint(input: {
  attemptCount: number;
  jobId: string;
  payload: unknown;
  providerOperationId: string | null;
  workspaceId: string;
}) {
  const payloadStore = createGenerationPayloadStore();
  const writeInput = {
    attemptCount: input.attemptCount,
    jobId: input.jobId,
    kind: 'result' as const,
    payload: {
      attemptCount: input.attemptCount,
      result: input.payload,
      version: 1,
    },
    workspaceId: input.workspaceId,
  };
  let resultObjectKey: string;
  try {
    resultObjectKey = await payloadStore.write(writeInput);
  } catch {
    resultObjectKey = await payloadStore.write(writeInput);
  }

  const update = async () => {
    const [updated] = await getDb().update(generationJob).set({
      providerOperationId: input.providerOperationId,
      resultObjectKey,
      updatedAt: new Date(),
    }).where(and(
      eq(generationJob.id, input.jobId),
      eq(generationJob.status, 'running'),
      eq(generationJob.attemptCount, input.attemptCount),
      isNull(generationJob.cancelRequestedAt),
    )).returning({ id: generationJob.id });
    if (!updated) throw new Error('Short AI result checkpoint lost its job ownership.');
  };
  try {
    await update();
  } catch {
    await update();
  }
}

export async function markShortAiProviderDispatched(input: {
  attemptCount: number;
  jobId: string;
}) {
  const now = new Date();
  const [updated] = await getDb().update(generationJob).set({
    providerDispatchedAt: now,
    providerDispatchedAttempt: input.attemptCount,
    updatedAt: now,
  }).where(and(
    eq(generationJob.id, input.jobId),
    eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, input.attemptCount),
    isNull(generationJob.cancelRequestedAt),
    isNull(generationJob.providerDispatchedAt),
  )).returning({ id: generationJob.id });
  if (!updated) throw new Error('Short AI job lost ownership before provider dispatch.');
}

export async function readShortAiResultCheckpoint(resultObjectKey: string) {
  const value = await createGenerationPayloadStore().read<unknown>(resultObjectKey);
  if (
    !value
    || typeof value !== 'object'
    || !('version' in value)
    || value.version !== 1
    || !('result' in value)
  ) {
    throw new Error('Short AI result checkpoint is invalid.');
  }
  return value.result;
}
