import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { timelineAnalysisProgressSchema, type TimelineAnalysisProgress } from '@/shared/media/timeline-progress';
import type { GenerationJobDto } from '@/entities/generation/server/generation-orchestrator';

export function timelineProgressOwnership(jobId: string, attemptCount: number) {
  return and(eq(generationJob.id, jobId), eq(generationJob.operation, 'timeline_analyze'), eq(generationJob.status, 'running'),
    eq(generationJob.attemptCount, attemptCount), isNull(generationJob.cancelRequestedAt));
}

/** Mutable observation is separate from requestHash and never revives a canceled/old attempt. */
export async function saveTimelineAnalysisProgress(input: { jobId: string; attemptCount: number; value: TimelineAnalysisProgress }) {
  const value = timelineAnalysisProgressSchema.parse(input.value);
  const encoded = JSON.stringify({ attemptCount: input.attemptCount, value });
  const [saved] = await getDb().update(generationJob).set({
    metadata: sql`coalesce(${generationJob.metadata}, '{}'::jsonb) || jsonb_build_object('timelineProgress', ${encoded}::jsonb)`, updatedAt: new Date(),
  }).where(timelineProgressOwnership(input.jobId, input.attemptCount)).returning({ id: generationJob.id });
  if (!saved) throw new Error('Timeline progress lost its active job attempt.');
}

export function readTimelineAnalysisProgress(job: Pick<GenerationJobDto, 'operation' | 'status' | 'attemptCount' | 'metadata'>): TimelineAnalysisProgress | null {
  if (job.operation !== 'timeline_analyze' || job.status === 'queued') return null;
  const stored = job.metadata?.timelineProgress;
  if (!stored || typeof stored !== 'object' || !('attemptCount' in stored) || !('value' in stored) || stored.attemptCount !== job.attemptCount) return null;
  const parsed = timelineAnalysisProgressSchema.safeParse(stored.value);
  return parsed.success ? parsed.data : null;
}
