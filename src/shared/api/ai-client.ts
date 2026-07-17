import {
  mapRemoteImageAsset,
  type RemoteImageAssetDto,
} from '@/entities/production-graph/lib/remote-asset';

export class AiRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(status: number, error: unknown) {
    super(formatApiError(error));
    this.name = 'AiRequestError';
    this.status = status;
    this.code = readApiErrorCode(error);
  }
}

export interface AnalyzeImageRequest {
  imageDataUrl: string;
  model: string;
  prompt: string;
}

export interface GenerateImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  inputs: Record<string, string[]>;
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: string[];
    sourceAssetId?: string;
    sourceNodeTypes?: string[];
  }>;
  size: string;
  locationInputs?: string[];
  subjectInputs?: string[];
  workspaceId: string;
}

export interface EditImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
  size: string;
  workspaceId: string;
}

export interface RefineImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  instruction: string;
  mode: string;
  model: string;
  preserveStrength: string;
  size: string;
  workspaceId: string;
}

export interface GenerateTextRequest {
  inputText: string;
  instruction: string;
  model: string;
  outputStyle: string;
  reasoning?: 'low' | 'medium' | 'high';
  temperature?: number;
}

export interface GenerateSpeechRequest {
  inputText: string;
  language: 'auto' | 'ru' | 'en' | 'de' | 'es' | 'zh';
  model: string;
  responseFormat: 'mp3' | 'pcm';
  seed?: number;
  speed?: number;
  temperature?: number;
  topP?: number;
  voice: string;
}

export interface FormatTelegramTextRequest {
  inputText: string;
  model: string;
  rulesText?: string;
}

export interface SubjectDescriptionDraft {
  identitySummary?: string;
  immutableTraits?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  subjectType?: string;
}

export interface LocationDescriptionDraft {
  atmosphere?: string;
  description?: string;
  locationType?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  spatialLayout?: string;
}

export interface DescribeSubjectRequest {
  imageDataUrls: string[];
  model: string;
  subjectType: string;
  textNotes?: string[];
}

export interface DescribeLocationRequest {
  imageDataUrls: string[];
  locationType: string;
  model: string;
  textNotes?: string[];
}

export interface RemoveBackgroundRequest {
  imageDataUrl: string;
}

export async function requestAnalyzeImage(payload: AnalyzeImageRequest) {
  const response = await fetch('/api/ai/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { text?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  return result.text ?? '';
}

export async function requestGenerateImage(payload: GenerateImageRequest) {
  const response = await fetch('/api/ai/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    asset?: RemoteImageAssetDto;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.asset) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return {
    asset: mapRemoteImageAsset(result.asset),
    jobId: result.job?.id,
    message: result.message,
  };
}

export async function requestEditImage(payload: EditImageRequest) {
  const response = await fetch('/api/ai/edit-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    imageDataUrl?: string | null;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { imageDataUrl: result.imageDataUrl, jobId: result.job?.id, message: result.message };
}

export async function requestRefineImage(payload: RefineImageRequest) {
  const response = await fetch('/api/ai/refine-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    imageDataUrl?: string | null;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { imageDataUrl: result.imageDataUrl, jobId: result.job?.id, message: result.message };
}

export async function requestGenerateText(payload: GenerateTextRequest) {
  const response = await fetch('/api/ai/generate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { text?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.text) throw new Error(result.message || 'OpenRouter не вернул текст.');
  return { message: result.message, text: result.text };
}

export async function requestGenerateSpeech(payload: GenerateSpeechRequest) {
  const response = await fetch('/api/ai/generate-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
  const response = await fetch('/api/ai/format-telegram-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    message?: string;
    plainText?: string | null;
    richText?: string | null;
    error?: unknown;
  };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.plainText || !result.richText) throw new Error(result.message || 'OpenRouter не вернул форматирование Telegram-текста.');
  return { message: result.message, plainText: result.plainText, richText: result.richText };
}

export async function requestDescribeSubject(payload: DescribeSubjectRequest) {
  const response = await fetch('/api/ai/describe-subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { draft?: SubjectDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание субъекта.');
  return { draft: result.draft, message: result.message };
}

export async function requestDescribeLocation(payload: DescribeLocationRequest) {
  const response = await fetch('/api/ai/describe-location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { draft?: LocationDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание локации.');
  return { draft: result.draft, message: result.message };
}

export async function requestRemoveBackground(payload: RemoveBackgroundRequest) {
  const response = await fetch('/api/ai/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'FAL не вернул изображение с прозрачностью.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
}

export function formatApiError(error: unknown) {
  if (typeof error === 'string') return error;
  if (!error) return 'OpenRouter request failed';
  return JSON.stringify(error).slice(0, 500);
}

function readApiErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
