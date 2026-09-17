import { fetchOpenRouterModels, fetchOpenRouterSpeechModels } from '@/shared/api/openrouter';
import { createCatalogFromOpenRouter, createFallbackCatalog } from '@/shared/api/openrouter-models';
import type { OpenRouterRawModel } from '@/shared/api/openrouter-models';
import { openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';

export const runtime = 'nodejs';

export async function GET() {
  const [response, speechResponse, imageResponse] = await Promise.allSettled([
    fetchOpenRouterModels(), fetchOpenRouterSpeechModels(), openRouterImageCatalog.listModels(),
  ]);
  const models = response.status === 'fulfilled' && Array.isArray(response.value.data)
    ? response.value.data as OpenRouterRawModel[] : [];
  const speechModels = speechResponse.status === 'fulfilled' && Array.isArray(speechResponse.value.data)
    ? speechResponse.value.data as OpenRouterRawModel[] : [];
  const catalog = createCatalogFromOpenRouter(models, speechModels);
  const fallback = createFallbackCatalog();
  if (!catalog.analysisModels.length) catalog.analysisModels = fallback.analysisModels;
  if (!catalog.imageModels.length) catalog.imageModels = fallback.imageModels;
  if (!catalog.speechModels.length) catalog.speechModels = fallback.speechModels;
  // Editing nodes retain their existing contract; only Generate Image uses the Images API.
  catalog.generationModels = [...catalog.imageModels];
  if (imageResponse.status === 'fulfilled' && imageResponse.value.length) {
    const existingIds = new Set(catalog.generationModels.map((model) => model.id));
    catalog.generationModels.push(...imageResponse.value.filter((model) => model.id !== 'openrouter/auto' && !existingIds.has(model.id)));
  } else {
    catalog.imageCatalogError = 'Каталог изображений OpenRouter недоступен. Перезагрузите страницу, чтобы обновить модели.';
  }
  return Response.json(catalog, { headers: { 'Cache-Control': 'no-store' } });
}
