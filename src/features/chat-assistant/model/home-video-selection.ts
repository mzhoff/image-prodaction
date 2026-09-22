import { DEFAULT_VIDEO_MODEL, type VideoModelCapabilities, type VideoSettings } from '@/shared/media/video-generation-contracts';

export type HomeVideoSelection = Omit<VideoSettings, 'prompt' | 'seed'>;
export const DEFAULT_HOME_VIDEO_SELECTION: HomeVideoSelection = {
  model: DEFAULT_VIDEO_MODEL, mode: 'text', duration: 4, resolution: '720p', aspectRatio: '16:9', generateAudio: false,
};

/** Never retain unsupported parameters when changing model. */
export function resolveHomeVideoSelection(draft: HomeVideoSelection, models: VideoModelCapabilities[]) {
  const model = models.find((item) => item.key === draft.model) ?? models[0];
  if (!model) return { model, value: draft };
  const mode = draft.mode === 'references' && model.references ? 'references'
    : draft.mode === 'frames' && model.firstFrame ? 'frames' : 'text';
  return { model, value: {
    model: model.key, mode,
    duration: model.durations.includes(draft.duration) ? draft.duration : model.durations[0],
    resolution: model.resolutions.includes(draft.resolution) ? draft.resolution : model.resolutions[0],
    aspectRatio: model.aspectRatios.includes(draft.aspectRatio) ? draft.aspectRatio : model.aspectRatios[0],
    generateAudio: model.audio && draft.generateAudio,
  } satisfies HomeVideoSelection };
}

export function homeVideoReferenceError(selection: HomeVideoSelection, model: VideoModelCapabilities | undefined, count: number, hasOtherFiles: boolean) {
  if (hasOtherFiles) return 'Для видео используйте изображения JPG, PNG или WebP. Остальные файлы можно обсудить в режиме «Текст».';
  if (count && selection.mode === 'text') {
    const supported = [model?.references && '«Референсы»', model?.firstFrame && '«По кадрам»'].filter(Boolean).join(' или ');
    return supported ? `Выберите ${supported}, чтобы использовать прикреплённые изображения, либо уберите их.`
      : 'Эта модель создаёт видео только по описанию. Выберите модель с поддержкой изображений или уберите вложения.';
  }
  if (selection.mode === 'references' && !count) return 'Добавьте хотя бы одно изображение-референс.';
  if (selection.mode === 'frames' && !count) return 'Добавьте изображение для первого кадра.';
  if (selection.mode === 'frames' && count > (model?.lastFrame ? 2 : 1)) return model?.lastFrame
    ? 'Оставьте два изображения: первое станет начальным кадром, второе — конечным.'
    : 'Эта модель принимает только один начальный кадр. Уберите лишние изображения.';
}
