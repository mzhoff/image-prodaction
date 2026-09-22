import { mediaHeader, mediaChecksum, type MediaSource } from './media-source';
import { dirname } from 'node:path';
import { audioMetadataSchema, AudioProcessingError, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS, MAX_AUDIO_OUTPUT_BYTES, type AudioContainer, type AudioInspectionOptions, type ValidatedAudio } from './audio-contracts';
import { runAudioProgram } from './audio-process';

const contentTypes = { ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac' } as const;
const demuxers = { ogg: 'ogg', m4a: 'mov', mp3: 'mp3', wav: 'wav', aac: 'aac', flac: 'flac' } as const;
const codecs = { ogg: ['opus', 'vorbis'], m4a: ['aac', 'alac'], mp3: ['mp3'], wav: ['pcm_u8', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le'], aac: ['aac'], flac: ['flac'] };
type ProbeStream = { codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; duration?: string; disposition?: { attached_pic?: number } };

export function detectAudioContainer(bytes: MediaSource): AudioContainer {
  const data = Buffer.from(mediaHeader(bytes));
  if (data.length < 12) throw new AudioProcessingError('unsupported_audio', 'The audio file is empty or its signature is unsupported.', 415);
  const header = data.toString('ascii', 0, 4);
  if (header === 'OggS') return 'ogg';
  if (header === 'fLaC') return 'flac';
  if (header === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (data.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  if (data[0] === 0xff && (data[1]! & 0xf6) === 0xf0) return 'aac';
  if (data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1]! & 0xe0) === 0xe0)) return 'mp3';
  throw new AudioProcessingError('unsupported_audio', 'Supported audio: Ogg/Opus, M4A, MP3, WAV, AAC and FLAC.', 415);
}

export function validateAudioEnvelope(bytes: MediaSource, options: AudioInspectionOptions) {
  const limit = Math.min(options.maxBytes ?? MAX_AUDIO_BYTES, MAX_AUDIO_OUTPUT_BYTES);
  if (!Number.isSafeInteger(limit) || limit < 1 || bytes.byteLength < 1 || bytes.byteLength > limit) throw new AudioProcessingError('file_too_large', 'Audio must be nonempty and within the configured byte limit.', 413);
  const container = detectAudioContainer(bytes);
  const claimed = options.claimedContentType?.split(';')[0]?.trim().toLowerCase();
  const aliases: Record<string, AudioContainer> = { 'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aac': 'aac', 'audio/x-aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
  if (claimed && claimed !== 'application/octet-stream' && aliases[claimed] !== container) throw new AudioProcessingError('content_type_mismatch', 'The declared audio type does not match its contents.', 415);
  return container;
}

export function audioInputArguments(container: AudioContainer, source: string) {
  return ['-protocol_whitelist', 'file,pipe', '-max_alloc', '67108864', '-probesize', '8388608', '-analyzeduration', '15000000', '-threads', '1',
    ...(container === 'm4a' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-f', demuxers[container], '-i', source];
}

export async function inspectAudioFile<T extends MediaSource>(bytes: T, source: string, options: AudioInspectionOptions, container = detectAudioContainer(bytes)): Promise<ValidatedAudio<T>> {
  const result = await runAudioProgram('ffprobe', ['-v', 'error', ...audioInputArguments(container, source), '-show_streams', '-show_format', '-of', 'json'], dirname(source), options.signal);
  let probe: { streams?: ProbeStream[]; format?: { duration?: string } };
  try { probe = JSON.parse(result); } catch { throw new AudioProcessingError('invalid_audio', 'The audio metadata is invalid.'); }
  if (!Array.isArray(probe.streams)) throw new AudioProcessingError('invalid_audio', 'Audio has no decodable stream.');
  const streams = probe.streams.filter((stream) => stream.codec_type === 'audio');
  // Attached cover art is never decoded or forwarded. Real video/subtitle/data streams are rejected.
  if (streams.length !== 1 || probe.streams.some((stream) => stream.codec_type !== 'audio' && !(stream.codec_type === 'video' && stream.disposition?.attached_pic === 1))) throw new AudioProcessingError('unsupported_audio_streams', 'A single audio stream without video is required.');
  const stream = streams[0]!;
  if (!codecs[container].includes(stream.codec_name ?? '')) throw new AudioProcessingError('unsupported_audio_codec', 'The codec is not supported in this audio container.', 415);
  const durationSeconds = Number(stream.duration ?? probe.format?.duration);
  const maximum = Math.min(options.maxDurationSeconds ?? MAX_AUDIO_DURATION_SECONDS, MAX_AUDIO_DURATION_SECONDS);
  if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > maximum) throw new AudioProcessingError('audio_duration_limit', 'Audio duration must be known and at most 30 minutes.');
  const parsed = audioMetadataSchema.safeParse({ container, codec: stream.codec_name, contentType: contentTypes[container], durationSeconds, sampleRateHz: Number(stream.sample_rate), channels: stream.channels });
  if (!parsed.success) throw new AudioProcessingError('unsupported_audio_parameters', 'Audio must have one or two channels and a supported sample rate.');
  // Decode to a null sink as well: container duration alone can be forged or omit corrupt frames.
  const progress = await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', ...audioInputArguments(container, source),
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-threads', '1', '-t', String(maximum + 0.1), '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], dirname(source), options.signal);
  const times = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map((match) => Number(match[1]) / 1_000_000);
  const decodedDuration = Math.max(0, ...times);
  if (!decodedDuration || decodedDuration > maximum || Math.abs(decodedDuration - durationSeconds) > 0.5) throw new AudioProcessingError('invalid_audio_duration', 'The decoded audio duration does not match its metadata or limit.');
  return { bytes, audio: parsed.data, byteSize: bytes.byteLength, checksumSha256: mediaChecksum(bytes), contentType: parsed.data.contentType, extension: container };
}
