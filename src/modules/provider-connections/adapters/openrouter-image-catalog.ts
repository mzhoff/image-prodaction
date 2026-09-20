import { getOpenRouterBaseUrl } from '@/shared/api/openrouter-endpoint';
import { z } from 'zod';
import {
  imageCapabilities, imageParametersSchema, normalizeImageCatalog, validateImageSettings,
  type ImageModelCapabilities,
} from '@/shared/api/image-model-capabilities';
import { getImageModelConfig, PREFERRED_IMAGE_MODEL_IDS } from '@/shared/api/openrouter-models';
import type { OpenRouterModelOption } from '@/shared/api/openrouter-model-contracts';
import type { ImageGenerationOptions } from '@/shared/media/image-generation-settings';

type ImageSettings = ImageGenerationOptions & { aspectRatio: string; size: string };
type CatalogFetch = typeof fetch;
const endpointsSchema = z.object({ endpoints: z.array(z.object({
  provider_tag: z.string().nullable(), supported_parameters: imageParametersSchema,
})) });

export class ImageModelValidationError extends Error {}

export function usesOpenRouterImagesApi(modelId: string) {
  return !PREFERRED_IMAGE_MODEL_IDS.includes(modelId);
}

export function createOpenRouterImageCatalog(fetcher: CatalogFetch = fetch, baseUrl = getOpenRouterBaseUrl()) {
  const cache = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  async function read(path: string) {
    const saved = cache.get(path);
    if (saved && saved.expires > Date.now()) return saved.value;
    const existing = pending.get(path);
    if (existing) return existing;
    const request = (async () => {
      const response = await fetcher(`${baseUrl}${path}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!response.ok) throw new Error('Каталог моделей изображений OpenRouter временно недоступен.');
      const value: unknown = await response.json();
      cache.set(path, { value, expires: Date.now() + 5 * 60_000 });
      return value;
    })().finally(() => { pending.delete(path); });
    pending.set(path, request);
    return request;
  }
  async function listModels(): Promise<OpenRouterModelOption[]> {
    return normalizeImageCatalog(await read('/images/models'));
  }
  async function resolve(modelId: string, settings: ImageSettings, referenceCount: number): Promise<{
    capabilities: ImageModelCapabilities; providerTag: string | null;
  } | null> {
    if (!usesOpenRouterImagesApi(modelId)) {
      const legacy = getImageModelConfig(modelId);
      if (!legacy.aspectRatios.includes(settings.aspectRatio) || !legacy.sizes.includes(settings.size)) {
        throw new ImageModelValidationError('Размер или пропорции недоступны для выбранной модели.');
      }
      if (['imageQuality', 'imageBackground', 'imageFormat', 'imageCompression', 'imageSeed'].some((key) => settings[key as keyof ImageSettings] !== undefined)) {
        throw new ImageModelValidationError('Эти настройки доступны только моделям из нового каталога изображений.');
      }
      return null;
    }
    const model = (await listModels()).find((item) => item.id === modelId);
    if (!model?.imageCapabilities) throw new ImageModelValidationError('Модель отсутствует в актуальном каталоге растровых изображений OpenRouter.');
    const catalogError = validateImageSettings(settings, referenceCount, model.imageCapabilities);
    if (catalogError) throw new ImageModelValidationError(catalogError);
    const { endpoints } = endpointsSchema.parse(await read(`/images/models/${modelId}/endpoints`));
    const endpoint = endpoints.find((item) => !validateImageSettings(settings, referenceCount, imageCapabilities(item.supported_parameters)));
    if (!endpoint) throw new ImageModelValidationError('В OpenRouter нет провайдера, который поддерживает это сочетание настроек. Обновите каталог и выберите другие параметры.');
    return { capabilities: imageCapabilities(endpoint.supported_parameters), providerTag: endpoint.provider_tag };
  }
  return { listModels, resolve };
}

export const openRouterImageCatalog = createOpenRouterImageCatalog();
