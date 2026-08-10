import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';
import type {
  AnalyzeImageRequest,
  EditImageRequest,
  RefineImageRequest,
  RemoveBackgroundRequest,
} from './ai-client-contracts';
import { AiRequestError, formatApiError } from './ai-request-error';
import { fetchShortAi, withActiveAiScope } from './short-ai-client';

export async function requestAnalyzeImage(payload: AnalyzeImageRequest) {
  const response = await fetchShortAi('/api/ai/analyze-image', withActiveAiScope(payload));
  const result = await response.json() as { text?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  return result.text ?? '';
}

export async function requestEditImage(payload: EditImageRequest) {
  return requestImageOperation('/api/ai/edit-image', payload);
}

export async function requestRefineImage(payload: RefineImageRequest) {
  return requestImageOperation('/api/ai/refine-image', payload);
}

export async function requestRemoveBackground(payload: RemoveBackgroundRequest) {
  const response = await postJson('/api/ai/remove-background', payload);
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'FAL не вернул изображение с прозрачностью.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
}

async function requestImageOperation(
  path: string,
  payload: EditImageRequest | RefineImageRequest,
) {
  const response = await postJson(path, payload);
  const result = await response.json() as {
    imageDataUrl?: string | null;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  notifyProviderUsageUpdated(payload.workspaceId);
  return { imageDataUrl: result.imageDataUrl, jobId: result.job?.id, message: result.message };
}

function postJson(path: string, payload: object) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
