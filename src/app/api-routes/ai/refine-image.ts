import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import { DEFAULT_IMAGE_MODEL, PREFERRED_IMAGE_MODEL_IDS, getImageModelConfig } from '@/shared/api/openrouter-models';
import {
  extractOpenRouterImageUrl,
  extractOpenRouterMessageText,
  missingOpenRouterImageError,
  normalizeOpenRouterImageUrl,
  summarizeOpenRouterImageMessage,
} from './openrouter-image-result';

export const runtime = 'nodejs';

const refineModeSchema = z.enum(['reference-cleanup', 'detail-boost', 'high-res-redraw']);
const preserveStrengthSchema = z.enum(['strict', 'balanced', 'creative']);

const refineImageSchema = z.object({
  aspectRatio: z.string().min(1).default('1:1'),
  imageDataUrl: z.string().min(1),
  instruction: z.string().default(''),
  mode: refineModeSchema.default('reference-cleanup'),
  model: z.string().min(1).default(DEFAULT_IMAGE_MODEL),
  preserveStrength: preserveStrengthSchema.default('strict'),
  size: z.string().min(1).default('2K'),
});

export async function POST(request: Request) {
  const parsed = refineImageSchema.safeParse(await request.json());
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
      message: 'Mock refine: OPENROUTER_API_KEY is not configured.',
      provider: 'mock',
    });
  }

  try {
    if (!PREFERRED_IMAGE_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for image refine.` }, { status: 400 });
    }

    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: composeRefinePrompt(parsed.data) },
      { type: 'text', text: 'Source image to refine. Use it as the primary identity, shape, composition, and texture reference.' },
      { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
    ];

    console.info('[openrouter:image:refine] request', {
      aspectRatio: parsed.data.aspectRatio,
      mode: parsed.data.mode,
      model: parsed.data.model,
      preserveStrength: parsed.data.preserveStrength,
      size: parsed.data.size,
    });
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
    const responseSummary = summarizeOpenRouterImageMessage(message);
    console.info('[openrouter:image:refine] response', {
      ...responseSummary,
      model: parsed.data.model,
    });
    const imageUrl = extractOpenRouterImageUrl(message);
    if (!imageUrl) {
      console.warn('[openrouter:image:refine] missing image payload', {
        ...responseSummary,
        model: parsed.data.model,
      });
      return Response.json({ error: missingOpenRouterImageError('OpenRouter image refine') }, { status: 502 });
    }

    return Response.json({
      imageDataUrl: await normalizeOpenRouterImageUrl(imageUrl),
      message: extractOpenRouterMessageText(message),
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter image refine failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function composeRefinePrompt({
  instruction,
  mode,
  preserveStrength,
}: z.infer<typeof refineImageSchema>) {
  const modeInstruction = {
    'reference-cleanup': 'Clean artifacts, compression, noise, edge dirt, and weak details while keeping the source identity and design stable.',
    'detail-boost': 'Increase perceived detail, clarity, texture fidelity, and production quality without redesigning the subject.',
    'high-res-redraw': 'Create a high-quality redraw that preserves the same subject, silhouette, proportions, composition, and key visual traits.',
  }[mode];
  const preserveInstruction = {
    strict: 'Preservation is strict: do not alter identity, shape, logo, face structure, proportions, color scheme, pose, framing, or composition.',
    balanced: 'Preservation is balanced: keep identity, shape, proportions, and composition while improving weak visual details.',
    creative: 'Preservation is flexible: improve production quality while keeping the subject recognizable and the original composition readable.',
  }[preserveStrength];

  return [
    'You are an AI production image refiner.',
    'Task: improve the supplied image so it becomes a stronger reusable reference asset.',
    '',
    'Important:',
    '- This is generative refine, not mathematically exact pixel upscale.',
    '- Keep the source image as the primary reference.',
    '- Do not add text, logos, labels, watermarks, unrelated props, or extra subjects.',
    '- Preserve transparent/background intent where possible.',
    '',
    `Mode: ${mode}`,
    modeInstruction,
    '',
    `Preserve strength: ${preserveStrength}`,
    preserveInstruction,
    '',
    'User instruction:',
    instruction.trim() || 'Improve the image quality while preserving the subject identity and production usefulness.',
  ].join('\n');
}
