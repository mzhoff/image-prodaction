import { z } from 'zod';
import { timelineSnapshotSchema } from './story-timeline';
import { montageAnalysisSchema, montageSlotSchema, musicAnalysisSchema } from './timeline-production';
export const montageResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('grid'), music: musicAnalysisSchema, slots: z.array(montageSlotSchema).max(500) }).strict(),
  z.object({ kind: z.literal('analysis'), analysis: montageAnalysisSchema }).strict(),
  z.object({ kind: z.literal('proposal'), snapshot: timelineSnapshotSchema, slots: z.array(montageSlotSchema).max(500),
    analysis: montageAnalysisSchema.optional(), reasons: z.array(z.object({ slotId: z.string(), reason: z.string() })).max(500) }).strict(),
  z.object({ kind: z.literal('render'), assetId: z.uuid(), durationMs: z.number().positive(), frameRate: z.number().positive() }).strict(),
]);
export type MontageResult = z.infer<typeof montageResultSchema>;
