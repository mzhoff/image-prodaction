import { Camera, Circle, Clock, Film, MoveHorizontal } from '@prodactionpro/ui-core/icons';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS, VIDEO_MOVEMENT_OPTIONS, VIDEO_OPTICS_OPTIONS, VIDEO_SPEED_OPTIONS } from '@/shared/media/video-cinematic-catalog';

export const CAMERA_FIELDS = [
  { key: 'optics', title: 'Оптика', Icon: Circle, options: VIDEO_OPTICS_OPTIONS },
  { key: 'look', title: 'Камера / фактура', Icon: Camera, options: VIDEO_LOOK_OPTIONS },
  { key: 'grain', title: 'Зерно', Icon: Film, options: VIDEO_GRAIN_OPTIONS },
  { key: 'movement', title: 'Движение', Icon: MoveHorizontal, options: VIDEO_MOVEMENT_OPTIONS },
  { key: 'speed', title: 'Темп', Icon: Clock, options: VIDEO_SPEED_OPTIONS },
] as const;
