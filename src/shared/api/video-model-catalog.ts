import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';

let pending: Promise<VideoModelCapabilities[]> | undefined;
export function loadVideoModels() {
  pending ??= fetch('/api/ai/video-models', { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error('Каталог видео недоступен. Обновите каталог перед генерацией.');
    return (await response.json()).models as VideoModelCapabilities[];
  }).finally(() => { pending = undefined; });
  return pending;
}
