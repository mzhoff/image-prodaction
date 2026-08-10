import type {
  ProviderAudioOutput,
  ProviderImageOutput,
  ProviderMessagePart,
  ProviderOutput,
} from '../contracts/provider-contracts';
import { ProviderAdapterError } from '../core/provider-errors';
import { asRecord } from './openrouter-value-readers';

export function toOpenRouterMessagePart(part: ProviderMessagePart) {
  if (part.modality === 'text') return { type: 'text', text: part.text };
  if (part.modality === 'image') return { type: 'image_url', image_url: { url: resolveMediaUrl(part) } };
  if (part.url) return { type: 'audio_url', audio_url: { url: part.url } };
  if (!part.data) throw permanentRequestError('Audio input requires data or url.');
  return {
    type: 'input_audio',
    input_audio: {
      data: stripDataUrlPrefix(part.data),
      format: part.format ?? mediaTypeToAudioFormat(part.mediaType),
    },
  };
}

export function normalizeOpenRouterOutputs(message: Record<string, unknown>): ProviderOutput[] {
  const outputs: ProviderOutput[] = [];
  if (typeof message.content === 'string' && message.content.length > 0) {
    outputs.push({ modality: 'text', text: message.content });
  } else if (Array.isArray(message.content)) {
    for (const rawPart of message.content) appendMessagePart(outputs, rawPart);
  }
  if (Array.isArray(message.images)) {
    for (const rawImage of message.images) {
      const url = readNestedUrl(asRecord(rawImage), 'image_url');
      if (url) outputs.push(toImageOutput(url));
    }
  }
  const audioOutput = normalizeAudioOutput(asRecord(message.audio));
  if (audioOutput) outputs.push(audioOutput);
  return outputs;
}

function appendMessagePart(outputs: ProviderOutput[], rawPart: unknown) {
  const part = asRecord(rawPart);
  if (!part) return;
  if ((part.type === 'text' || part.type === 'output_text') && typeof part.text === 'string') {
    outputs.push({ modality: 'text', text: part.text });
    return;
  }
  if (part.type === 'image_url') {
    const url = readNestedUrl(part, 'image_url');
    if (url) outputs.push(toImageOutput(url));
    return;
  }
  if (part.type === 'audio_url') {
    const url = readNestedUrl(part, 'audio_url');
    if (url) outputs.push({ modality: 'audio', url });
    return;
  }
  if (part.type === 'output_audio' || part.type === 'audio') {
    const output = normalizeAudioOutput(asRecord(part.audio ?? part));
    if (output) outputs.push(output);
  }
}

function resolveMediaUrl(part: { data?: string; mediaType?: string; url?: string }) {
  if (part.url) return part.url;
  if (!part.data) throw permanentRequestError('Image input requires data or url.');
  if (part.data.startsWith('data:')) return part.data;
  if (!part.mediaType?.startsWith('image/')) {
    throw permanentRequestError('Base64 image input requires an image media type.');
  }
  return `data:${part.mediaType};base64,${part.data}`;
}

function normalizeAudioOutput(audio: Record<string, unknown> | null): ProviderAudioOutput | null {
  if (!audio) return null;
  const data = typeof audio.data === 'string' ? audio.data : undefined;
  const url = typeof audio.url === 'string' ? audio.url : undefined;
  if (!data && !url) return null;
  const format = typeof audio.format === 'string' ? audio.format : undefined;
  return {
    data,
    format,
    mediaType: format ? audioFormatToMediaType(format) : undefined,
    modality: 'audio',
    url,
  };
}

function toImageOutput(url: string): ProviderImageOutput {
  const dataUrl = url.match(/^data:([^;,]+);base64,(.+)$/);
  return dataUrl
    ? { data: dataUrl[2], mediaType: dataUrl[1], modality: 'image' }
    : { modality: 'image', url };
}

function readNestedUrl(value: Record<string, unknown> | null, key: string) {
  const nested = asRecord(value?.[key]);
  return typeof nested?.url === 'string' ? nested.url : null;
}

function permanentRequestError(message: string) {
  return new ProviderAdapterError({
    classification: 'permanent', code: 'invalid_request', httpStatus: null,
    message, providerOperationId: null, retryAfterMs: null,
  });
}

function stripDataUrlPrefix(value: string) {
  return value.match(/^data:[^;,]+;base64,(.+)$/)?.[1] ?? value;
}

function mediaTypeToAudioFormat(mediaType: string | undefined) {
  if (!mediaType) return 'wav';
  if (mediaType.includes('mpeg')) return 'mp3';
  if (mediaType.includes('ogg')) return 'ogg';
  if (mediaType.includes('webm')) return 'webm';
  return 'wav';
}

function audioFormatToMediaType(format: string) {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'ogg') return 'audio/ogg';
  if (format === 'webm') return 'audio/webm';
  if (format === 'pcm') return 'audio/L16';
  return 'audio/wav';
}
