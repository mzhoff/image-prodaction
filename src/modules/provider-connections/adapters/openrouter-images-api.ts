import type { ProviderExecuteRequest, ProviderResult } from '../contracts/provider-contracts';
import { ProviderAdapterError, ProviderHttpError } from '../core/provider-errors';
import { ImageModelValidationError, type createOpenRouterImageCatalog } from './openrouter-image-catalog';
import { toOpenRouterMessagePart } from './openrouter-message-mapping';
import { normalizeOpenRouterProviderUsage } from './openrouter-response-normalizers';
import { asRecord, readString, removeUndefined } from './openrouter-value-readers';

export async function createImagesApiPayload(
  request: ProviderExecuteRequest,
  catalog: ReturnType<typeof createOpenRouterImageCatalog>,
) {
  const settings = request.parameters?.image;
  if (!settings?.aspectRatio || !settings.size || request.operation !== 'generate_image'
    || request.expectedOutputModalities.some((modality) => modality !== 'image')
    || request.messages.some((message) => message.role !== 'user' || message.parts.some((part) => part.modality === 'audio'))) {
    throw requestError('Некорректный запрос генерации изображения.');
  }
  const parts = request.messages.flatMap((message) => message.parts);
  const references = parts.filter((part) => part.modality === 'image').map(toOpenRouterMessagePart);
  let selected: Awaited<ReturnType<typeof catalog.resolve>>;
  try {
    selected = await catalog.resolve(request.modelId, { ...settings, aspectRatio: settings.aspectRatio, size: settings.size }, references.length);
  } catch (error) {
    if (error instanceof ImageModelValidationError) throw requestError(error.message);
    throw new ProviderAdapterError({
      classification: 'retryable', code: 'upstream_unavailable', httpStatus: null,
      message: 'Каталог изображений OpenRouter временно недоступен. Платный запрос не отправлен.',
      providerOperationId: null, retryAfterMs: null,
    }, error);
  }
  if (!selected) throw requestError('Эта модель использует другой способ генерации.');
  const supported = selected.capabilities.parameters;
  return removeUndefined({
    model: request.modelId,
    prompt: parts.filter((part) => part.modality === 'text').map((part) => part.text).join('\n\n'),
    n: 1, stream: false,
    input_references: references.length ? references : undefined,
    aspect_ratio: supported.aspect_ratio ? settings.aspectRatio : undefined,
    resolution: supported.resolution ? settings.size : undefined,
    quality: settings.imageQuality,
    background: settings.imageBackground,
    output_format: settings.imageFormat,
    output_compression: settings.imageCompression,
    seed: settings.imageSeed,
    provider: selected.providerTag ? { only: [selected.providerTag], allow_fallbacks: false } : undefined,
  });
}

export function normalizeImagesApiResult(raw: unknown, request: ProviderExecuteRequest): ProviderResult {
  const payload = asRecord(raw);
  const providerOperationId = readString(payload, 'id');
  const usage = normalizeOpenRouterProviderUsage(payload?.usage);
  const images = Array.isArray(payload?.data) ? payload.data : [];
  const outputs = images.map((entry) => {
    const data = readString(entry, 'b64_json');
    const mediaType = data ? detectRasterType(data) : null;
    if (!data || !mediaType) {
      throw new ProviderAdapterError({
        classification: 'ambiguous', code: 'invalid_response', httpStatus: null,
        message: 'OpenRouter вернул неподдерживаемый результат. Повторный платный запрос автоматически не запускается.',
        providerOperationId, retryAfterMs: null,
      }, new ProviderHttpError({ status: 502, providerOperationId, usage }));
    }
    return { modality: 'image' as const, data, mediaType };
  });
  if (outputs.length !== 1) {
    throw new ProviderAdapterError({
      classification: 'ambiguous', code: 'missing_modality', httpStatus: null,
      message: 'OpenRouter не вернул одну готовую картинку. Автоматический повтор заблокирован.',
      providerOperationId, retryAfterMs: null,
    }, new ProviderHttpError({ status: 502, providerOperationId, usage }));
  }
  return { provider: 'openrouter', modelId: request.modelId, providerOperationId, usage, outputs, metadata: { imageApi: true } };
}

function detectRasterType(data: string) {
  const bytes = Buffer.from(data.slice(0, 32), 'base64');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function requestError(message: string) {
  return new ProviderAdapterError({
    classification: 'permanent', code: 'invalid_request', httpStatus: null,
    message, providerOperationId: null, retryAfterMs: null,
  });
}
