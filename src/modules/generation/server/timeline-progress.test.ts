import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { hasSameIdempotencyFingerprint } from '@/entities/generation/server/generation-normalization';
import { createTimelineLineReader, createTimelineProgressReporter, type TimelineAnalysisProgress } from '@/shared/media/timeline-progress';
import { timelineRequestSchema } from '@/shared/media/timeline-request';
import { readTimelineAnalysisProgress, timelineProgressOwnership } from './timeline-progress-store';

const progress: TimelineAnalysisProgress = { phase: 'detecting', processedFrames: 20, totalFrames: 40, processedMs: 2000, totalMs: 4000, elapsedMs: 1500, estimatedRemainingMs: 1000 };
test('progress projection rejects prior attempts and malformed values; write predicate owns operation, attempt and cancellation', () => {
  const job = { operation: 'timeline_analyze', status: 'running' as const, attemptCount: 2, metadata: { timelineProgress: { attemptCount: 2, value: progress } } };
  assert.deepEqual(readTimelineAnalysisProgress(job), progress);
  assert.equal(readTimelineAnalysisProgress({ ...job, attemptCount: 3 }), null);
  assert.equal(readTimelineAnalysisProgress({ ...job, status: 'queued' }), null);
  assert.equal(readTimelineAnalysisProgress({ ...job, metadata: { timelineProgress: { attemptCount: 2, value: { ...progress, processedFrames: Infinity } } } }), null);
  const query = new PgDialect().sqlToQuery(timelineProgressOwnership('job', 2)!);
  assert.deepEqual(query.params, ['job', 'timeline_analyze', 'running', 2]); assert.match(query.sql, /cancel_requested_at" is null/);
});

test('server progress leaves immutable timeline fingerprint intact without exempting other settings or operations', () => {
  const input = { createdByUserId: 'user', documentId: null, maxAttempts: 2, metadata: { requestHash: 'hash', timelineVersion: 1 }, modelId: 'ffmpeg-scdet-v1', operation: 'timeline_analyze', provider: 'local' };
  const record = { ...input, metadata: { ...input.metadata, timelineProgress: { attemptCount: 1, value: progress } } } as unknown as Parameters<typeof hasSameIdempotencyFingerprint>[0];
  assert.equal(hasSameIdempotencyFingerprint(record, input), true);
  assert.equal(hasSameIdempotencyFingerprint(record, { ...input, metadata: { ...input.metadata, requestHash: 'changed' } }), false);
  assert.equal(hasSameIdempotencyFingerprint({ ...record, operation: 'generate_video' }, { ...input, operation: 'generate_video' }), false);
  assert.equal('timelineProgress' in input.metadata, false);
  assert.equal(timelineRequestSchema.safeParse({ action: 'analyze', workspaceId: '019f0000-0000-7000-8000-000000000001', documentId: '019f0000-0000-7000-8000-000000000002', assetId: '019f0000-0000-7000-8000-000000000003', threshold: 10, idempotencyKey: 'logical', timelineProgress: progress }).success, false);
});

test('decoder progress coalesces writes, flushes final counts, and carries errors without unhandled promises', async () => {
  let now = 0; const values: TimelineAnalysisProgress[] = []; let release!: () => void;
  const reporter = createTimelineProgressReporter(async (value) => { values.push(value); if (values.length === 1) await new Promise<void>((resolve) => { release = resolve; }); }, () => now);
  reporter.update(progress); await Promise.resolve();
  for (let i = 0; i < 100; i++) reporter.update({ ...progress, processedFrames: 21 });
  assert.equal(values.length, 1); release();
  await reporter.flush({ ...progress, phase: 'finalizing', processedFrames: 40 });
  now = 500; reporter.update(progress); assert.equal(values.length, 2);
  const failed = createTimelineProgressReporter(async () => { throw new Error('lost lease'); }); failed.update(progress);
  await assert.rejects(failed.flush(progress), /lost lease/);
});

test('chunked native output lines are reconstructed once for exact frame counters', () => {
  const lines: string[] = []; const read = createTimelineLineReader((line) => lines.push(line));
  read('frame:12 pts_'); read('time:1.2\nscore='); read('10\nframe:13\n');
  assert.deepEqual(lines, ['frame:12 pts_time:1.2', 'score=10', 'frame:13']);
});
