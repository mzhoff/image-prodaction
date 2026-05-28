import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  PREFERRED_IMAGE_MODEL_IDS,
} from '@/shared/api/openrouter-models';
import { productionLayers } from '@/entities/production-graph/model/production-layers';

export const runtime = 'nodejs';

const structuredInputsSchema = z.object({
  actors: z.array(z.string().min(1)).default([]),
  actions: z.array(z.string().min(1)).default([]),
  composition: z.array(z.string().min(1)).default([]),
  camera: z.array(z.string().min(1)).default([]),
  background: z.array(z.string().min(1)).default([]),
  style: z.array(z.string().min(1)).default([]),
  light: z.array(z.string().min(1)).default([]),
  color: z.array(z.string().min(1)).default([]),
  metaphor: z.array(z.string().min(1)).default([]),
  text: z.array(z.string().min(1)).default([]),
});

const emptyStructuredInputs = {
  actors: [],
  actions: [],
  composition: [],
  camera: [],
  background: [],
  style: [],
  light: [],
  color: [],
  metaphor: [],
  text: [],
};

const generateImageSchema = z.object({
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  prompt: z.string().default(''),
  aspectRatio: z.string().min(1).default('16:9'),
  size: z.string().min(1).default('1K'),
  inputs: structuredInputsSchema.default(emptyStructuredInputs),
  referenceImages: z.array(z.string().min(1)).max(4).default([]),
});

export async function POST(request: Request) {
  const parsed = generateImageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const hasPrompt = parsed.data.prompt.trim().length > 0;
  const hasStructuredText = Object.values(parsed.data.inputs).some((items) => items.length > 0);
  const hasImages = parsed.data.referenceImages.length > 0;
  if (!hasPrompt && !hasStructuredText && !hasImages) {
    return Response.json({ error: 'Add a prompt or connect at least one reference.' }, { status: 400 });
  }

  const imageConfig = getImageModelConfig(parsed.data.model);
  if (!imageConfig.aspectRatios.includes(parsed.data.aspectRatio) || !imageConfig.sizes.includes(parsed.data.size)) {
    return Response.json({ error: 'Aspect ratio or size is not available for selected model.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      imageDataUrl: null,
      message: 'Mock generation: OPENROUTER_API_KEY is not configured.',
      provider: 'mock',
    });
  }

  try {
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image generation.` }, { status: 400 });
    }

    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: composeGenerationPrompt(parsed.data.prompt, parsed.data.inputs) },
            ...parsed.data.referenceImages.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ],
        },
      ],
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: parsed.data.aspectRatio,
        image_size: parsed.data.size,
      },
    });

    const message = result.choices?.[0]?.message;
    const imageUrl = extractImageUrl(message);
    return Response.json({
      imageDataUrl: imageUrl ? await normalizeImageUrl(imageUrl) : null,
      message: typeof message?.content === 'string' ? message.content : '',
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter generation failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function composeGenerationPrompt(prompt: string, inputs: z.infer<typeof structuredInputsSchema>) {
  const sections = productionLayers.map((layer) => [layer.label, inputs[layer.id]] as const);

  return [
    'Generate one production-ready image. Use connected image references only as visual references, not as assets to copy literally.',
    ...sections
      .filter(([, values]) => values.length > 0)
      .map(([label, values]) => `${label}:\n${values.map((value) => `- ${value}`).join('\n')}`),
    prompt.trim() ? `Additional user prompt:\n${prompt.trim()}` : '',
    'Avoid text, logos, watermarks, UI noise, and accidental typography unless the prompt explicitly asks for it.',
  ].filter(Boolean).join('\n\n');
}

function extractImageUrl(message?: {
  content?: string;
  images?: Array<{
    type?: string;
    image_url?: {
      url?: string;
    };
  }>;
}) {
  return message?.images?.find((image) => image.image_url?.url)?.image_url?.url ?? null;
}

async function normalizeImageUrl(url: string) {
  if (url.startsWith('data:')) return url;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`OpenRouter image download failed: ${response.status}`);
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}
