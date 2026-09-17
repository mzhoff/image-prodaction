import { z } from 'zod';

export const TIMELINE_VERSION = 1 as const;
export const MAX_TIMELINE_DURATION_MS = 300_000;
export const MAX_TIMELINE_SHOTS = 100;
export const MAX_TIMELINE_FRAMES_PER_SHOT = 5;
export const MAX_TIMELINE_DESCRIPTION_CHARACTERS = 1500;

const time = z.number().finite().min(0).max(MAX_TIMELINE_DURATION_MS);
export const timelineFrameSchema = z.object({ timeMs: time, assetId: z.string().uuid().optional() }).strict();
export const timelineShotSchema = z.object({
  id: z.string().min(1).max(80), startMs: time, endMs: time,
  frames: z.array(timelineFrameSchema).min(1).max(MAX_TIMELINE_FRAMES_PER_SHOT),
  description: z.string().refine((text) => Array.from(text).length <= MAX_TIMELINE_DESCRIPTION_CHARACTERS).default(''),
  describedFingerprint: z.string().max(512).optional(),
}).strict().superRefine((shot, context) => {
  if (shot.endMs <= shot.startMs) context.addIssue({ code: 'custom', message: 'A shot must have a positive duration.' });
  if (shot.frames.some((frame) => frame.timeMs < shot.startMs || frame.timeMs >= shot.endMs)) context.addIssue({ code: 'custom', message: 'Selected frames must be inside their shot.' });
  if (new Set(shot.frames.map((frame) => frame.timeMs)).size !== shot.frames.length) context.addIssue({ code: 'custom', message: 'Selected frames must be distinct.' });
});
export const timelineAnalysisSchema = z.object({
  version: z.literal(TIMELINE_VERSION), sourceAssetId: z.string().uuid(),
  sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i), durationMs: time.positive(),
  /** Actual presentation timestamps, including VFR; never approximate frame stepping using average FPS. */
  frameTimesMs: z.array(time).min(1).max(36_001),
  shots: z.array(timelineShotSchema).min(1).max(MAX_TIMELINE_SHOTS),
}).strict().superRefine((timeline, context) => {
  const frames = new Set(timeline.frameTimesMs);
  if (timeline.frameTimesMs.some((value, index, all) => value >= timeline.durationMs || (index > 0 && value <= all[index - 1]!))) context.addIssue({ code: 'custom', message: 'Frame timestamps must increase within the video.' });
  if (timeline.shots[0]?.startMs !== 0 || timeline.shots.at(-1)?.endMs !== timeline.durationMs
    || timeline.shots.some((shot, index, all) => index > 0 && shot.startMs !== all[index - 1]!.endMs)) context.addIssue({ code: 'custom', message: 'Shots must cover the source once without gaps or overlaps.' });
  if (new Set(timeline.shots.map((shot) => shot.id)).size !== timeline.shots.length) context.addIssue({ code: 'custom', message: 'Shot identifiers must be unique.' });
  if (timeline.shots.some((shot) => (shot.startMs !== 0 && !frames.has(shot.startMs))
    || (shot.endMs !== timeline.durationMs && !frames.has(shot.endMs))
    || shot.frames.some((frame) => !frames.has(frame.timeMs)))) context.addIssue({ code: 'custom', message: 'Shot boundaries and selected stills must use decoded frame timestamps.' });
});
export type TimelineFrame = z.infer<typeof timelineFrameSchema>;
export type TimelineShot = z.infer<typeof timelineShotSchema>;
export type TimelineAnalysis = z.infer<typeof timelineAnalysisSchema>;
export const timelineDescriptionResultSchema = z.object({
  sourceAssetId: z.string().uuid(), sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  shots: z.array(z.object({ id: z.string().min(1).max(80), description: timelineShotSchema.shape.description,
    describedFingerprint: z.string().max(512), frames: z.array(timelineFrameSchema).min(1).max(MAX_TIMELINE_FRAMES_PER_SHOT).optional(),
  }).strict()).max(MAX_TIMELINE_SHOTS),
}).strict();
export type TimelineDescriptionResult = z.infer<typeof timelineDescriptionResultSchema>;

/** Stable editing fingerprint. Model/language are included in paid request keys separately. */
export function timelineShotFingerprint(shot: Pick<TimelineShot, 'id' | 'startMs' | 'endMs' | 'frames'>): string {
  return JSON.stringify([shot.id, shot.startMs, shot.endMs, shot.frames.map((frame) => frame.timeMs).sort((a, b) => a - b)]);
}
