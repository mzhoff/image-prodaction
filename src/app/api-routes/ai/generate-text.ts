import { z } from 'zod';
import { DEFAULT_ANALYSIS_MODEL, PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import {
  executeShortOpenRouterChat,
  getProviderText,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';

export const runtime = 'nodejs';

const DEFAULT_TEXT_GENERATION_MAX_TOKENS = 64_000;
const TEXT_GENERATION_MAX_TOKENS_BY_MODEL: Record<string, number> = {
  'google/gemini-3.5-flash': 64_000,
  'google/gemini-2.5-flash': 64_000,
  'google/gemini-2.5-pro': 64_000,
  'openai/gpt-5.5': 128_000,
  'openai/gpt-5.5-pro': 128_000,
  'openai/gpt-5-mini': 128_000,
  'openai/gpt-5-pro': 128_000,
  'anthropic/claude-sonnet-4.6': 128_000,
  'anthropic/claude-sonnet-4.5': 64_000,
  'anthropic/claude-sonnet-4': 64_000,
};

const textGenerationSchema = z.object({
  ...shortAiScopeSchema.shape,
  inputText: z.string().default(''),
  instruction: z.string().default(''),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']).default('plain'),
  reasoning: z.enum(['low', 'medium', 'high']).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(request: Request) {
  const parsed = textGenerationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.inputText.trim() && !parsed.data.instruction.trim()) {
    return Response.json({ error: 'Add a prompt or connect text input before running text generation.' }, { status: 400 });
  }

  try {
    if (!PREFERRED_ANALYSIS_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for text generation.` }, { status: 400 });
    }

    const execution = await executeShortOpenRouterChat({
      request,
      scope: parsed.data,
      providerRequest: {
        modelId: parsed.data.model,
        operation: 'generate_text',
        expectedOutputModalities: ['text'],
        messages: [{
          role: 'user',
          parts: [{
            modality: 'text',
            text: composeTextGenerationPrompt(parsed.data),
          }],
        }],
        parameters: {
          maxOutputTokens: getTextGenerationMaxTokens(parsed.data.model),
          reasoningEffort: parsed.data.reasoning,
          temperature: parsed.data.temperature,
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

function composeTextGenerationPrompt({
  inputText,
  instruction,
  outputStyle,
}: z.infer<typeof textGenerationSchema>) {
  const styleInstruction = {
    plain: 'Return plain text only.',
    markdown: 'Return clean Markdown only.',
    'numbered-list': 'Return a numbered list. Put each item on its own line.',
  }[outputStyle];

  const sections = [
    'You are a production text assistant for an AI image pipeline.',
    styleInstruction,
    'Do not add explanations outside the requested output.',
  ];

  if (instruction.trim()) {
    sections.push('', 'Instruction:', instruction.trim());
  }

  if (inputText.trim()) {
    sections.push('', 'Input text:', inputText.trim());
  }

  return sections.join('\n');
}

function getTextGenerationMaxTokens(model: string) {
  return TEXT_GENERATION_MAX_TOKENS_BY_MODEL[model] ?? DEFAULT_TEXT_GENERATION_MAX_TOKENS;
}
