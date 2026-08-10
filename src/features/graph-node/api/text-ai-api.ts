import type {
  DescribeLocationRequest,
  DescribeSubjectRequest,
  FormatTelegramTextRequest,
  GenerateSpeechRequest,
  GenerateTextRequest,
  LocationDescriptionDraft,
  SubjectDescriptionDraft,
} from './ai-client-contracts';
import { formatApiError } from './ai-request-error';
import { fetchShortAi, withActiveAiScope } from './short-ai-client';

export async function requestGenerateText(payload: GenerateTextRequest) {
  const response = await fetchShortAi('/api/ai/generate-text', withActiveAiScope(payload));
  const result = await response.json() as { text?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.text) throw new Error(result.message || 'OpenRouter не вернул текст.');
  return { message: result.message, text: result.text };
}

export async function requestGenerateSpeech(payload: GenerateSpeechRequest) {
  const response = await fetchShortAi('/api/ai/generate-speech', withActiveAiScope(payload));
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: unknown; message?: string };
    throw new Error(formatApiError(result.error ?? result.message ?? 'OpenRouter не вернул аудио.'));
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('OpenRouter вернул пустой аудиофайл.');
  return {
    blob,
    generationId: response.headers.get('x-generation-id') ?? undefined,
    mimeType: (response.headers.get('content-type') ?? blob.type) || 'audio/mpeg',
  };
}

export async function requestFormatTelegramText(payload: FormatTelegramTextRequest) {
  const response = await fetchShortAi('/api/ai/format-telegram-text', withActiveAiScope(payload));
  const result = await response.json() as {
    message?: string;
    plainText?: string | null;
    richText?: string | null;
    error?: unknown;
  };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.plainText || !result.richText) {
    throw new Error(result.message || 'OpenRouter не вернул форматирование Telegram-текста.');
  }
  return { message: result.message, plainText: result.plainText, richText: result.richText };
}

export async function requestDescribeSubject(payload: DescribeSubjectRequest) {
  const response = await fetchShortAi('/api/ai/describe-subject', withActiveAiScope(payload));
  const result = await response.json() as { draft?: SubjectDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание субъекта.');
  return { draft: result.draft, message: result.message };
}

export async function requestDescribeLocation(payload: DescribeLocationRequest) {
  const response = await fetchShortAi('/api/ai/describe-location', withActiveAiScope(payload));
  const result = await response.json() as { draft?: LocationDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание локации.');
  return { draft: result.draft, message: result.message };
}
