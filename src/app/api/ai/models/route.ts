import { fetchOpenRouterModels } from '@/shared/api/openrouter';
import { createCatalogFromOpenRouter, createFallbackCatalog } from '@/shared/api/openrouter-models';
import type { OpenRouterRawModel } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetchOpenRouterModels();
    const models = Array.isArray(response.data) ? response.data as OpenRouterRawModel[] : [];
    const catalog = createCatalogFromOpenRouter(models);

    if (catalog.analysisModels.length === 0 || catalog.imageModels.length === 0) {
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
