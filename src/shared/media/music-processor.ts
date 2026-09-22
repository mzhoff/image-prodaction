import type { MediaSource } from './media-source';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withAudioWork, runAudioProgram } from './audio-process';
import { audioInputArguments, detectAudioContainer } from './audio-inspection';
import { analyzeMusicPcm } from './music-rhythm';

export async function analyzeMusicBytes(input: {
  bytes: MediaSource; sourceInMs: number; durationMs: number; bpm?: number; beatOffsetMs?: number; signal: AbortSignal;
}) {
  if (!Number.isInteger(input.durationMs) || input.durationMs < 5000 || input.durationMs > 180_000
    || !Number.isInteger(input.sourceInMs) || input.sourceInMs < 0) throw new Error('Неверный диапазон музыки.');
  return withAudioWork(input.bytes, input.signal, async (directory, source) => {
    const target = join(directory, 'rhythm.pcm');
    await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...audioInputArguments(detectAudioContainer(input.bytes), source),
      '-ss', String(input.sourceInMs / 1000), '-t', String(input.durationMs / 1000), '-vn', '-sn', '-dn', '-ac', '1', '-ar', '8000',
      '-c:a', 'pcm_s16le', '-fs', String(8000 * 2 * 181), '-f', 's16le', target], directory, input.signal);
    const pcm = await readFile(target);
    if (Math.abs(pcm.length / 16 - input.durationMs) > 100) throw new Error('Музыки недостаточно для выбранной длительности.');
    return analyzeMusicPcm(pcm, input);
  });
}
