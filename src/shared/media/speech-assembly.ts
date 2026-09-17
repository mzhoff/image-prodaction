import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AudioProcessingError, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS } from './audio-contracts';
import { audioInputArguments, inspectAudioFile, validateAudioEnvelope } from './audio-inspection';
import { runAudioProgram, withAudioWork } from './audio-process';
import { MAX_SPEECH_CHUNKS } from './speech-text';

const SAMPLE_RATE = 24_000;
const MAX_PCM_BYTES = SAMPLE_RATE * 2 * (MAX_AUDIO_DURATION_SECONDS - 1);

/** Network waits do not occupy an FFmpeg slot. Parts are decoded and appended on disk,
 * then encoded once; no crossfade or silence trimming can consume a spoken word. */
export async function assembleSpeechParts(input: { parts: AsyncIterable<Uint8Array>; signal?: AbortSignal }) {
  input.signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'image-production-speech-'));
  const combined = join(directory, 'combined.pcm');
  let byteSize = 0;
  let count = 0;
  try {
    await writeFile(combined, new Uint8Array(), { mode: 0o600 });
    for await (const bytes of input.parts) {
      input.signal?.throwIfAborted();
      if (++count > MAX_SPEECH_CHUNKS) throw new AudioProcessingError('speech_chunk_limit', 'Speech requires too many parts.');
      const container = validateAudioEnvelope(bytes, {});
      await withAudioWork(bytes, input.signal, async (workDirectory, source) => {
        const original = await inspectAudioFile(bytes, source, { signal: input.signal }, container);
        if (byteSize + original.audio.durationSeconds * SAMPLE_RATE * 2 > MAX_PCM_BYTES) {
          throw new AudioProcessingError('audio_duration_limit', 'The assembled speech must be shorter than 30 minutes. Try shorter text or a faster voice.');
        }
        const part = join(workDirectory, 'part.pcm');
        await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...audioInputArguments(container, source),
          '-map', '0:a:0', '-vn', '-sn', '-dn', '-threads', '1', '-ar', String(SAMPLE_RATE), '-ac', '1',
          '-c:a', 'pcm_s16le', '-f', 's16le', '-fs', String(MAX_PCM_BYTES - byteSize + 2), part], workDirectory, input.signal);
        const file = await stat(part);
        if (!file.size || file.size % 2 || byteSize + file.size > MAX_PCM_BYTES) throw new AudioProcessingError('audio_duration_limit', 'The assembled speech exceeds 30 minutes.');
        await pipeline(createReadStream(part), createWriteStream(combined, { flags: 'a', mode: 0o600 }), { signal: input.signal });
        byteSize += file.size;
        await unlink(part);
      });
    }
    if (!count || !byteSize) throw new AudioProcessingError('invalid_audio', 'Speech has no audio parts.');
    return await withAudioWork(new Uint8Array(), input.signal, async (workDirectory) => {
      const target = join(workDirectory, 'voice.mp3');
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe',
        '-threads', '1', '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-i', combined,
        '-map_metadata', '-1', '-threads', '1', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3',
        '-fs', String(MAX_AUDIO_BYTES), target], workDirectory, input.signal);
      const file = await stat(target);
      if (!file.size || file.size >= MAX_AUDIO_BYTES) throw new AudioProcessingError('audio_output_limit', 'Assembled speech exceeds the safe file size.');
      const result = await inspectAudioFile(new Uint8Array(await readFile(target)), target, { signal: input.signal });
      if (Math.abs(result.audio.durationSeconds - byteSize / (SAMPLE_RATE * 2)) > 0.2) throw new AudioProcessingError('invalid_audio_duration', 'Speech assembly changed the duration unexpectedly.');
      return result;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
}
