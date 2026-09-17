import type { SemanticJsonSchema } from '@/shared/contracts/semantic-contract';
import { MAX_TIMELINE_DESCRIPTION_CHARACTERS, type TimelineAnalysis } from './timeline-contracts';

export type TimelinePublicAsset = { kind: 'video' | 'image'; assetId: string; checksumSha256?: string; mimeType?: string; sizeBytes?: number; contentUrl?: string };
export interface TimelinePublicResult {
  version: 1;
  source: TimelinePublicAsset;
  durationMs: number;
  shots: Array<{ id: string; startMs: number; endMs: number; frameIds: string[]; description: string }>;
  frames: Array<{ id: string; shotId: string; timeMs: number; asset?: TimelinePublicAsset }>;
}

/** Portable document; presentation index and request/recovery fingerprints stay in Studio only. */
export function createTimelinePublicResult(analysis: TimelineAnalysis): TimelinePublicResult {
  return {
    version: 1, source: { kind: 'video', assetId: analysis.sourceAssetId, checksumSha256: analysis.sourceChecksum },
    durationMs: analysis.durationMs,
    shots: analysis.shots.map((shot) => ({ id: shot.id, startMs: shot.startMs, endMs: shot.endMs,
      frameIds: shot.frames.map((frame) => `${shot.id}@${frame.timeMs}`), description: shot.description,
    })),
    frames: analysis.shots.flatMap((shot) => shot.frames.map((frame) => ({
      id: `${shot.id}@${frame.timeMs}`, shotId: shot.id, timeMs: frame.timeMs,
      ...(frame.assetId ? { asset: { kind: 'image' as const, assetId: frame.assetId } } : {}),
    }))),
  };
}

const text = (maxLength: number): SemanticJsonSchema => ({ type: 'string', maxLength });
const time: SemanticJsonSchema = { type: 'number', minimum: 0, maximum: 300_000 };
const assetSchema = (kind: 'image' | 'video'): SemanticJsonSchema => ({
  type: 'object', additionalProperties: false, required: ['kind', 'assetId'], properties: {
    kind: { type: 'string', enum: [kind] }, assetId: text(36), checksumSha256: text(64),
    mimeType: text(120), sizeBytes: { type: 'integer', minimum: 0 }, contentUrl: text(256),
  },
});

/** Shallow normalized frame references fit existing generic runtime JSON limits unchanged. */
export const TIMELINE_PUBLIC_SCHEMA: SemanticJsonSchema = {
  type: 'object', additionalProperties: false, required: ['version', 'source', 'durationMs', 'shots', 'frames'],
  properties: {
    version: { type: 'integer', enum: [1] }, source: assetSchema('video'), durationMs: time,
    shots: { type: 'array', minItems: 1, maxItems: 100, items: {
      type: 'object', additionalProperties: false, required: ['id', 'startMs', 'endMs', 'frameIds', 'description'],
      properties: { id: text(80), startMs: time, endMs: time,
        frameIds: { type: 'array', minItems: 1, maxItems: 5, items: text(160) },
        // Generic schema uses UTF-16 lengths; exact Unicode scalar bound is enforced by Timeline's validator.
        description: text(MAX_TIMELINE_DESCRIPTION_CHARACTERS * 2),
      },
    } },
    frames: { type: 'array', minItems: 1, maxItems: 500, items: {
      type: 'object', additionalProperties: false, required: ['id', 'shotId', 'timeMs'],
      properties: { id: text(160), shotId: text(80), timeMs: time, asset: assetSchema('image') },
    } },
  },
};
