import { runAudioProgram } from './audio-process';
import { videoInputArguments } from './video-inspection';
import { VideoProcessingError, type VideoContainer, type VideoMetadata } from './video-contracts';

/** Track duration alone does not locate delayed audio on the source timeline. */
export async function readVideoTrimTiming(input: { container: VideoContainer; source: string; directory: string; video: VideoMetadata; audioTrackIndex?: number; signal?: AbortSignal }) {
  const raw = await runAudioProgram('ffprobe', ['-v', 'error', ...videoInputArguments(input.container, input.source),
    '-show_entries', 'stream=index,codec_type,start_time,duration:format=start_time', '-of', 'json'], input.directory, input.signal);
  const probe = JSON.parse(raw) as { streams?: Array<{ index: number; codec_type: string; start_time?: string; duration?: string }>; format?: { start_time?: string } };
  const origin = Number(probe.format?.start_time ?? 0);
  const picture = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.index === input.audioTrackIndex && stream.codec_type === 'audio');
  const pictureEndSeconds = Number(picture?.start_time ?? origin) - origin + (Number(picture?.duration) || input.video.pictureDurationSeconds || input.video.durationSeconds);
  const audioStartSeconds = Math.max(0, Number(audio?.start_time ?? origin) - origin);
  if (!Number.isFinite(pictureEndSeconds) || pictureEndSeconds <= 0 || !Number.isFinite(audioStartSeconds) || (input.audioTrackIndex !== undefined && !audio)) {
    throw new VideoProcessingError('invalid_video_trim', 'Source track timestamps could not be read.');
  }
  return { pictureEndSeconds, audioStartSeconds };
}
