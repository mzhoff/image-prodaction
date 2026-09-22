import { z } from 'zod';
import { isTimelineModel } from '@/shared/api/timeline-models';

export const timelineFpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]);
export const timelinePacingSchema = z.enum(['calm', 'normal', 'dynamic', 'mixed']);
export const timelineAudioClipSchema = z.object({
  id: z.uuid(), assetId: z.uuid(), trackId: z.uuid().optional(), startMs: z.number().int().min(0).max(7_200_000),
  sourceInMs: z.number().int().min(0).max(7_200_000), durationMs: z.number().int().min(100).max(7_200_000),
  gain: z.number().finite().min(0).max(2).default(1),
  role: z.enum(['music', 'voice', 'effect']).optional(),
  linkedVideoClipId: z.uuid().optional(),
  allowSilentTail: z.boolean().optional(),
}).strict();
export const timelineProductionSchema = z.object({
  purpose: z.literal('promo'), brief: z.string().trim().min(1).max(6000),
  targetDurationMs: z.number().int().min(5000).max(180_000), pacing: timelinePacingSchema,
  sourceAssetIds: z.array(z.uuid()).max(20).refine((ids) => new Set(ids).size === ids.length, 'Исходники должны быть уникальными.'),
}).strict();
export const musicAnalysisSchema = z.object({
  version: z.literal(1), assetId: z.uuid(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  sourceInMs: z.number().int().min(0), durationMs: z.number().int().positive().max(180_000),
  bpm: z.number().finite().min(40).max(240).nullable(), confidence: z.number().min(0).max(1),
  beatsMs: z.array(z.number().int().min(0)).max(1500),
  energy: z.array(z.object({ timeMs: z.number().int().min(0), value: z.number().min(0).max(1) }).strict()).max(360),
  method: z.enum(['onset-autocorrelation-v1', 'manual']),
}).strict().refine((v) => v.beatsMs.every((time, index) => time < v.durationMs && (index === 0 || time > v.beatsMs[index - 1]))
  && v.energy.every((p, index) => p.timeMs < v.durationMs && (index === 0 || p.timeMs > v.energy[index - 1].timeMs)), 'Точки музыки должны возрастать внутри её длительности.');
export const montageSourceSchema = z.object({
  id: z.string().min(1).max(120), assetId: z.uuid(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  startMs: z.number().int().min(0), endMs: z.number().int().positive(), description: z.string().min(1).max(1500),
}).strict().refine((v) => v.endMs > v.startMs, 'Неверный диапазон фрагмента.');
export const montageAnalysisSchema = z.object({
  version: z.literal(1), complete: z.boolean(), sources: z.array(montageSourceSchema).max(60),
  completedAssetIds: z.array(z.uuid()).max(20), music: musicAnalysisSchema.nullable(),
}).strict().refine((v) => new Set(v.sources.map((s) => s.id)).size === v.sources.length
  && new Set(v.completedAssetIds).size === v.completedAssetIds.length
  && (!v.complete || (v.music !== null && v.sources.length > 0 && v.sources.every((s) => v.completedAssetIds.includes(s.assetId)))), 'Незавершённый или повторяющийся каталог сцен.');
export const montageSlotSchema = z.object({
  id: z.string().min(1).max(80), startMs: z.number().int().min(0), durationMs: z.number().int().positive(),
  energy: z.number().min(0).max(1), role: z.enum(['opening', 'build', 'climax', 'ending']),
  lockedClipId: z.uuid().optional(),
}).strict();
export const montageSelectionSchema = z.object({
  selections: z.array(z.object({ slotId: z.string(), throughSlotId: z.string().optional(), sourceId: z.string(), sourceInMs: z.number().int().min(0), reason: z.string().min(1).max(500) }).strict()).max(180),
}).strict();
const jobBase = z.object({ idempotencyKey: z.string().min(1).max(120), expectedRevision: z.number().int().min(0) });
const model = z.string().trim().min(1).max(160).refine(isTimelineModel, 'Выберите модель из каталога Timeline.');
export const montageJobRequestSchema = z.discriminatedUnion('action', [
  jobBase.extend({ action: z.literal('render') }).strict(),
  jobBase.extend({ action: z.literal('rhythm'), musicAssetId: z.uuid(), musicSourceInMs: z.number().int().min(0).max(1_800_000).default(0),
    bpm: z.number().min(40).max(240).optional(), beatOffsetMs: z.number().int().min(0).max(6000).default(0), previousGridJobId: z.uuid().optional(),
  }).strict(),
  jobBase.extend({ action: z.literal('analyze'), model,
    musicAssetId: z.uuid(), musicSourceInMs: z.number().int().min(0).max(1_800_000).default(0),
    bpm: z.number().min(40).max(240).optional(), beatOffsetMs: z.number().int().min(0).max(6000).default(0),
    reuseAnalysisJobId: z.uuid().optional(),
  }).strict(),
  jobBase.extend({ action: z.literal('plan'), model, gridJobId: z.uuid(), analysisJobId: z.uuid().optional(), slots: z.array(montageSlotSchema).min(1).max(100).optional(),
  }).strict(),
]);
export type MontageJobRequest = z.infer<typeof montageJobRequestSchema>;
export type MusicAnalysis = z.infer<typeof musicAnalysisSchema>;
export type MontageAnalysis = z.infer<typeof montageAnalysisSchema>;
export type MontageSource = z.infer<typeof montageSourceSchema>;
export type MontageSlot = z.infer<typeof montageSlotSchema>;
export type MontageSelection = z.infer<typeof montageSelectionSchema>;
