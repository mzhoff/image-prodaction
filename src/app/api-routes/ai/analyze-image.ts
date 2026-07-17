import { z } from 'zod';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import {
  executeShortOpenRouterChat,
  getProviderText,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';

export const runtime = 'nodejs';

const analyzeImageSchema = z.object({
  ...shortAiScopeSchema.shape,
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  prompt: z.string().min(1),
  imageDataUrl: z.string().min(1),
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
            text: 'You are a senior art director, commercial image analyst, and prompt engineer for AI image production. Follow the user instruction exactly. Return detailed, structured, production-ready notes that can be reused directly as an image generation prompt. Preserve visible text exactly, especially Cyrillic. Do not invent brand names or logos.',
          }],
        },
        {
          role: 'user',
          parts: [
            { modality: 'text', text: parsed.data.prompt },
            { modality: 'image', url: parsed.data.imageDataUrl },
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
