import { DEFAULT_VIDEO_DIRECTION, type VideoDirectionSettings, type VideoStyleSettings } from '@/shared/media/home-video-direction';
import type { VideoCameraSettings } from '@/shared/media/home-video-intent';

export type VideoDirectionLayer = 'story' | 'scene' | 'shot';
export const VIDEO_DIRECTION_LAYERS = [
  { id: 'story', label: 'История', description: 'Замысел, герои и общий стиль' },
  { id: 'scene', label: 'Сцена', description: 'Место, время и свет' },
  { id: 'shot', label: 'Кадр / план', description: 'Композиция и работа камеры' },
] as const;

export function initialVideoDirection(camera: VideoCameraSettings): VideoDirectionSettings {
  const value = structuredClone(DEFAULT_VIDEO_DIRECTION);
  value.story.style.look = camera.look;
  value.story.style.grain = camera.grain;
  Object.assign(value.shot, { optics: camera.optics, movement: camera.movement, speed: camera.speed });
  return value;
}

export function videoLayerConfigured(value: VideoDirectionSettings, layer: VideoDirectionLayer) {
  return JSON.stringify(value[layer]) !== JSON.stringify(DEFAULT_VIDEO_DIRECTION[layer]);
}

export function inheritedVideoStyle(value: VideoDirectionSettings, layer: VideoDirectionLayer): VideoStyleSettings {
  return { ...value.story.style, ...(layer === 'shot' ? value.scene.styleOverride : {}) };
}
