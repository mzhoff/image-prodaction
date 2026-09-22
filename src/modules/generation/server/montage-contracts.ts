import { createHash } from 'node:crypto';
import { z } from 'zod';
import { timelineSnapshotSchema, type TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { montageAnalysisSchema, montageJobRequestSchema, montageSlotSchema, musicAnalysisSchema } from '@/modules/story-projects/contracts/timeline-production';

export const montagePayloadSchema = z.object({
  version: z.literal(1), userId: z.string().min(1), workspaceId: z.uuid(), timelineId: z.uuid(),
  name: z.string().min(1).max(120), revision: z.number().int().min(0), snapshot: timelineSnapshotSchema,
  request: montageJobRequestSchema, checksums: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  analysis: montageAnalysisSchema.optional(), slots: z.array(montageSlotSchema).max(500).optional(), music: musicAnalysisSchema.optional(),
}).strict();
export type MontagePayload = z.infer<typeof montagePayloadSchema>;
export { montageResultSchema, type MontageResult } from '@/modules/story-projects/contracts/timeline-production-result';
// Zod and JSONB may reorder object keys. A job fingerprint must survive both.
export const montageHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item)).digest('hex');
export function analysisBasis(snapshot: TimelineSnapshot) {
  return montageHash(snapshot.production?.sourceAssetIds);
}
