import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { runAudioProgram } from './audio-process';
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS, MAX_VIDEO_OUTPUT_BYTES, videoMetadataSchema, VideoProcessingError, type ValidatedVideo, type VideoContainer, type VideoInspectionOptions, type VideoMetadata } from './video-contracts';

type ProbeStream = {
  index?: number; codec_type?: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string;
  duration?: string; avg_frame_rate?: string; r_frame_rate?: string; channels?: number; sample_rate?: string;
  tags?: { language?: string; title?: string; rotate?: string }; disposition?: { attached_pic?: number; default?: number };
  side_data_list?: { rotation?: number }[];
};
const types = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' } as const;
const videoCodecs = { mp4: ['h264', 'hevc', 'mpeg4'], mov: ['h264', 'hevc', 'mpeg4', 'prores'], webm: ['vp8', 'vp9'] };
const audioCodecs = { mp4: ['aac', 'mp3', 'alac', 'opus', 'ac3', 'eac3'], mov: ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'ac3'], webm: ['opus', 'vorbis'] };

export function detectVideoContainer(bytes: Uint8Array): VideoContainer {
  const header = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 4096));
  if (header.length < 16) throw new VideoProcessingError('unsupported_video', 'A nonempty MP4, MOV or WebM video is required.', 415);
  if (header.toString('ascii', 4, 8) === 'ftyp') {
    const brand = header.toString('ascii', 8, 12);
    if (brand === 'qt  ') return 'mov';
    if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'MSNV', 'dash'].includes(brand)) return 'mp4';
  }
  if (header.readUInt32BE(0) === 0x1a45dfa3 && header.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))) return 'webm';
  throw new VideoProcessingError('unsupported_video', 'Supported video containers: MP4, MOV and WebM.', 415);
}

export function validateVideoEnvelope(bytes: Uint8Array, options: VideoInspectionOptions = {}) {
  const limit = Math.min(options.maxBytes ?? MAX_VIDEO_BYTES, MAX_VIDEO_OUTPUT_BYTES);
  if (!Number.isSafeInteger(limit) || limit < 1 || bytes.byteLength < 1 || bytes.byteLength > limit) throw new VideoProcessingError('file_too_large', 'Video must be nonempty and within the configured byte limit.', 413);
  const container = detectVideoContainer(bytes);
  const claimed = options.claimedContentType?.split(';')[0]?.trim().toLowerCase();
  const aliases: Record<string, VideoContainer> = { 'video/mp4': 'mp4', 'video/x-m4v': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
  if (claimed && claimed !== 'application/octet-stream' && aliases[claimed] !== container) throw new VideoProcessingError('content_type_mismatch', 'The declared video type does not match its contents.', 415);
  return container;
}

export function videoInputArguments(container: VideoContainer, source: string) {
  return ['-protocol_whitelist', 'file,pipe', '-max_alloc', '67108864', '-probesize', '8388608', '-analyzeduration', '15000000', '-threads', '1',
    ...(container !== 'webm' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-f', container === 'webm' ? 'matroska' : 'mov', '-i', source];
}

export function parseVideoProbe(probe: { streams?: ProbeStream[]; format?: { duration?: string } }, container: VideoContainer, maximum = MAX_VIDEO_DURATION_SECONDS): VideoMetadata {
  if (!Array.isArray(probe.streams) || probe.streams.length > 16) throw new VideoProcessingError('unsupported_video_streams', 'Video must contain one picture stream and at most eight audio tracks.');
  const videos = probe.streams.filter((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
  const audios = probe.streams.filter((stream) => stream.codec_type === 'audio');
  if (videos.length !== 1 || probe.streams.filter((stream) => stream.codec_type === 'video').length !== 1 || audios.length > 8) throw new VideoProcessingError('unsupported_video_streams', 'Video must contain one picture stream and at most eight audio tracks.');
  const picture = videos[0]!;
  if (!videoCodecs[container].includes(picture.codec_name ?? '') || audios.some((track) => !audioCodecs[container].includes(track.codec_name ?? ''))) throw new VideoProcessingError('unsupported_video_codec', 'This codec is not supported in the selected video container.', 415);
  const duration = Math.max(Number(probe.format?.duration) || 0, ...[picture, ...audios].map((stream) => Number(stream.duration) || 0));
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(duration) || duration <= 0 || duration > Math.min(maximum, MAX_VIDEO_DURATION_SECONDS)) throw new VideoProcessingError('video_duration_limit', 'Video duration must be known and at most 30 minutes.');
  const rate = (picture.avg_frame_rate && picture.avg_frame_rate !== '0/0' ? picture.avg_frame_rate : picture.r_frame_rate)?.split('/').map(Number);
  const frameRate = rate?.length === 2 ? rate[0]! / rate[1]! : Number.NaN;
  const audioTracks = audios.map((track) => ({ index: track.index, codec: track.codec_name, channels: track.channels, sampleRateHz: Number(track.sample_rate),
    ...(Number(track.duration) > 0 ? { durationSeconds: Number(track.duration) } : {}),
    isDefault: track.disposition?.default === 1, ...(track.tags?.language ? { language: track.tags.language.slice(0, 40) } : {}), ...(track.tags?.title ? { title: track.tags.title.slice(0, 160) } : {}) }));
  const browserPlayable = container === 'webm'
    ? ['vp8', 'vp9'].includes(picture.codec_name ?? '')
    : container === 'mp4' && picture.codec_name === 'h264' && ['yuv420p', 'yuvj420p'].includes(picture.pix_fmt ?? '') && audios.every((track) => ['aac', 'mp3'].includes(track.codec_name ?? '') && (track.channels ?? 0) <= 2);
  const result = videoMetadataSchema.safeParse({ container, codec: picture.codec_name, contentType: types[container], durationSeconds: duration,
    ...(Number(picture.duration) > 0 ? { pictureDurationSeconds: Number(picture.duration) } : {}),
    width: picture.width, height: picture.height, frameRate, rotationDegrees: picture.side_data_list?.find((value) => Number.isFinite(value.rotation))?.rotation ?? Number(picture.tags?.rotate ?? 0), audioTracks, browserPlayable });
  if (!result.success) throw new VideoProcessingError('unsupported_video_parameters', 'Video supports up to 4096 pixels per side, 120 fps and eight supported audio tracks.');
  if (new Set(result.data.audioTracks.map((track) => track.index)).size !== result.data.audioTracks.length) throw new VideoProcessingError('invalid_video', 'Video stream indexes are invalid.');
  return result.data;
}

export async function inspectVideoFile(bytes: Uint8Array, source: string, options: VideoInspectionOptions, container = detectVideoContainer(bytes)): Promise<ValidatedVideo> {
  const raw = await runAudioProgram('ffprobe', ['-v', 'error', ...videoInputArguments(container, source), '-show_streams', '-show_format', '-of', 'json'], dirname(source), options.signal);
  let probe: Parameters<typeof parseVideoProbe>[0];
  try { probe = JSON.parse(raw); } catch { throw new VideoProcessingError('invalid_video', 'Video metadata is invalid.'); }
  const video = parseVideoProbe(probe, container, options.maxDurationSeconds);
  // Packet scan bounds the true timeline without decoding full-resolution long videos.
  // Decode the first picture separately to reject undecodable headers before persistence.
  const progress = await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', ...videoInputArguments(container, source), '-map', '0:v:0', '-map', '0:a?',
    '-sn', '-dn', '-c', 'copy', '-t', String(MAX_VIDEO_DURATION_SECONDS + 1), '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], dirname(source), options.signal);
  const duration = Math.max(0, ...[...progress.matchAll(/^out_time_us=(\d+)$/gm)].map((match) => Number(match[1]) / 1_000_000));
  if (!duration || duration > MAX_VIDEO_DURATION_SECONDS || Math.abs(duration - video.durationSeconds) > 1) throw new VideoProcessingError('invalid_video_duration', 'The video timeline does not match its metadata or limit.');
  await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', ...videoInputArguments(container, source), '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn', '-threads', '1', '-f', 'null', '-'], dirname(source), options.signal);
  return { bytes, video, byteSize: bytes.byteLength, checksumSha256: createHash('sha256').update(bytes).digest('hex'), contentType: video.contentType, extension: container };
}
