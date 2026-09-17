import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { VideoProcessingError } from './video-contracts';

/** Frame-level metadata is larger than ordinary upload metadata, but remains strictly bounded. */
export function runTimelineProgram(program: 'ffmpeg' | 'ffprobe', args: string[], directory: string, signal?: AbortSignal, onOutput?: (chunk: string) => void): Promise<string> {
  signal?.throwIfAborted();
  const configured = process.env[program === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'];
  if (configured && !isAbsolute(configured)) throw new VideoProcessingError('timeline_processor_unavailable', 'Media processor path must be absolute.', 503);
  return new Promise((resolve, reject) => {
    const child = spawn(configured || program, args, { cwd: directory, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', NODE_ENV: process.env.NODE_ENV } });
    const chunks: Buffer[] = []; let size = 0; let stderrBytes = 0; let failure: unknown; let stopped = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: unknown) => {
      if (stopped) return;
      stopped = true; failure = error; child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 500); killTimer.unref();
    };
    const abort = () => stop(signal?.reason ?? new VideoProcessingError('timeline_canceled', 'Timeline processing was canceled.', 499));
    const timer = setTimeout(() => stop(new VideoProcessingError('timeline_timeout', 'Timeline processing exceeded its time limit. Try a smaller video.')), 120_000);
    timer.unref(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => {
      if (stopped) return;
      size += chunk.length;
      if (size > 16 * 1024 * 1024) stop(new VideoProcessingError('timeline_metadata_limit', 'Video frame metadata exceeds the safe limit.'));
      else {
        chunks.push(chunk);
        try { onOutput?.(chunk.toString('utf8')); } catch (error) { stop(error); }
      }
    });
    // Never return decoder paths, file contents, or raw diagnostic output to consumers.
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > 64 * 1024) stop(new VideoProcessingError('invalid_timeline_video', 'The media processor rejected this video.'));
    });
    const cleanup = () => { clearTimeout(timer); if (killTimer) clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', () => { cleanup(); reject(new VideoProcessingError('timeline_processor_unavailable', 'The media processor is unavailable.', 503)); });
    child.on('close', (code) => {
      cleanup();
      if (stopped) reject(failure);
      else if (code !== 0) reject(new VideoProcessingError('invalid_timeline_video', 'This video could not be analyzed.'));
      else resolve(Buffer.concat(chunks, size).toString('utf8'));
    });
  });
}
