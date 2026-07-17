import { z } from 'zod';
import { sendOpenRouterSpeech } from '@/shared/api/openrouter';
import { DEFAULT_SPEECH_MODEL } from '@/shared/api/openrouter-models';
import { getOpenRouterSpeechCapabilities, getOpenRouterSpeechResponseFormat, getSafeSpeechResponseFormat, getSafeSpeechVoice } from '@/shared/api/openrouter-speech-capabilities';
import {
  executeShortOpenRouterCall,
  shortAiScopeSchema,
  toShortAiApiErrorResponse,
} from './short-ai-execution';
import { EMPTY_PROVIDER_USAGE } from '@/modules/provider-connections';

export const runtime = 'nodejs';

const speechSchema = z.object({
  ...shortAiScopeSchema.shape,
  inputText: z.string().default(''),
  language: z.enum(['auto', 'ru', 'en', 'de', 'es', 'zh']).default('auto'),
  model: z.string().min(1).default(DEFAULT_SPEECH_MODEL),
  responseFormat: z.enum(['mp3', 'pcm']).default('mp3'),
  seed: z.number().int().optional(),
  speed: z.number().min(0.25).max(4).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  voice: z.string().min(1).default('Eve'),
});

export async function POST(request: Request) {
  const parsed = speechSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data.inputText.trim();
  if (!input) {
    return Response.json({ error: 'Connect or provide text before generating voice.' }, { status: 400 });
  }
  if (parsed.data.model === 'microsoft/mai-voice-2' && input.length < 10) {
    return Response.json({ error: 'MAI-Voice-2 rejects very short text. Add a full sentence before generating voice.' }, { status: 400 });
  }

  try {
    const capabilities = getOpenRouterSpeechCapabilities(parsed.data.model);
    const responseFormat = getSafeSpeechResponseFormat(parsed.data.model, parsed.data.responseFormat);
    const openRouterResponseFormat = getOpenRouterSpeechResponseFormat(parsed.data.model, responseFormat);
    const execution = await executeShortOpenRouterCall({
      checkpoint: {
        deserialize(value) {
          const saved = parseSpeechCheckpoint(value);
          return {
            audioBody: new Uint8Array(Buffer.from(saved.audioBase64, 'base64')),
            contentType: saved.contentType,
            generationId: saved.generationId,
          };
        },
        serialize(result) {
          return {
            audioBase64: Buffer.from(result.audioBody).toString('base64'),
            contentType: result.contentType,
            generationId: result.generationId,
          };
        },
      },
      request,
      scope: parsed.data,
      modelId: parsed.data.model,
      operation: 'generate_speech',
      invoke: async ({ adapter, apiKey }) => {
        const response = await sendOpenRouterSpeech({
          apiKey,
          input,
          model: parsed.data.model,
          responseFormat: openRouterResponseFormat,
          seed: capabilities.supportsSeed ? parsed.data.seed : undefined,
          speed: capabilities.supportsSpeed ? parsed.data.speed : undefined,
          temperature: capabilities.supportsTemperature ? parsed.data.temperature : undefined,
          topP: capabilities.supportsTopP ? parsed.data.topP : undefined,
          voice: getSafeSpeechVoice(parsed.data.model, parsed.data.voice, parsed.data.language),
        });
        const providerOperationId = response.headers.get('x-generation-id');
        let usage = { ...EMPTY_PROVIDER_USAGE };
        if (providerOperationId) {
          try {
            const status = await adapter.getOperationStatus(providerOperationId, {
              credential: apiKey,
              signal: request.signal,
            });
            usage = status.usage;
          } catch {
            // Audio is already generated. Preserve the successful result and an
            // incomplete ledger entry; a later reconciliation can fill usage.
            console.error('OpenRouter speech usage could not be reconciled immediately.');
          }
        }
        return {
          providerOperationId,
          result: response,
          usage,
        };
      },
      transform: async (response) => {
        const rawAudio = new Uint8Array(await response.arrayBuffer());
        const upstreamContentType = response.headers.get('content-type') ?? '';
        const isPcmResponse = openRouterResponseFormat === 'pcm'
          || upstreamContentType.toLowerCase().includes('audio/pcm');
        const audioBody = isPcmResponse
          ? wrapPcm16MonoAsWav(
            rawAudio.buffer,
            getPcmSampleRate(parsed.data.model, upstreamContentType),
          )
          : rawAudio;
        return {
          audioBody,
          contentType: isPcmResponse
            ? 'audio/wav'
            : upstreamContentType || 'audio/mpeg',
          generationId: response.headers.get('x-generation-id'),
        };
      },
    });
    const headers = new Headers();
    headers.set('Content-Type', execution.result.contentType);
    headers.set('X-Generation-Job-Id', execution.job.id);
    if (execution.result.generationId) {
      headers.set('X-Generation-Id', execution.result.generationId);
    }

    return new Response(execution.result.audioBody, { headers });
  } catch (error) {
    return toShortAiApiErrorResponse(error);
  }
}

function parseSpeechCheckpoint(value: unknown) {
  if (
    !value
    || typeof value !== 'object'
    || !('audioBase64' in value)
    || typeof value.audioBase64 !== 'string'
    || !('contentType' in value)
    || typeof value.contentType !== 'string'
  ) {
    throw new Error('Saved speech result is invalid.');
  }
  return {
    audioBase64: value.audioBase64,
    contentType: value.contentType,
    generationId: 'generationId' in value && typeof value.generationId === 'string'
      ? value.generationId
      : null,
  };
}

function getPcmSampleRate(model: string, contentType = '') {
  const rate = contentType.match(/rate=(\d+)/i)?.[1];
  if (rate) return Number(rate);
  if (model === 'google/gemini-3.1-flash-tts-preview') return 24_000;
  if (model === 'microsoft/mai-voice-2') return 24_000;
  return 24_000;
}

function wrapPcm16MonoAsWav(pcmBuffer: ArrayBuffer, sampleRate: number) {
  const bytesPerSample = 2;
  const channelCount = 1;
  const pcm = new Uint8Array(pcmBuffer);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  const wav = new Uint8Array(header.byteLength + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, header.byteLength);
  return wav;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
