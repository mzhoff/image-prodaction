import { createFallbackCatalog } from '@/shared/api/openrouter-models';
import { openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';

export async function readImageGenerationModelCatalog() {
  const legacy = createFallbackCatalog().imageModels;
  try {
    const models = await openRouterImageCatalog.listModels();
    const existing = new Set(legacy.map((model) => model.id));
    return { imageGenerationModels: [...legacy, ...models.filter((model) => !existing.has(model.id))] };
  } catch {
    return { imageGenerationModels: legacy, imageCatalogError: 'Live OpenRouter image catalog unavailable. Do not invent additional models or settings.' };
  }
}
