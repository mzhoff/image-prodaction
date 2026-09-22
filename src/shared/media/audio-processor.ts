import type { MediaSource } from './media-source';
import { readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { audioConvertOptionsSchema, AudioProcessingError, AUDIO_CHUNK_SECONDS, MAX_AUDIO_OUTPUT_BYTES, type AudioChunk, type AudioConvertOptions, type AudioInspectionOptions } from './audio-contracts';
import { audioInputArguments, inspectAudioFile, validateAudioEnvelope } from './audio-inspection';
import { runAudioProgram, withAudioWork } from './audio-process';

export async function inspectAudioBytes<T extends MediaSource>(bytes: T, options: AudioInspectionOptions = {}) {
  const container = validateAudioEnvelope(bytes, options);
  return withAudioWork(bytes, options.signal, (_directory, source) => inspectAudioFile(bytes, source, options, container));
}

export async function convertAudioBytes(input: { bytes: MediaSource; options: AudioConvertOptions; signal?: AbortSignal }) {
  const parsed = audioConvertOptionsSchema.safeParse(input.options);
  if (!parsed.success) throw new AudioProcessingError('invalid_audio_options', parsed.error.issues[0]?.message ?? 'Audio conversion settings are invalid.', 400);
  const options = parsed.data;
  const container = validateAudioEnvelope(input.bytes, { maxBytes: MAX_AUDIO_OUTPUT_BYTES });
  return withAudioWork(input.bytes, input.signal, async (directory, source) => {
    const original = await inspectAudioFile(input.bytes, source, { signal: input.signal }, container);
    const target = join(directory, `converted.${options.format}`);
    await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...audioInputArguments(container, source),
      ...audioOutputArguments(options), '-fs', String(MAX_AUDIO_OUTPUT_BYTES), target], directory, input.signal);
    const converted = await readOutput(target);
    const result = await inspectAudioFile(converted, target, { signal: input.signal });
    if (Math.abs(result.audio.durationSeconds - original.audio.durationSeconds) > 0.2) throw new AudioProcessingError('audio_output_limit', 'The converted audio exceeds the safe output limit.');
    return result;
  });
}

/** Processes one chunk at a time; no array of all audio bytes is kept in memory. */
export async function forEachAudioChunk(input: { bytes: MediaSource; chunkDurationSeconds?: number; maxChunks?: number; signal?: AbortSignal }, consume: (chunk: AudioChunk) => Promise<void>) {
  const seconds = input.chunkDurationSeconds ?? AUDIO_CHUNK_SECONDS;
  const maxChunks = input.maxChunks ?? 30;
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > AUDIO_CHUNK_SECONDS || !Number.isInteger(maxChunks) || maxChunks < 1 || maxChunks > 60) throw new AudioProcessingError('invalid_chunk_options', 'Audio chunk limits are invalid.');
  const container = validateAudioEnvelope(input.bytes, { maxBytes: MAX_AUDIO_OUTPUT_BYTES });
  return withAudioWork(input.bytes, input.signal, async (directory, source) => {
    const original = await inspectAudioFile(input.bytes, source, { signal: input.signal }, container);
    const chunkCount = Math.ceil(original.audio.durationSeconds / seconds);
    if (chunkCount > maxChunks) throw new AudioProcessingError('audio_chunk_limit', 'This recording requires too many transcription chunks.');
    for (let index = 0; index < chunkCount; index += 1) {
      input.signal?.throwIfAborted();
      const startSeconds = index * seconds;
      const endSeconds = Math.min(original.audio.durationSeconds, startSeconds + seconds);
      const target = join(directory, 'chunk.flac');
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(startSeconds), ...audioInputArguments(container, source),
        '-t', String(endSeconds - startSeconds), ...audioOutputArguments({ format: 'flac', sampleRateHz: 16000, channels: 1 }), '-fs', String(4 * 1024 * 1024), target], directory, input.signal);
      const bytes = await readOutput(target, 4 * 1024 * 1024);
      await consume({ index, startSeconds, endSeconds, bytes, contentType: 'audio/flac' });
      await unlink(target);
    }
    return { durationSeconds: original.audio.durationSeconds, chunkCount };
  });
}

function audioOutputArguments(options: AudioConvertOptions) {
  const codec = { mp3: 'libmp3lame', wav: 'pcm_s16le', flac: 'flac', ogg: 'libopus' }[options.format];
  return ['-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1', '-threads', '1', '-c:a', codec,
    ...(options.bitrateKbps && (options.format === 'mp3' || options.format === 'ogg') ? ['-b:a', `${options.bitrateKbps}k`] : []),
    ...(options.sampleRateHz ? ['-ar', String(options.sampleRateHz)] : []), ...(options.channels ? ['-ac', String(options.channels)] : []), '-f', options.format];
}
async function readOutput(target: string, maximum = MAX_AUDIO_OUTPUT_BYTES) {
  const file = await stat(target);
  if (!file.isFile() || file.size < 1 || file.size >= maximum) throw new AudioProcessingError('audio_output_limit', 'The processed audio exceeds the output limit.');
  return new Uint8Array(await readFile(target));
}
