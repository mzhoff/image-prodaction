export interface AnalyzeImageRequest {
  imageDataUrl: string;
  model: string;
  prompt: string;
}

export interface GenerateImageRequest {
  aspectRatio: string;
  inputs: Record<string, string[]>;
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: string[];
    sourceAssetId?: string;
  }>;
  size: string;
}

export interface EditImageRequest {
  aspectRatio: string;
  imageDataUrl: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
  size: string;
}

export interface RefineImageRequest {
  aspectRatio: string;
  imageDataUrl: string;
  instruction: string;
  mode: string;
  model: string;
  preserveStrength: string;
  size: string;
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
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
}

export async function requestEditImage(payload: EditImageRequest) {
  const response = await fetch('/api/ai/edit-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
}

export async function requestRefineImage(payload: RefineImageRequest) {
  const response = await fetch('/api/ai/refine-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
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
