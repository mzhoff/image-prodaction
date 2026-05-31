import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import { DEFAULT_IMAGE_MODEL, getImageModelConfig, PREFERRED_IMAGE_MODEL_IDS } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const editImageSchema = z.object({
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  prompt: z.string().min(1),
  imageDataUrl: z.string().min(1),
  maskDataUrl: z.string().min(1),
  aspectRatio: z.string().min(1).default('1:1'),
  size: z.string().min(1).default('1K'),
});

export async function POST(request: Request) {
  const parsed = editImageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const imageConfig = getImageModelConfig(parsed.data.model);
  if (!imageConfig.aspectRatios.includes(parsed.data.aspectRatio) || !imageConfig.sizes.includes(parsed.data.size)) {
    return Response.json({ error: 'Aspect ratio or size is not available for selected model.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      imageDataUrl: parsed.data.imageDataUrl,
      message: 'Mock edit: OPENROUTER_API_KEY is not configured.',
      provider: 'mock',
    });
  }

  try {
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image editing.` }, { status: 400 });
    }

    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: composeEditPrompt(parsed.data.prompt) },
      { type: 'text', text: 'Source image. Preserve all unmasked regions as much as possible.' },
      { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
      { type: 'text', text: 'Mask image. White pixels define the only area allowed to change. Black pixels define protected areas.' },
      { type: 'image_url', image_url: { url: parsed.data.maskDataUrl } },
    ];

    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [{ role: 'user', content }],
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
      error: formatOpenRouterError(error, 'OpenRouter image edit failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function composeEditPrompt(userPrompt: string) {
  return [
    'You are an AI image editor.',
    'Task: regenerate only the masked fragment of the source image.',
    '',
    'Inputs:',
    '- Image 1 is the source image.',
    '- Image 2 is a black-and-white mask.',
    '- White mask area is the edit region.',
    '- Black mask area is protected and must remain visually unchanged.',
    '',
    'Rules:',
    '- Do not redesign the whole image.',
    '- Do not change framing, composition, camera, lighting, color grade, text, people, objects, or background outside the white mask area.',
    '- Blend the edited region naturally into the surrounding pixels.',
    '- Keep the final image the same overall style and production quality as the source.',
    '',
    'User edit instruction:',
    userPrompt,
  ].join('\n');
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
