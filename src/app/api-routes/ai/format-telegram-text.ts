import { z } from 'zod';
import {
  assertTelegramFormattingPreservesText,
  createTelegramEditorValueFromSegments,
  parseTelegramFormatSegmentsPayload,
} from '@/features/graph-node/lib/telegram-rich-text';
import { DEFAULT_ANALYSIS_MODEL, PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import {
  executeShortOpenRouterChat,
  getProviderText,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';

export const runtime = 'nodejs';

const telegramFormatSchema = z.object({
  ...shortAiScopeSchema.shape,
  inputText: z.string().default(''),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  rulesText: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = telegramFormatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inputText = parsed.data.inputText.trim();
  if (!inputText) {
    return Response.json({ error: 'Connect or enter text before formatting Telegram post.' }, { status: 400 });
  }

  try {
    if (!PREFERRED_ANALYSIS_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for Telegram formatting.` }, { status: 400 });
    }

    const execution = await executeShortOpenRouterChat({
      request,
      scope: parsed.data,
      providerRequest: {
        modelId: parsed.data.model,
        operation: 'format_telegram_text',
        expectedOutputModalities: ['text'],
        messages: [{
          role: 'user',
          parts: [{
            modality: 'text',
            text: composeTelegramFormattingPrompt(inputText, parsed.data.rulesText),
          }],
        }],
        parameters: {
          maxOutputTokens: Math.min(6000, Math.max(1200, Math.ceil(inputText.length * 1.8))),
          temperature: 0.2,
        },
      },
      transform: (result) => {
        const segments = parseTelegramFormatSegmentsPayload(getProviderText(result));
        const formattedValue = createTelegramEditorValueFromSegments(inputText, segments);
        assertTelegramFormattingPreservesText(inputText, formattedValue.plainText);
        return formattedValue;
      },
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

function composeTelegramFormattingPrompt(inputText: string, rulesText: string | undefined) {
  return [
    'You format Telegram posts for a Lexical rich-text editor.',
    'Your task is ONLY to add formatting metadata. Do not rewrite, translate, fix grammar, remove, add, or reorder any character.',
    'Return JSON only. Do not wrap it in Markdown.',
    '',
    'JSON schema:',
    '{ "segments": [ { "text": "exact substring from input", "formats": ["bold" | "italic" | "underline" | "strike" | "code"] } ] }',
    '',
    'Rules:',
    '- Concatenating every segments[].text in order MUST equal the input text exactly.',
    '- Escape newlines inside JSON strings as \\n. Never put raw line breaks inside a JSON string.',
    '- Every original character must appear exactly once.',
    '- Use empty formats or omit formats for normal text.',
    '- Prefer Telegram-readable emphasis: bold for the hook/key тезисы, italic for nuance, underline sparingly, strike only when semantically useful, code only for technical tokens.',
    '- Hashtags do not need formatting; the app visualizes them automatically.',
    '- Keep formatting fragment-level: you may format one character, one word, a phrase, a sentence, a paragraph, or the entire post when appropriate.',
    rulesText?.trim() ? `\nCustom formatting rules:\n${rulesText.trim()}` : '',
    '',
    'Input text:',
    inputText,
  ].filter(Boolean).join('\n');
}
