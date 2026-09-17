import { z } from 'zod';
import { MAX_TIMELINE_DURATION_MS } from './timeline-contracts';

export const timelineAnalysisProgressSchema = z.object({
  phase: z.enum(['reading', 'indexing', 'detecting', 'finalizing']),
  processedFrames: z.number().int().min(0).max(36_001),
  totalFrames: z.number().int().min(1).max(36_001).nullable(),
  processedMs: z.number().finite().min(0).max(MAX_TIMELINE_DURATION_MS),
  totalMs: z.number().finite().min(0).max(MAX_TIMELINE_DURATION_MS),
  elapsedMs: z.number().finite().min(0).max(20 * 60_000),
  estimatedRemainingMs: z.number().finite().min(0).max(20 * 60_000).nullable(),
}).strict().refine((value) => (value.totalFrames === null || value.processedFrames <= value.totalFrames) && value.processedMs <= value.totalMs, {
  message: 'Processed work cannot exceed the measured source size.',
});
export type TimelineAnalysisProgress = z.infer<typeof timelineAnalysisProgressSchema>;

/** Coalesce native decoder output: one in-flight write, at most one write per second. */
export function createTimelineProgressReporter(callback?: (value: TimelineAnalysisProgress) => Promise<void>, now = Date.now) {
  let pending = Promise.resolve(); let writing = false; let lastWrite = -Infinity; let failure: unknown;
  return {
    update(value: TimelineAnalysisProgress) {
      if (!callback || writing || now() - lastWrite < 1000 || failure) return;
      writing = true; lastWrite = now();
      pending = Promise.resolve().then(() => callback(value)).catch((error: unknown) => { failure = error; }).finally(() => { writing = false; });
    },
    async flush(value: TimelineAnalysisProgress) {
      await pending;
      if (failure) throw failure;
      if (callback) { lastWrite = now(); await callback(value); }
    },
  };
}

/** Chunk boundaries may split JSON/metadata lines. Keep only one bounded unfinished line. */
export function createTimelineLineReader(consume: (line: string) => void) {
  let pending = '';
  return (chunk: string) => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop() ?? '';
    if (pending.length > 4096) pending = '';
    for (const line of lines) consume(line.trim());
  };
}
