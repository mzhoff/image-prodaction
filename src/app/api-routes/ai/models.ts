import { fetchOpenRouterModels, fetchOpenRouterSpeechModels } from '@/shared/api/openrouter';
import { createCatalogFromOpenRouter, createFallbackCatalog } from '@/shared/api/openrouter-models';
import type { OpenRouterRawModel } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [response, speechResponse] = await Promise.all([
      fetchOpenRouterModels(),
      fetchOpenRouterSpeechModels(),
    ]);
    const models = Array.isArray(response.data) ? response.data as OpenRouterRawModel[] : [];
    const speechModels = Array.isArray(speechResponse.data) ? speechResponse.data as OpenRouterRawModel[] : [];
    const catalog = createCatalogFromOpenRouter(models, speechModels);

    if (catalog.analysisModels.length === 0 || catalog.imageModels.length === 0 || catalog.speechModels.length === 0) {
      return Response.json(createFallbackCatalog());
    }

    return Response.json(catalog);
  } catch (error) {
    return Response.json({
      ...createFallbackCatalog(),
      error: error instanceof Error ? error.message : 'OpenRouter models request failed',
    });
  }
}
