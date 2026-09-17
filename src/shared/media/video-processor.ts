import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AudioProcessingError, MAX_AUDIO_OUTPUT_BYTES, type ValidatedAudio } from './audio-contracts';
import { inspectAudioFile } from './audio-inspection';
import { runAudioProgram, withAudioWork } from './audio-process';
import { inspectVideoFile, validateVideoEnvelope, videoInputArguments } from './video-inspection';
import { resolveVideoCropPixels } from './video-crop';
import { readVideoTrimTiming } from './video-trim';
import { MAX_VIDEO_DURATION_SECONDS, MAX_VIDEO_OUTPUT_BYTES, VideoProcessingError, videoDeriveOptionsSchema, type ValidatedVideo, type VideoAudioTrack, type VideoContainer, type VideoDeriveOptions, type VideoInspectionOptions, type VideoMetadata } from './video-contracts';

const MAX_VIDEO_POSTER_FRAME_BYTES = 24 * 1024 * 1024;

export async function inspectVideoBytes(bytes: Uint8Array, options: VideoInspectionOptions = {}) {
  const container = validateVideoEnvelope(bytes, options);
  return translateVideoError(() => withAudioWork(bytes, options.signal, (_directory, source) => inspectVideoFile(bytes, source, options, container)));
}

/** Extracts a bounded first-frame poster. The caller converts it to the Library WebP variant. */
export async function extractVideoPosterFrame(bytes: Uint8Array, signal?: AbortSignal) {
  const container = validateVideoEnvelope(bytes, { maxBytes: MAX_VIDEO_OUTPUT_BYTES, signal });
  return translateVideoError(() => withAudioWork(bytes, signal, async (directory, source) => {
    const target = join(directory, 'poster.png');
    await runAudioProgram('ffmpeg', [
      '-nostdin', '-v', 'error', '-y', ...videoInputArguments(container, source),
      '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
      '-threads', '1', '-frames:v', '1',
      '-vf', "scale=w='min(1120,iw)':h='min(1120,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      '-c:v', 'png', '-f', 'image2', target,
    ], directory, signal);
    return readVideoOutput(target, MAX_VIDEO_POSTER_FRAME_BYTES);
  }));
}

export function selectVideoAudioTrack(video: VideoMetadata, index?: number): VideoAudioTrack {
  const track = index === undefined ? video.audioTracks.find((candidate) => candidate.isDefault) ?? video.audioTracks[0] : video.audioTracks.find((candidate) => candidate.index === index);
  if (!track) throw new VideoProcessingError(video.audioTracks.length ? 'video_audio_track_not_found' : 'video_has_no_audio', video.audioTracks.length ? 'The selected audio track is not available.' : 'This video has no audio track.');
  return track;
}

/** Original bytes are never changed. Derived output is validated before it reaches storage. */
export async function deriveVideoBytes(input: { bytes: Uint8Array; options: VideoDeriveOptions; signal?: AbortSignal }): Promise<ValidatedAudio | ValidatedVideo> {
  const parsed = videoDeriveOptionsSchema.safeParse(input.options);
  if (!parsed.success) throw new VideoProcessingError('invalid_video_options', 'Video extraction settings are invalid.', 400);
  const options = parsed.data;
  const container = validateVideoEnvelope(input.bytes, { maxBytes: MAX_VIDEO_OUTPUT_BYTES });
  return translateVideoError(() => withAudioWork(input.bytes, input.signal, async (directory, source) => {
    const original = await inspectVideoFile(input.bytes, source, { signal: input.signal }, container);
    if (options.kind === 'audio') {
      const track = selectVideoAudioTrack(original.video, options.audioTrackIndex);
      // WebM often omits per-stream duration. Measure actual decoded samples before
      // extraction so -fs cannot turn a truncated, otherwise valid file into success.
      const expectedDuration = track.durationSeconds ?? await measureAudioTrackDuration(container, source, track.index, directory, input.signal);
      const copy = track.channels <= 2 && ['aac', 'alac', 'opus', 'vorbis', 'mp3'].includes(track.codec);
      const extension = copy ? ({ aac: 'm4a', alac: 'm4a', opus: 'ogg', vorbis: 'ogg', mp3: 'mp3' } as const)[track.codec as 'aac' | 'alac' | 'opus' | 'vorbis' | 'mp3'] : 'flac';
      const target = join(directory, `audio.${extension}`);
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...videoInputArguments(container, source), '-map', `0:${track.index}`, '-vn', '-sn', '-dn',
        '-map_metadata', '-1', '-map_chapters', '-1', '-threads', '1', '-c:a', copy ? 'copy' : 'flac',
        ...(copy ? [] : ['-ar', '48000', '-ac', String(Math.min(track.channels, 2))]),
        '-fs', String(MAX_AUDIO_OUTPUT_BYTES), '-f', extension === 'm4a' ? 'ipod' : extension, target], directory, input.signal);
      const bytes = await readVideoOutput(target, MAX_AUDIO_OUTPUT_BYTES);
      const result = await inspectAudioFile(bytes, target, { signal: input.signal });
      // A selected track can legitimately be shorter than the picture. Never pad it with invented audio.
      if (result.audio.durationSeconds > original.video.durationSeconds + 0.5) throw new VideoProcessingError('invalid_video_audio_duration', 'The extracted track exceeds the source timeline.');
      assertExtractedAudioDuration(result.audio.durationSeconds, expectedDuration);
      return result;
    }
    if (options.kind === 'trim') {
      const range = options.range!;
      const duration = (range.endMs - range.startMs) / 1000;
      const track = original.video.audioTracks.length || options.audioTrackIndex !== undefined ? selectVideoAudioTrack(original.video, options.audioTrackIndex) : undefined;
      const timing = await readVideoTrimTiming({ container, source, directory, video: original.video, audioTrackIndex: track?.index, signal: input.signal });
      if (range.endMs > timing.pictureEndSeconds * 1000 + 1) throw new VideoProcessingError('invalid_video_trim', 'Choose a time interval inside the source video.', 400);
      const sourceAudioDuration = track ? track.durationSeconds ?? await measureAudioTrackDuration(container, source, track.index, directory, input.signal) : 0;
      const expectedAudioDuration = Math.max(0, Math.min(range.endMs / 1000, timing.audioStartSeconds + sourceAudioDuration) - Math.max(range.startMs / 1000, timing.audioStartSeconds));
      const target = join(directory, 'trim.mp4');
      const args = videoInputArguments(container, source);
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args.slice(0, -2), '-ss', String(range.startMs / 1000), ...args.slice(-2),
        '-map', '0:v:0', ...(track && expectedAudioDuration > 0 ? ['-map', `0:${track.index}`] : ['-an']), '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-threads', '1',
        '-t', String(duration), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p', '-fps_mode', 'passthrough',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-maxrate', '12M', '-bufsize', '24M', '-metadata:s:v:0', 'rotate=0',
        ...(track && expectedAudioDuration > 0 ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', String(Math.min(track.channels, 2))] : []),
        '-movflags', '+faststart', '-fs', String(MAX_VIDEO_OUTPUT_BYTES), '-f', 'mp4', target], directory, input.signal);
      const bytes = await readVideoOutput(target);
      const result = await inspectVideoFile(bytes, target, { signal: input.signal }, 'mp4');
      if (!result.video.browserPlayable || result.video.rotationDegrees !== 0 || Math.abs(result.video.durationSeconds - duration) > Math.max(0.1, 2 / original.video.frameRate)
        || result.video.audioTracks.length !== (expectedAudioDuration > 0 ? 1 : 0)) throw new VideoProcessingError('invalid_video_trim', 'The selected interval could not be exported completely.');
      if (expectedAudioDuration > 0) assertExtractedAudioDuration(result.video.audioTracks[0]?.durationSeconds ?? 0, expectedAudioDuration);
      return result;
    }
    if (options.kind === 'crop') {
      // Schema requires bounds. FFmpeg applies source display rotation before -vf.
      const crop = resolveVideoCropPixels(original.video, options.crop!);
      const track = original.video.audioTracks.length || options.audioTrackIndex !== undefined ? selectVideoAudioTrack(original.video, options.audioTrackIndex) : undefined;
      const audioDuration = track ? track.durationSeconds ?? await measureAudioTrackDuration(container, source, track.index, directory, input.signal) : 0;
      const target = join(directory, 'crop.mp4');
      const copyAudio = track && track.channels <= 2 && ['aac', 'mp3'].includes(track.codec);
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...videoInputArguments(container, source),
        '-map', '0:v:0', ...(track ? ['-map', `0:${track.index}`] : ['-an']), '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-threads', '1',
        '-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},setsar=1,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-maxrate', '12M', '-bufsize', '24M', '-metadata:s:v:0', 'rotate=0',
        ...(track ? copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', String(Math.min(track.channels, 2))] : []),
        '-movflags', '+faststart', '-fs', String(MAX_VIDEO_OUTPUT_BYTES), '-f', 'mp4', target], directory, input.signal);
      const bytes = await readVideoOutput(target);
      const result = await inspectVideoFile(bytes, target, { signal: input.signal }, 'mp4');
      const expectedPictureDuration = original.video.pictureDurationSeconds ?? original.video.durationSeconds;
      if (result.video.width !== crop.width || result.video.height !== crop.height || result.video.rotationDegrees !== 0 || !result.video.browserPlayable
        || Math.abs((result.video.pictureDurationSeconds ?? result.video.durationSeconds) - expectedPictureDuration) > Math.max(0.1, 2 / original.video.frameRate)
        || Math.abs(result.video.durationSeconds - Math.max(expectedPictureDuration, audioDuration)) > 0.5
        || result.video.audioTracks.length !== (track ? 1 : 0)) {
        throw new VideoProcessingError('video_output_limit', 'The cropped video does not match the selected picture or source timeline.');
      }
      if (track) assertExtractedAudioDuration(result.video.audioTracks[0]?.durationSeconds ?? 0, audioDuration);
      return result;
    }
    const preview = options.kind === 'preview';
    const extension = preview ? 'mp4' : container;
    const target = join(directory, `${options.kind}.${extension}`);
    const track = preview && (original.video.audioTracks.length || options.audioTrackIndex !== undefined) ? selectVideoAudioTrack(original.video, options.audioTrackIndex) : undefined;
    await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...videoInputArguments(container, source), '-map', '0:v:0',
      ...(track ? ['-map', `0:${track.index}`] : ['-an']), '-sn', '-dn', '-map_metadata', preview ? '-1' : '0', '-map_chapters', '-1', '-threads', '1',
      ...(preview ? ['-vf', "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '400k', '-bufsize', '800k',
        ...(track ? ['-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2'] : [])] : ['-c:v', 'copy']),
      ...(extension === 'webm' ? [] : ['-movflags', '+faststart']), '-fs', String(MAX_VIDEO_OUTPUT_BYTES), '-f', extension, target], directory, input.signal);
    const bytes = await readVideoOutput(target);
    const result = await inspectVideoFile(bytes, target, { signal: input.signal }, extension);
    const expectedDuration = preview ? Math.max(original.video.pictureDurationSeconds ?? original.video.durationSeconds, track?.durationSeconds ?? 0) : original.video.pictureDurationSeconds ?? original.video.durationSeconds;
    if (Math.abs(result.video.durationSeconds - expectedDuration) > 1) throw new VideoProcessingError('video_output_limit', 'The processed video was truncated or exceeds the safe output limit.');
    return result;
  }));
}

export function assertExtractedAudioDuration(actual: number, expected: number) {
  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(actual) || actual <= 0 || Math.abs(actual - expected) > 0.25) {
    throw new VideoProcessingError('video_output_limit', 'The extracted track was truncated or exceeds the safe output limit.');
  }
}

async function measureAudioTrackDuration(container: VideoContainer, source: string, index: number, directory: string, signal?: AbortSignal) {
  const progress = await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', ...videoInputArguments(container, source),
    '-map', `0:${index}`, '-vn', '-sn', '-dn', '-threads', '1', '-af', 'asetpts=N/SR/TB', '-c:a', 'pcm_s16le',
    '-t', String(MAX_VIDEO_DURATION_SECONDS + 0.1), '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], directory, signal);
  const duration = Math.max(0, ...[...progress.matchAll(/^out_time_us=(\d+)$/gm)].map((match) => Number(match[1]) / 1_000_000));
  if (!duration || duration > MAX_VIDEO_DURATION_SECONDS) throw new VideoProcessingError('invalid_video_audio_duration', 'The selected audio track has an invalid duration.');
  return duration;
}

async function readVideoOutput(target: string, maximum = MAX_VIDEO_OUTPUT_BYTES) {
  const file = await stat(target);
  if (!file.isFile() || file.size < 1 || file.size >= maximum) throw new VideoProcessingError('video_output_limit', 'The processed media exceeds the output limit.');
  return new Uint8Array(await readFile(target));
}
async function translateVideoError<T>(work: () => Promise<T>) {
  try { return await work(); }
  catch (error) {
    if (!(error instanceof AudioProcessingError)) throw error;
    const code = error.code.replaceAll('audio', 'video');
    const message = error.code === 'audio_timeout' ? 'Video processing exceeded the time limit. Try a shorter or smaller video.' : error.message.replaceAll('Audio', 'Media').replaceAll('audio', 'media');
    throw new VideoProcessingError(code, message, error.status);
  }
}
