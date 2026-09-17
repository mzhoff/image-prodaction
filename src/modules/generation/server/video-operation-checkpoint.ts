import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import type { VideoProviderDiagnostic } from '@/modules/provider-connections/contracts/video-provider';

export async function saveVideoProviderDiagnostic(input: {
  jobId: string; attemptCount: number; stage: 'submit' | 'poll'; diagnostic: VideoProviderDiagnostic;
}) {
  const evidence = JSON.stringify({ ...input.diagnostic, stage: input.stage, recordedAt: new Date().toISOString() });
  await getDb().update(generationJob).set({
    metadata: sql`coalesce(${generationJob.metadata}, '{}'::jsonb) || jsonb_build_object('videoProviderDiagnostic', ${evidence}::jsonb)`,
    updatedAt: new Date(),
  }).where(and(eq(generationJob.id, input.jobId), eq(generationJob.operation, 'generate_video'),
    eq(generationJob.attemptCount, input.attemptCount), eq(generationJob.status, 'running')));
}

/** Preserve the accepted paid operation even if the user canceled while POST was in flight.
 * This is an audit checkpoint only: it cannot clear cancellation or revive a job. */
export async function saveAcceptedVideoOperationId(input: { jobId: string; attemptCount: number; providerOperationId: string }) {
  const [saved] = await getDb().update(generationJob).set({ providerOperationId: input.providerOperationId, updatedAt: new Date() })
    .where(and(eq(generationJob.id, input.jobId), eq(generationJob.operation, 'generate_video'),
      eq(generationJob.providerDispatchedAttempt, input.attemptCount), isNull(generationJob.providerOperationId)))
    .returning({ id: generationJob.id });
  if (!saved) throw new Error('Accepted video operation could not be checkpointed.');
}
