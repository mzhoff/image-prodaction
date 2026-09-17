import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';
import { longSpeechOptionsSchema, type SpeechOptions } from '@/modules/provider-connections/server/speech-provider-call';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { MAX_SPEECH_CHUNKS, SPEECH_CHUNKING_VERSION, splitSpeechText } from '@/shared/media/speech-text';
import { submitGenerationJob, toPublicGenerationJob } from './generation-submission-service';
import type { QueuedSpeechPayload } from './speech-generation-executor';

export async function submitLongSpeech(input: { userId: string; documentId: string; workspaceId: string; idempotencyKey: string; options: SpeechOptions }) {
  const options = longSpeechOptionsSchema.parse(input.options);
  const chunks = splitSpeechText(options.inputText).filter((chunk) => chunk.text.trim());
  const payload: QueuedSpeechPayload = { workspaceId: input.workspaceId, documentId: input.documentId, options };
  const job = await submitGenerationJob({ userId: input.userId, documentId: input.documentId,
    workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey, modelId: options.model,
    provider: 'openrouter', operation: 'generate_speech_long', maxAttempts: 3,
    metadata: { requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      speechChunkCount: chunks.length, speechChunkingVersion: SPEECH_CHUNKING_VERSION }, payload,
  });
  const asset = job.status === 'succeeded' && job.finalAssetId ? await getAssetMetadata(input.userId, job.finalAssetId) : null;
  return { job: toPublicGenerationJob(job), asset, progress: await getSpeechGenerationProgress(job), statusUrl: `/api/generation-jobs/${job.id}` };
}

/** Read-only projection; progress must never mutate idempotency fingerprint metadata. */
export async function getSpeechGenerationProgress(job: GenerationJobDto) {
  if (job.operation !== 'generate_speech_long') return null;
  const totalParts = Number(job.metadata?.speechChunkCount);
  if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > MAX_SPEECH_CHUNKS) return null;
  const [row] = await getDb().select({ completed: sql<number>`count(*)::int` }).from(generationJob).where(and(
    eq(generationJob.workspaceId, job.workspaceId), eq(generationJob.status, 'succeeded'),
    sql`${generationJob.metadata}->>'speechParentJobId' = ${job.id}`,
  ));
  const completedParts = Math.min(totalParts, Number(row?.completed ?? 0));
  const phase = job.status === 'failed' && job.error?.retryable ? 'queued'
    : job.status === 'running' ? completedParts === totalParts ? 'assembling' : 'generating' : job.status;
  return { completedParts, totalParts, phase };
}
