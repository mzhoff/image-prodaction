import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import { DEFAULT_ANALYSIS_MODEL, PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const textGenerationSchema = z.object({
  inputText: z.string().default(''),
  instruction: z.string().min(1),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']).default('plain'),
  reasoning: z.enum(['low', 'medium', 'high']).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(request: Request) {
  const parsed = textGenerationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.inputText.trim()) {
    return Response.json({ error: 'Connect text input before running text generation.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({
      provider: 'mock',
      text: parsed.data.inputText,
      message: 'Mock text generation: OPENROUTER_API_KEY is not configured.',
    });
  }

  try {
    if (!PREFERRED_ANALYSIS_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for text generation.` }, { status: 400 });
    }

    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [{ role: 'user', content: composeTextGenerationPrompt(parsed.data) }],
      maxTokens: 2200,
      reasoning: parsed.data.reasoning ? { effort: parsed.data.reasoning } : undefined,
      temperature: parsed.data.temperature,
    });

    return Response.json({
      provider: 'openrouter',
      text: extractText(result),
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter text generation failed'),
    }, { status: getOpenRouterErrorStatus(error) });
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

  return [
    'You are a production text assistant for an AI image pipeline.',
    styleInstruction,
    'Do not add explanations outside the requested output.',
    '',
    'Instruction:',
    instruction.trim(),
    '',
    'Input text:',
    inputText.trim(),
  ].join('\n');
}

function extractText(result: Awaited<ReturnType<typeof sendOpenRouterChat>>) {
  const content = result.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}
