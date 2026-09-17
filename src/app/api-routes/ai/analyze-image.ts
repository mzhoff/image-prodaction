import { z } from 'zod';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { getExtractSystemPrompt } from '@/entities/production-graph/model/extract-presets';
import {
  executeShortOpenRouterChat,
  getProviderText,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';

export const runtime = 'nodejs';

const analyzeImageSchema = z.object({
  ...shortAiScopeSchema.shape,
  analysisPreset: z.enum(['composition', 'graphics', 'character', 'location']).default('composition'),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  prompt: z.string().min(1),
  imageDataUrls: z.array(z.string().min(1)).min(1).max(5),
});

export async function POST(request: Request) {
  const parsed = analyzeImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const execution = await executeShortOpenRouterChat({
      request,
      scope: parsed.data,
      providerRequest: {
        modelId: parsed.data.model,
        operation: 'analyze_image',
        expectedOutputModalities: ['text'],
        messages: [
        {
          role: 'system',
          parts: [{
            modality: 'text',
            text: getExtractSystemPrompt(parsed.data.analysisPreset, parsed.data.imageDataUrls.length > 1),
          }],
        },
        {
          role: 'user',
          parts: [
            { modality: 'text', text: parsed.data.prompt },
            ...parsed.data.imageDataUrls.map((url) => ({ modality: 'image' as const, url })),
          ],
        },
        ],
        parameters: {
          maxOutputTokens: 3500,
          temperature: 0.2,
        },
      },
      transform: (result) => ({ text: getProviderText(result) }),
    });

    return Response.json({
      ...execution.result,
      job: execution.job,
      provider: 'openrouter',
    });
  } catch (error) {
    return toShortAiApiErrorResponse(error);
  }
}
