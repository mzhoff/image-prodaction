import { z } from 'zod';
import { isTimelineModel } from '@/shared/api/timeline-models';
import { isUuidV7, isUuid } from '@/shared/lib/id';
import { MAX_TIMELINE_SHOTS, timelineShotSchema } from './timeline-contracts';

const scope = {
  workspaceId: z.string().refine(isUuid), documentId: z.string().refine(isUuid),
  assetId: z.string().refine(isUuidV7), idempotencyKey: z.string().trim().min(1).max(180),
};
export const timelineAnalyzeRequestSchema = z.object({
  ...scope, action: z.literal('analyze'), threshold: z.number().finite().min(1).max(60).default(10),
}).strict();
export const timelineDescribeRequestSchema = z.object({
  ...scope, action: z.literal('describe'), sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  shots: z.array(timelineShotSchema).min(1).max(MAX_TIMELINE_SHOTS),
  model: z.string().refine(isTimelineModel, 'Choose a supported Timeline model.'),
  language: z.string().regex(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,2}$/).default('ru'),
}).strict().superRefine((input, context) => {
  if (new Set(input.shots.map((shot) => shot.id)).size !== input.shots.length) context.addIssue({ code: 'custom', message: 'Shot identifiers must be unique.' });
  const ordered = [...input.shots].sort((a, b) => a.startMs - b.startMs);
  if (ordered.some((shot, index) => index > 0 && shot.startMs < ordered[index - 1]!.endMs)) context.addIssue({ code: 'custom', message: 'Selected shots must not overlap.' });
});
export const timelineRequestSchema = z.discriminatedUnion('action', [timelineAnalyzeRequestSchema, timelineDescribeRequestSchema]);
export type TimelineRequest = z.infer<typeof timelineRequestSchema>;
export type TimelineDescribeRequest = z.infer<typeof timelineDescribeRequestSchema>;
