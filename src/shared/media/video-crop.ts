import { VideoProcessingError, videoCropSchema, type VideoCrop, type VideoMetadata } from './video-contracts';

/** FFmpeg autorotation runs before the crop filter, as it does in the browser. */
export function getVideoDisplayDimensions(video: Pick<VideoMetadata, 'width' | 'height' | 'rotationDegrees'>) {
  const rotation = ((video.rotationDegrees % 360) + 360) % 360;
  const quarterTurns = Math.round(rotation / 90);
  if (Math.abs(rotation - quarterTurns * 90) > 0.01) {
    throw new VideoProcessingError('unsupported_video_rotation', 'Video cropping supports rotation by 90 degree steps.');
  }
  return quarterTurns % 2 === 1 ? { width: video.height, height: video.width } : { width: video.width, height: video.height };
}

/** Round inward to whole chroma pairs. No padding, stretching, or out-of-frame pixels. */
export function resolveVideoCropPixels(video: Pick<VideoMetadata, 'width' | 'height' | 'rotationDegrees'>, crop: VideoCrop) {
  const bounds = videoCropSchema.safeParse(crop);
  if (!bounds.success) throw new VideoProcessingError('invalid_video_crop', 'The crop must stay inside the video picture.', 400);
  const display = getVideoDisplayDimensions(video);
  const even = (value: number) => Math.floor((value + 1e-8) / 2) * 2;
  const x = even(bounds.data.x * display.width);
  const y = even(bounds.data.y * display.height);
  const width = Math.min(even(bounds.data.width * display.width), even(display.width - x));
  const height = Math.min(even(bounds.data.height * display.height), even(display.height - y));
  if (width < 2 || height < 2) throw new VideoProcessingError('invalid_video_crop', 'The selected video crop is too small.');
  return { x, y, width, height };
}
