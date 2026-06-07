import { z } from 'zod';
import {
  assertTelegramFormattingPreservesText,
  createTelegramEditorValueFromSegments,
  createTelegramFallbackFormatSegments,
  parseTelegramFormatSegmentsPayload,
} from '@/features/graph-node/lib/telegram-rich-text';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterChat } from '@/shared/api/openrouter';
import { DEFAULT_ANALYSIS_MODEL, PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';

export const runtime = 'nodejs';

const telegramFormatSchema = z.object({
  inputText: z.string().default(''),
  model: z.string().min(1).default(DEFAULT_ANALYSIS_MODEL),
  rulesText: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = telegramFormatSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inputText = parsed.data.inputText.trim();
  if (!inputText) {
    return Response.json({ error: 'Connect or enter text before formatting Telegram post.' }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    const formattedValue = createTelegramEditorValueFromSegments(
      inputText,
      createTelegramFallbackFormatSegments(inputText),
    );
    return Response.json({
      provider: 'mock',
      ...formattedValue,
      message: 'Mock Telegram formatting: OPENROUTER_API_KEY is not configured.',
    });
  }

  try {
    if (!PREFERRED_ANALYSIS_MODEL_IDS.includes(parsed.data.model)) {
      return Response.json({ error: `Model ${parsed.data.model} is not available for Telegram formatting.` }, { status: 400 });
    }

    const result = await sendOpenRouterChat({
      model: parsed.data.model,
      messages: [{ role: 'user', content: composeTelegramFormattingPrompt(inputText, parsed.data.rulesText) }],
      maxTokens: Math.min(6000, Math.max(1200, Math.ceil(inputText.length * 1.8))),
      temperature: 0.2,
    });
    const segments = parseTelegramFormatSegmentsPayload(extractText(result));
    const formattedValue = createTelegramEditorValueFromSegments(inputText, segments);
    assertTelegramFormattingPreservesText(inputText, formattedValue.plainText);

    return Response.json({
      provider: 'openrouter',
      ...formattedValue,
    });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter Telegram formatting failed'),
    }, { status: getOpenRouterErrorStatus(error) });
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

function extractText(result: Awaited<ReturnType<typeof sendOpenRouterChat>>) {
  const content = result.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}
