import type { MediaSource } from './media-source';
import { readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AudioProcessingError } from './audio-contracts';
import { withAudioWork } from './audio-process';
import { MAX_TIMELINE_DURATION_MS, MAX_TIMELINE_FRAMES_PER_SHOT, MAX_TIMELINE_SHOTS } from './timeline-contracts';
import { runTimelineProgram } from './timeline-processor-process';
import { parseVideoProbe, validateVideoEnvelope, videoInputArguments } from './video-inspection';
import { VideoProcessingError, type VideoContainer } from './video-contracts';
import { createTimelineLineReader, createTimelineProgressReporter, type TimelineAnalysisProgress } from './timeline-progress';

const MAX_FRAMES = 36_001;
const MAX_JPEG_BYTES = 2 * 1024 * 1024;
type ProbeFrame = { best_effort_timestamp_time?: string; pts_time?: string; duration_time?: string; pkt_duration_time?: string };
type FrameProbe = { frames?: ProbeFrame[] };
type Score = { score: number; brightness?: number };
export type TimelineVideoAnalysis = { durationMs: number; frameTimesMs: number[]; shots: Array<{ startMs: number; endMs: number; frameTimesMs: number[] }> };
const millis = (seconds: number) => Math.round(seconds * 1_000_000) / 1000;

/** Decode PTS, including variable-rate footage. Never synthesize frame positions from FPS. */
export function parseTimelineFrames(probe: FrameProbe, originSeconds: number, fallbackEndMs: number): Pick<TimelineVideoAnalysis, 'durationMs' | 'frameTimesMs'> {
  if (!Array.isArray(probe.frames) || !probe.frames.length || probe.frames.length > MAX_FRAMES) throw new VideoProcessingError('timeline_frame_limit', 'The video has no usable frames or exceeds the frame limit.');
  const frameTimesMs = probe.frames.map((frame) => millis(Number(frame.best_effort_timestamp_time ?? frame.pts_time) - originSeconds));
  if (frameTimesMs.some((time, index) => !Number.isFinite(time) || time < 0 || time > MAX_TIMELINE_DURATION_MS || (index > 0 && time <= frameTimesMs[index - 1]!))) {
    throw new VideoProcessingError('invalid_timeline_timestamps', 'Video frame timestamps must be known, increasing and within five minutes.');
  }
  const last = probe.frames.at(-1)!;
  const lastDurationMs = millis(Number(last.duration_time ?? last.pkt_duration_time));
  const durationMs = lastDurationMs > 0 ? millis((frameTimesMs.at(-1)! + lastDurationMs) / 1000) : fallbackEndMs;
  if (!Number.isFinite(durationMs) || durationMs <= frameTimesMs.at(-1)! || durationMs > MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('timeline_duration_limit', 'Timeline Handoff supports videos up to five minutes with a known ending.');
  return { durationMs, frameTimesMs };
}

/** The same decoded sequence supplies scene scores and brightness; metadata keys are allowlisted. */
export function parseTimelineScores(raw: string, frameCount: number): Map<number, Score> {
  const result = new Map<number, Score>(); let frame = -1;
  for (const line of raw.split(/\r?\n/)) {
    const header = /^frame:(\d+)\s/.exec(line);
    if (header) { frame = Number(header[1]); if (frame >= frameCount) throw new VideoProcessingError('invalid_timeline_timestamps', 'Video analysis frames do not match the decoded timeline.'); continue; }
    const score = /^lavfi\.scd\.score=([\d.eE+-]+)$/.exec(line);
    const brightness = /^lavfi\.signalstats\.YAVG=([\d.eE+-]+)$/.exec(line);
    if (frame < 0 || (!score && !brightness)) continue;
    const value = Number((score ?? brightness)![1]);
    if (!Number.isFinite(value)) throw new VideoProcessingError('invalid_timeline_scores', 'Video analysis returned an invalid frame score.');
    const current = result.get(frame) ?? { score: 0 };
    result.set(frame, score ? { ...current, score: value } : { ...current, brightness: value });
  }
  if (result.size !== frameCount) throw new VideoProcessingError('invalid_timeline_timestamps', 'Video analysis did not cover every decoded frame.');
  return result;
}

/** Luminance and distance from a cut are only a practical fallback, not an aesthetic ranking. */
export function buildTimelineShots(timeline: Pick<TimelineVideoAnalysis, 'durationMs' | 'frameTimesMs'>, scores: Map<number, Score>, threshold = 10): TimelineVideoAnalysis['shots'] {
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 60) throw new VideoProcessingError('invalid_timeline_threshold', 'Cut threshold must be between 1 and 60.', 400);
  const { durationMs, frameTimesMs } = timeline;
  const cuts = frameTimesMs.filter((time, index) => index > 0 && time > 0 && (scores.get(index)?.score ?? 0) >= threshold);
  if (cuts.length >= MAX_TIMELINE_SHOTS) throw new VideoProcessingError('timeline_shot_limit', 'More than 100 shots were detected. Lower sensitivity or use a shorter video.');
  const bounds = [0, ...cuts, durationMs];
  return bounds.slice(0, -1).map((startMs, index) => {
    const endMs = bounds[index + 1]!; const middle = (startMs + endMs) / 2;
    const margin = Math.min(200, (endMs - startMs) / 5);
    const choices = frameTimesMs.flatMap((time, frameIndex) => {
      if (time < startMs || time >= endMs) return [];
      const data = scores.get(frameIndex); const brightness = data?.brightness ?? 128;
      const exposurePenalty = brightness < 25 || brightness > 235 ? 4 : 0;
      const boundaryPenalty = time < startMs + margin || time >= endMs - margin ? 2 : 0;
      const flashPenalty = (data?.score ?? 0) >= threshold ? 2 : 0;
      return [{ time, quality: exposurePenalty + boundaryPenalty + flashPenalty + Math.abs(time - middle) / (endMs - startMs) }];
    });
    choices.sort((a, b) => a.quality - b.quality || a.time - b.time);
    if (!choices.length) throw new VideoProcessingError('invalid_timeline_timestamps', 'A detected shot contains no decoded frames.');
    return { startMs, endMs, frameTimesMs: [choices[0]!.time] };
  });
}

async function inspectTimelineHeader(container: VideoContainer, source: string, directory: string, signal?: AbortSignal) {
  const raw = await runTimelineProgram('ffprobe', ['-v', 'error', ...videoInputArguments(container, source), '-show_streams', '-show_format', '-of', 'json'], directory, signal);
  const probe = JSON.parse(raw) as Parameters<typeof parseVideoProbe>[0] & { streams?: Array<{ codec_type?: string; start_time?: string; duration?: string }>; format?: { duration?: string; start_time?: string } };
  // Header limits stop oversized dimensions/unknown codecs before full-frame decoding.
  const video = parseVideoProbe(probe, container);
  const originSeconds = Number(probe.format?.start_time ?? 0);
  const picture = (probe.streams as Array<{ codec_type?: string; start_time?: string; duration?: string }> | undefined)?.find((stream) => stream.codec_type === 'video');
  const pictureStart = Number(picture?.start_time ?? originSeconds);
  const pictureDuration = Number(picture?.duration) || video.pictureDurationSeconds || video.durationSeconds;
  const fallbackEndMs = millis(pictureStart - originSeconds + pictureDuration);
  if (!Number.isFinite(originSeconds) || fallbackEndMs > MAX_TIMELINE_DURATION_MS || fallbackEndMs <= 0) throw new VideoProcessingError('timeline_duration_limit', 'Timeline Handoff supports videos up to five minutes.');
  return { originSeconds, fallbackEndMs };
}

export async function analyzeTimelineVideo(input: { bytes: MediaSource; signal?: AbortSignal; threshold?: number; onProgress?: (value: TimelineAnalysisProgress) => Promise<void> }): Promise<TimelineVideoAnalysis> {
  const threshold = input.threshold ?? 10;
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 60) throw new VideoProcessingError('invalid_timeline_threshold', 'Cut threshold must be between 1 and 60.', 400);
  const container = validateVideoEnvelope(input.bytes);
  const signal = AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(240_000)]);
  const startedAt = Date.now();
  const reporter = createTimelineProgressReporter(input.onProgress);
  return translateProcessingError(() => withAudioWork(input.bytes, signal, async (directory, source) => {
    const header = await inspectTimelineHeader(container, source, directory, signal);
    let progress: TimelineAnalysisProgress = { phase: 'indexing', processedFrames: 0, totalFrames: null, processedMs: 0,
      totalMs: header.fallbackEndMs, elapsedMs: Date.now() - startedAt, estimatedRemainingMs: null };
    await reporter.flush(progress);
    const indexing = createTimelineLineReader((line) => {
      const match = /^"best_effort_timestamp_time":\s*"([\d.eE+-]+)"/.exec(line);
      if (!match) return;
      const timeMs = Math.max(0, Math.min(header.fallbackEndMs, millis(Number(match[1]) - header.originSeconds)));
      if (!Number.isFinite(timeMs)) return;
      progress = { ...progress, processedFrames: Math.min(36_001, progress.processedFrames + 1), processedMs: timeMs, elapsedMs: Date.now() - startedAt };
      reporter.update(progress);
    });
    const frames = await runTimelineProgram('ffprobe', ['-v', 'error', ...videoInputArguments(container, source), '-select_streams', 'v:0',
      '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time,pts_time,duration_time,pkt_duration_time', '-of', 'json'], directory, signal, indexing);
    const timeline = parseTimelineFrames(JSON.parse(frames) as FrameProbe, header.originSeconds, header.fallbackEndMs);
    const detectingAt = Date.now(); let detectedFrame = -1;
    progress = { ...progress, phase: 'detecting', processedFrames: 0, totalFrames: timeline.frameTimesMs.length, processedMs: 0, totalMs: timeline.durationMs, elapsedMs: Date.now() - startedAt };
    await reporter.flush(progress);
    const detecting = createTimelineLineReader((line) => {
      const match = /^frame:(\d+)\s/.exec(line);
      const index = match ? Number(match[1]) : -1;
      if (index <= detectedFrame || index >= timeline.frameTimesMs.length) return;
      detectedFrame = index;
      const elapsed = Date.now() - detectingAt; const count = index + 1;
      const estimatedRemainingMs = elapsed >= 500 && count >= 10 ? Math.min(20 * 60_000, Math.round(elapsed / count * (timeline.frameTimesMs.length - count))) : null;
      progress = { ...progress, processedFrames: count, processedMs: timeline.frameTimesMs[index]!, elapsedMs: Date.now() - startedAt, estimatedRemainingMs };
      reporter.update(progress);
    });
    const raw = await runTimelineProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', ...videoInputArguments(container, source), '-map', '0:v:0', '-an', '-sn', '-dn', '-threads', '1', '-filter_threads', '1',
      '-vf', `scale=w='min(320,iw)':h='min(320,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p,scdet=threshold=${threshold},signalstats,metadata=mode=print:key=lavfi.scd.score:file='pipe\\:1',metadata=mode=print:key=lavfi.signalstats.YAVG:file='pipe\\:1'`,
      '-fps_mode', 'passthrough', '-f', 'null', '-'], directory, signal, detecting);
    const shots = buildTimelineShots(timeline, parseTimelineScores(raw, timeline.frameTimesMs.length), threshold);
    await reporter.flush({ ...progress, phase: 'finalizing', processedFrames: timeline.frameTimesMs.length, processedMs: timeline.durationMs, elapsedMs: Date.now() - startedAt, estimatedRemainingMs: null });
    return { ...timeline, shots };
  }));
}

async function readTimelineFrame(container: VideoContainer, source: string, directory: string, timeMs: number, signal?: AbortSignal): Promise<Uint8Array> {
    const target = join(directory, 'frame.jpg'); const args = videoInputArguments(container, source);
    // FFmpeg can exit successfully without emitting a frame near EOF. A prior still
    // must never survive that operation and appear to be the newly requested PTS.
    await unlink(target).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
    await runTimelineProgram('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-y', ...args.slice(0, -2), '-ss', String(timeMs / 1000), ...args.slice(-2),
      '-map', '0:v:0', '-an', '-sn', '-dn', '-threads', '1', '-filter_threads', '1', '-vf', "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
      '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', '-fs', String(MAX_JPEG_BYTES), '-f', 'image2', target], directory, signal).catch((error: unknown) => {
      if (error instanceof VideoProcessingError && error.code === 'invalid_timeline_video') throw new VideoProcessingError('invalid_timeline_frame', 'The selected frame could not be decoded. Select a different indexed frame.');
      throw error;
    });
    const file = await stat(target).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new VideoProcessingError('invalid_timeline_frame', 'No decoded frame exists at the requested timestamp. Select an indexed frame.');
      throw error;
    });
    if (!file.isFile() || file.size < 4 || file.size >= MAX_JPEG_BYTES) throw new VideoProcessingError('timeline_frame_limit', 'The selected image could not be prepared within the output limit.');
    const bytes = await readFile(target);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new VideoProcessingError('invalid_timeline_frame', 'The selected image could not be decoded.');
    return new Uint8Array(bytes);
}

/** One source/probe per batch, one JPEG at a time. Callers supply the durable job's cancellation signal. */
export async function withTimelineFrameReader<T>(input: { bytes: MediaSource; signal?: AbortSignal }, work: (readFrame: (timeMs: number) => Promise<Uint8Array>) => Promise<T>): Promise<T> {
  const container = validateVideoEnvelope(input.bytes);
  return translateProcessingError(() => withAudioWork(input.bytes, input.signal, async (directory, source) => {
    const header = await inspectTimelineHeader(container, source, directory, input.signal);
    let reading = false; let closed = false; let count = 0;
    const readFrame = async (timeMs: number) => {
      input.signal?.throwIfAborted();
      if (closed || reading) throw new VideoProcessingError('timeline_reader_unavailable', 'Read frames sequentially while the timeline operation is active.', 409);
      if (++count > MAX_TIMELINE_SHOTS * MAX_TIMELINE_FRAMES_PER_SHOT) throw new VideoProcessingError('timeline_frame_limit', 'Timeline Handoff supports at most 500 selected frames.');
      if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs >= header.fallbackEndMs || timeMs >= MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('invalid_timeline_frame', 'Choose a frame within this five-minute video.', 400);
      reading = true;
      try { return await readTimelineFrame(container, source, directory, timeMs, input.signal); }
      finally { reading = false; }
    };
    try { return await work(readFrame); }
    finally { closed = true; }
  }));
}

/** Accurate input seeking decodes the preceding keyframe, then discards frames before this PTS. */
export async function extractTimelineFrameBytes(input: { bytes: MediaSource; timeMs: number; signal?: AbortSignal }): Promise<Uint8Array> {
  if (!Number.isFinite(input.timeMs) || input.timeMs < 0 || input.timeMs >= MAX_TIMELINE_DURATION_MS) throw new VideoProcessingError('invalid_timeline_frame', 'Choose a frame within the five-minute timeline.', 400);
  const signal = AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(120_000)]);
  return withTimelineFrameReader({ bytes: input.bytes, signal }, (readFrame) => readFrame(input.timeMs));
}

async function translateProcessingError<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof AudioProcessingError) throw new VideoProcessingError(error.code.replaceAll('audio', 'timeline'), error.message.replaceAll('Audio', 'Media').replaceAll('audio', 'media'), error.status);
    if (error instanceof SyntaxError) throw new VideoProcessingError('invalid_timeline_video', 'Video metadata could not be read.');
    throw error;
  }
}
