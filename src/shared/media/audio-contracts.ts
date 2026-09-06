import { z } from 'zod';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 30 * 60;
export const MAX_AUDIO_OUTPUT_BYTES = 128 * 1024 * 1024;
export const AUDIO_CHUNK_SECONDS = 60;
export const audioContainers = ['ogg', 'm4a', 'mp3', 'wav', 'aac', 'flac'] as const;
export type AudioContainer = typeof audioContainers[number];
export const audioMetadataSchema = z.object({
  container: z.enum(audioContainers),
  codec: z.string().min(1).max(40),
  contentType: z.enum(['audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac']),
  durationSeconds: z.number().finite().positive().max(MAX_AUDIO_DURATION_SECONDS),
  sampleRateHz: z.number().int().min(8_000).max(192_000),
  channels: z.number().int().min(1).max(2),
}).strict();
export type AudioMetadata = z.infer<typeof audioMetadataSchema>;
export const audioConvertOptionsSchema = z.object({
  format: z.enum(['mp3', 'wav', 'flac', 'ogg']),
  bitrateKbps: z.union([z.literal(64), z.literal(96), z.literal(128), z.literal(192), z.literal(256), z.literal(320)]).optional(),
  sampleRateHz: z.union([z.literal(16000), z.literal(24000), z.literal(44100), z.literal(48000)]).optional(),
  channels: z.union([z.literal(1), z.literal(2)]).optional(),
}).strict().refine((options) => options.format !== 'ogg' || options.sampleRateHz !== 44100, {
  message: 'Ogg/Opus supports 16, 24 or 48 kHz; select 48 kHz instead of 44.1 kHz.', path: ['sampleRateHz'],
});
export type AudioConvertOptions = z.infer<typeof audioConvertOptionsSchema>;
export interface ValidatedAudio {
  bytes: Uint8Array;
  audio: AudioMetadata;
  byteSize: number;
  checksumSha256: string;
  contentType: AudioMetadata['contentType'];
  extension: AudioContainer;
}
export type ProcessedAudio = ValidatedAudio;
export interface AudioInspectionOptions {
  claimedContentType?: string | null;
  maxBytes?: number;
  maxDurationSeconds?: number;
  signal?: AbortSignal;
}
export interface AudioChunk {
  index: number;
  startSeconds: number;
  endSeconds: number;
  bytes: Uint8Array;
  contentType: 'audio/flac';
}

export class AudioProcessingError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'AudioProcessingError';
  }
}
