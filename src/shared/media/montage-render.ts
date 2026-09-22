import { mediaPath, type MediaSource } from './media-source';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { runAudioProgram, withAudioWork } from './audio-process';
import { audioInputArguments, detectAudioContainer } from './audio-inspection';
import { detectVideoContainer, videoInputArguments } from './video-inspection';
import { inspectVideoBytes } from './video-processor';
import { MAX_VIDEO_BYTES, MAX_VIDEO_OUTPUT_BYTES, type VideoMetadata } from './video-contracts';

export interface MontageRenderInput {
  frameRate?: number; aspectRatio: '16:9' | '9:16' | '1:1'; sourceAudioGain?: number;
  clips: Array<{ assetId: string; kind: 'video' | 'image' | 'gap'; sourceInMs: number; durationMs: number; sourceAudioMuted?: boolean }>;
  audioClips?: Array<{ assetId: string; sourceInMs: number; durationMs: number; startMs: number; gain: number }>;
}
export type RenderMedia = { bytes: MediaSource; video?: VideoMetadata; dispose?: () => Promise<void> };

/** Sequential decoding bounds memory and avoids opening hundreds of source decoders. */
export async function renderMontage(input: MontageRenderInput, load: (id: string) => Promise<RenderMedia>, signal: AbortSignal) {
  const fps = input.frameRate ?? 30;
  if (![24, 25, 30, 50, 60].includes(fps) || !input.clips.length || input.clips.length > 200 || (input.audioClips?.length ?? 0) > 32) throw new Error('Рендер поддерживает 1–200 видимых фрагментов и до 32 аудиоклипов.');
  const totalMs = input.clips.reduce((sum, clip) => sum + clip.durationMs, 0);
  if (totalMs > 300_000 || totalMs < 100) throw new Error('MP4 render поддерживает монтаж до пяти минут.');
  const duration = Math.round(totalMs * fps / 1000) / fps;
  const [width, height] = input.aspectRatio === '9:16' ? [720, 1280] : input.aspectRatio === '1:1' ? [720, 720] : [1280, 720];
  const bytes = await withAudioWork(new Uint8Array(), signal, async (directory, source) => {
    let positionMs = 0, tempBytes = 0;
    const segments: string[] = [];
    for (const [index, clip] of input.clips.entries()) {
      signal.throwIfAborted();
      const endFrame = Math.round((positionMs + clip.durationMs) * fps / 1000);
      const frames = endFrame - Math.round(positionMs * fps / 1000); positionMs += clip.durationMs;
      if (frames < 1) continue;
      const media: RenderMedia = clip.kind === 'gap' ? { bytes: new Uint8Array() } : await load(clip.assetId);
      try {
      if (media.bytes.byteLength > MAX_VIDEO_BYTES) throw new Error('Исходник превышает лимит обработки.');
      const sourceBytes = clip.kind === 'image' ? await sharp(media.bytes instanceof Uint8Array ? media.bytes : media.bytes.path, { limitInputPixels: 40_000_000, animated: false, failOn: 'warning' })
        .rotate().resize(width, height, { fit: 'inside', withoutEnlargement: true }).png().timeout({ seconds: 10 }).toBuffer() : media.bytes;
      signal.throwIfAborted(); const sourcePath = clip.kind === 'gap' ? '' : await mediaPath(sourceBytes, source);
      const seconds = frames / fps;
      const sourceArgs = clip.kind === 'gap' ? ['-f', 'lavfi', '-i', `color=black:size=${width}x${height}:rate=${fps}`] : clip.kind === 'video' ? videoInputArguments(detectVideoContainer(media.bytes), sourcePath) : ['-protocol_whitelist', 'file,pipe', '-threads', '1', '-loop', '1', '-framerate', String(fps), '-i', sourcePath];
      const track = clip.kind === 'video' && !clip.sourceAudioMuted && (input.sourceAudioGain ?? 1) > 0 ? media.video?.audioTracks.find((t) => t.isDefault) ?? media.video?.audioTracks[0] : undefined;
      const target = join(directory, `segment-${index}.mov`);
      await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y',
        ...(clip.kind === 'video' ? ['-ss', String(clip.sourceInMs / 1000)] : []), ...sourceArgs,
        ...(!track ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
        '-map', '0:v:0', '-map', track ? `0:${track.index}` : '1:a:0', '-sn', '-dn', '-map_metadata', '-1', '-threads', '1', '-filter_threads', '1',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},setpts=PTS-STARTPTS,format=yuv420p`,
        '-af', `asetpts=PTS-STARTPTS,aresample=48000,volume=${track ? input.sourceAudioGain ?? 1 : 0},apad,atrim=duration=${seconds}`,
        '-frames:v', String(frames), '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '4M', '-bufsize', '8M',
        '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-fs', String(MAX_VIDEO_OUTPUT_BYTES), '-f', 'mov', target], directory, signal);
      const size = (await stat(target)).size; tempBytes += size;
      if (size >= MAX_VIDEO_OUTPUT_BYTES || tempBytes > 512 * 1024 * 1024) throw new Error('Рендер превысил лимит временных файлов.');
      segments.push(`file 'segment-${index}.mov'`);
      } finally { await media.dispose?.(); }
    }
    await writeFile(join(directory, 'concat.txt'), segments.join('\n'));
    const audioMedia: RenderMedia[] = [];
    try {
    const audioArgs: string[] = [], filters: string[] = ['[0:a]asetpts=PTS-STARTPTS[base]'];
    for (const [index, clip] of (input.audioClips ?? []).entries()) {
      const media = await load(clip.assetId), path = join(directory, `audio-${index}`);
      audioMedia.push(media);
      tempBytes += media.bytes.byteLength;
      if (tempBytes > 768 * 1024 * 1024) throw new Error('Аудио превышает лимит временных файлов.');
      const sourcePath = await mediaPath(media.bytes, path);
      audioArgs.push(...audioInputArguments(detectAudioContainer(media.bytes), sourcePath));
      filters.push(`[${index + 1}:a]atrim=start=${clip.sourceInMs / 1000}:duration=${clip.durationMs / 1000},asetpts=PTS-STARTPTS,aresample=48000,volume=${clip.gain},adelay=${clip.startMs}:all=1[a${index}]`);
    }
    filters.push(`[base]${(input.audioClips ?? []).map((_, index) => `[a${index}]`).join('')}amix=inputs=${1 + (input.audioClips?.length ?? 0)}:normalize=0:duration=first,alimiter=limit=0.95:latency=1,apad,atrim=duration=${duration}[audio]`);
    const target = join(directory, 'render.mp4');
    await runAudioProgram('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', join(directory, 'concat.txt'),
      ...audioArgs, '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-ar', '48000', '-ac', '2', '-t', String(duration), '-map_metadata', '-1', '-movflags', '+faststart', '-fs', String(MAX_VIDEO_OUTPUT_BYTES), '-f', 'mp4', target], directory, signal);
    if ((await stat(target)).size >= MAX_VIDEO_OUTPUT_BYTES) throw new Error('Готовое видео превысило 128 МиБ.');
    return await readFile(target);
    } finally { await Promise.all(audioMedia.map((media) => media.dispose?.())); }
  });
  // Release the decode semaphore before inspection takes its own slot.
  const result = await inspectVideoBytes(bytes, { maxBytes: MAX_VIDEO_OUTPUT_BYTES, signal });
  if (!result.video.browserPlayable || Math.abs(result.video.durationSeconds - duration) > 1 / fps + 0.03) throw new Error('Длительность готового видео не совпала с монтажом.');
  return result;
}
