import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { z } from 'zod';
import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import type { HomeSubjectSnapshot } from './home-image-settings';

export const HOME_GENERATE_IMAGE_TOOL = 'home_generate_image';
export const HOME_IMAGE_MODELS_TOOL = 'home_image_models';
export const HOME_GENERATION_PRESENTATION = 'image-production.home-generation';
export const homeGenerationInputSchema = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  model: z.string().trim().min(1).max(255).default(DEFAULT_IMAGE_MODEL),
  aspectRatio: z.string().min(1).max(20).default('1:1'),
  size: z.string().min(1).max(20).default('1K'),
  referenceIndexes: z.array(z.number().int().min(0).max(2)).max(3).optional(),
}).strict();
export type HomeGenerationInput = z.infer<typeof homeGenerationInputSchema>;
export type HomeGenerationStoredInput = HomeGenerationInput & {
  settingsId?: string;
  subjects?: HomeSubjectSnapshot[];
  submitAuthorized?: true;
};

export const homeGenerationTools: AgentToolDefinition[] = [{
  name: HOME_IMAGE_MODELS_TOOL,
  description: 'Read the supported image models, sizes and aspect ratios before changing generation parameters.',
  riskLevel: 'read', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}, {
  name: HOME_GENERATE_IMAGE_TOOL,
  description: 'Start one image generation requested by the original textual Home message. Clicking Create or pressing Enter in the image composer authorizes this one image: do not ask for a second confirmation. The host consumes that authorization through the signed write-tool protocol. Reuses the same job for retries of this user message; another image requires a new textual user message. References are indexes of images attached to this exact user message; omit to use all of them. Never invent attachment IDs or URLs. Does not create or edit a Flow.',
  riskLevel: 'write',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['prompt'], properties: {
      prompt: { type: 'string', minLength: 1, maxLength: 20_000 },
      model: { type: 'string', description: `Default: ${DEFAULT_IMAGE_MODEL}. Use only an actual model from home_image_models.` },
      aspectRatio: { type: 'string', description: 'Default 1:1. Must be supported by the model.' },
      size: { type: 'string', description: 'Default 1K. Must be supported by the model.' },
      referenceIndexes: { type: 'array', maxItems: 3, items: { type: 'integer', minimum: 0, maximum: 2 } },
    },
  },
}];
