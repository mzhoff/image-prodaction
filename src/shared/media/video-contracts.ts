import { z } from 'zod';

/** Pilot limits: bounded uploads, temporary files and decoder work, not provider limits. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_OUTPUT_BYTES = 128 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 30 * 60;
export const MAX_VIDEO_DIMENSION = 4096;
export const videoContainers = ['mp4', 'mov', 'webm'] as const;
export type VideoContainer = typeof videoContainers[number];
export const videoAudioTrackSchema = z.object({
  /** Absolute stream index from ffprobe, never an arbitrary FFmpeg selector. */
  index: z.number().int().min(0).max(31),
  codec: z.string().min(1).max(40),
  channels: z.number().int().min(1).max(8),
  sampleRateHz: z.number().int().min(8000).max(192000),
  durationSeconds: z.number().finite().positive().max(MAX_VIDEO_DURATION_SECONDS).optional(),
  language: z.string().max(40).optional(),
  title: z.string().max(160).optional(),
  isDefault: z.boolean(),
}).strict();
export const videoMetadataSchema = z.object({
  container: z.enum(videoContainers),
  codec: z.enum(['h264', 'hevc', 'mpeg4', 'prores', 'vp8', 'vp9']),
  contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  durationSeconds: z.number().finite().positive().max(MAX_VIDEO_DURATION_SECONDS),
  pictureDurationSeconds: z.number().finite().positive().max(MAX_VIDEO_DURATION_SECONDS).optional(),
  width: z.number().int().positive().max(MAX_VIDEO_DIMENSION),
  height: z.number().int().positive().max(MAX_VIDEO_DIMENSION),
  frameRate: z.number().finite().positive().max(120),
  rotationDegrees: z.number().finite().min(-360).max(360),
  audioTracks: z.array(videoAudioTrackSchema).max(8),
  browserPlayable: z.boolean(),
}).strict();
export type VideoAudioTrack = z.infer<typeof videoAudioTrackSchema>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
/** Normalized bounds in the displayed, autorotated picture; never CSS-only clipping. */
export const videoCropSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().positive().max(1),
  height: z.number().finite().positive().max(1),
}).strict().refine((value) => value.x + value.width <= 1 + Number.EPSILON && value.y + value.height <= 1 + Number.EPSILON, {
  message: 'The crop must stay inside the video picture.',
});
export type VideoCrop = z.infer<typeof videoCropSchema>;
export const videoTrimRangeSchema = z.object({
  startMs: z.number().finite().min(0).max(MAX_VIDEO_DURATION_SECONDS * 1000),
  endMs: z.number().finite().positive().max(MAX_VIDEO_DURATION_SECONDS * 1000),
}).strict().refine((value) => value.endMs > value.startMs, { message: 'Choose a nonempty video interval.', path: ['endMs'] });
export type VideoTrimRange = z.infer<typeof videoTrimRangeSchema>;
export const videoDeriveOptionsSchema = z.object({
  kind: z.enum(['audio', 'video-only', 'preview', 'crop', 'trim']),
  audioTrackIndex: z.number().int().min(0).max(31).optional(),
  crop: videoCropSchema.optional(),
  range: videoTrimRangeSchema.optional(),
}).strict().refine((value) => value.kind !== 'video-only' || value.audioTrackIndex === undefined, {
  message: 'Video without sound does not select an audio track.', path: ['audioTrackIndex'],
}).refine((value) => value.kind === 'crop' ? value.crop !== undefined : value.crop === undefined, {
  message: 'Crop bounds are required only for a video crop.', path: ['crop'],
}).refine((value) => value.kind === 'trim' ? value.range !== undefined : value.range === undefined, {
  message: 'A time range is required only for a video trim.', path: ['range'],
});
export type VideoDeriveOptions = z.infer<typeof videoDeriveOptionsSchema>;
export interface VideoInspectionOptions {
  claimedContentType?: string | null;
  maxBytes?: number;
  maxDurationSeconds?: number;
  signal?: AbortSignal;
}
export interface ValidatedVideo {
  bytes: Uint8Array;
  video: VideoMetadata;
  byteSize: number;
  checksumSha256: string;
  contentType: VideoMetadata['contentType'];
  extension: VideoContainer;
}
export class VideoProcessingError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message); this.name = 'VideoProcessingError'; this.code = code; this.status = status;
  }
}
