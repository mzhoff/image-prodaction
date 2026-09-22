import { mediaPath, type MediaSource } from './media-source';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { AudioProcessingError } from './audio-contracts';

let active = 0;
const waiters = new Set<() => void>();
const QUEUE_LIMIT = 8;

/** One bounded temporary directory per operation; filenames never originate in a request. */
export async function withAudioWork<T>(bytes: MediaSource, signal: AbortSignal | undefined, work: (directory: string, source: string) => Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  if (active >= 2) {
    if (waiters.size >= QUEUE_LIMIT) throw new AudioProcessingError('audio_busy', 'Audio processing is busy. Retry shortly.', 503);
    await new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal?.reason); };
      const cleanup = () => { waiters.delete(ready); signal?.removeEventListener('abort', abort); };
      waiters.add(ready);
      signal?.addEventListener('abort', abort, { once: true });
    });
  } else active += 1;
  let directory: string | undefined;
  try {
    signal?.throwIfAborted();
    directory = await mkdtemp(join(tmpdir(), 'image-production-audio-'));
    const source = await mediaPath(bytes, join(directory, 'source'));
    return await work(directory, source);
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true }); }
    finally {
      const next = waiters.values().next().value;
      if (next) next(); else active -= 1;
    }
  }
}

export function runAudioProgram(program: 'ffmpeg' | 'ffprobe', args: string[], directory: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const configured = process.env[program === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  if (configured && !isAbsolute(configured)) throw new AudioProcessingError('audio_processor_unavailable', 'Audio processor path must be absolute.', 503);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(configured || program, args, {
      cwd: directory, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', NODE_ENV: process.env.NODE_ENV },
    });
    let stdout = '';
    let stderrBytes = 0;
    let failure: unknown;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: unknown) => {
      if (failure) return;
      failure = reason;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 500);
      killTimer.unref();
    };
    const abort = () => stop(signal?.reason ?? new AudioProcessingError('audio_canceled', 'Audio processing was canceled.', 499));
    const timer = setTimeout(() => stop(new AudioProcessingError('audio_timeout', 'Audio processing timed out.', 422)), program === 'ffprobe' ? 20_000 : 120_000);
    timer.unref();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return;
      if (Buffer.byteLength(stdout) + chunk.byteLength > 128 * 1024) {
        stop(new AudioProcessingError('invalid_audio', 'Audio metadata exceeds the safe limit.'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 64 * 1024) stop(new AudioProcessingError('invalid_audio', 'Audio processor rejected the file.'));
    });
    const cleanup = () => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', () => {
      cleanup();
      reject(new AudioProcessingError('audio_processor_unavailable', 'The audio processor is unavailable.', 503));
    });
    child.on('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(new AudioProcessingError('invalid_audio', 'The audio file could not be decoded.'));
      else resolve(stdout);
    });
  });
}
