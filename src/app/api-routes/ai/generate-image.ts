import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import type { OpenRouterMessageContentImage, OpenRouterMessageContentText } from '@/shared/api/openrouter';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  PREFERRED_IMAGE_MODEL_IDS,
} from '@/shared/api/openrouter-models';
import type { GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import { composeGenerationPrompt, composeReferenceImageInstruction } from '@/entities/production-graph/model/generate-prompt-builder';
import { productionLayers } from '@/entities/production-graph/model/production-layers';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import {
  extractOpenRouterImageUrl,
  extractOpenRouterMessageText,
  missingOpenRouterImageError,
  normalizeOpenRouterImageUrl,
  summarizeOpenRouterImageMessage,
} from './openrouter-image-result';

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
  aspectRatio: z.string().min(1).default('1:1'),
  size: z.string().min(1).default('1K'),
  inputs: structuredInputsSchema.default(emptyStructuredInputs),
  referenceImages: z.array(z.object({
    dataUrl: z.string().min(1),
    sourceAssetId: z.string().optional(),
    sourceNodeTypes: z.array(z.custom<ProductionNodeType>(isProductionNodeType)).optional(),
    slots: z.array(z.custom<GenerateReferenceSlot>(isGenerateReferenceSlot)).default([]),
  })).max(4).default([]),
});

const referenceSlotIds = new Set<string>(['reference', ...productionLayers.map((layer) => layer.id)]);
const productionNodeTypes = new Set<string>([
  'importImage',
  'textPrompt',
  'imageToText',
  'referenceComposer',
  'generateImage',
  'sketch',
  'cropImage',
  'adjustment',
  'curves',
  'frequencyRetouch',
  'refineImage',
  'removeBackground',
  'exportImage',
  'preview',
]);

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

    const referenceImages = parsed.data.referenceImages;
    const prompt = composeGenerationPrompt({
      aspectRatio: parsed.data.aspectRatio,
      inputs: parsed.data.inputs,
      prompt: parsed.data.prompt,
      referenceImages,
      size: parsed.data.size,
    });
    const content: Array<OpenRouterMessageContentText | OpenRouterMessageContentImage> = [
      { type: 'text', text: prompt },
      ...referenceImages.flatMap((reference, index) => [
        { type: 'text' as const, text: composeReferenceImageInstruction(reference, index + 1) },
        { type: 'image_url' as const, image_url: { url: reference.dataUrl } },
      ]),
    ];

    console.info('[openrouter:image:generate] request', {
      aspectRatio: parsed.data.aspectRatio,
      model: parsed.data.model,
      referenceCount: referenceImages.length,
      size: parsed.data.size,
    });
    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: parsed.data.aspectRatio,
        image_size: parsed.data.size,
      },
    });

    const message = result.choices?.[0]?.message;
    const responseSummary = summarizeOpenRouterImageMessage(message);
    console.info('[openrouter:image:generate] response', {
      ...responseSummary,
      model: parsed.data.model,
    });
    const imageUrl = extractOpenRouterImageUrl(message);
    if (!imageUrl) {
      console.warn('[openrouter:image:generate] missing image payload', {
        ...responseSummary,
        model: parsed.data.model,
      });
      return Response.json({ error: missingOpenRouterImageError('OpenRouter generation') }, { status: 502 });
    }

    return Response.json({
      imageDataUrl: await normalizeOpenRouterImageUrl(imageUrl),
      message: extractOpenRouterMessageText(message),
      provider: 'openrouter',
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter generation failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
}

function isGenerateReferenceSlot(value: unknown) {
  return typeof value === 'string' && referenceSlotIds.has(value);
}

function isProductionNodeType(value: unknown) {
  return typeof value === 'string' && productionNodeTypes.has(value);
}
