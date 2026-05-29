import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const analyzeImageSchema = z.object({
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  prompt: z.string().min(1),
  imageDataUrl: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = analyzeImageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      text: 'Mock analysis result: чистое описание референса, подготовленное для передачи в Generate Image.',
      provider: 'mock',
    });
  }

  try {
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'system',
          content: 'You are a senior art director, commercial image analyst, and prompt engineer for AI image production. Follow the user instruction exactly. Return detailed, structured, production-ready notes that can be reused directly as an image generation prompt. Preserve visible text exactly, especially Cyrillic. Do not invent brand names or logos.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: parsed.data.prompt },
            { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
          ],
        },
      ],
      modalities: ['text'],
      maxTokens: 3500,
      temperature: 0.2,
    });

    return Response.json({
      text: result.choices?.[0]?.message?.content ?? '',
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter analysis failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}
