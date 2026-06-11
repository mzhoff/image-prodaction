import { z } from 'zod';
import { formatOpenRouterError, getOpenRouterErrorStatus, sendOpenRouterSpeech } from '@/shared/api/openrouter';
import { DEFAULT_SPEECH_MODEL } from '@/shared/api/openrouter-models';
import { getOpenRouterSpeechCapabilities, getOpenRouterSpeechResponseFormat, getSafeSpeechResponseFormat, getSafeSpeechVoice } from '@/shared/api/openrouter-speech-capabilities';

export const runtime = 'nodejs';

const speechSchema = z.object({
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
  const parsed = speechSchema.safeParse(await request.json());
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

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: 'OPENROUTER_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const capabilities = getOpenRouterSpeechCapabilities(parsed.data.model);
    const responseFormat = getSafeSpeechResponseFormat(parsed.data.model, parsed.data.responseFormat);
    const openRouterResponseFormat = getOpenRouterSpeechResponseFormat(parsed.data.model, responseFormat);
    const response = await sendOpenRouterSpeech({
      input,
      model: parsed.data.model,
      responseFormat: openRouterResponseFormat,
      seed: capabilities.supportsSeed ? parsed.data.seed : undefined,
      speed: capabilities.supportsSpeed ? parsed.data.speed : undefined,
      temperature: capabilities.supportsTemperature ? parsed.data.temperature : undefined,
      topP: capabilities.supportsTopP ? parsed.data.topP : undefined,
      voice: getSafeSpeechVoice(parsed.data.model, parsed.data.voice, parsed.data.language),
    });
    const rawAudio = await response.arrayBuffer();
    const upstreamContentType = response.headers.get('content-type') ?? '';
    const isPcmResponse = openRouterResponseFormat === 'pcm' || upstreamContentType.toLowerCase().includes('audio/pcm');
    const audioBody = isPcmResponse ? wrapPcm16MonoAsWav(rawAudio, getPcmSampleRate(parsed.data.model, upstreamContentType)) : rawAudio;
    const contentType = isPcmResponse
      ? 'audio/wav'
      : upstreamContentType || 'audio/mpeg';
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    const generationId = response.headers.get('x-generation-id');
    if (generationId) headers.set('X-Generation-Id', generationId);

    return new Response(audioBody, { headers });
  } catch (error) {
    return Response.json({
      error: formatOpenRouterError(error, 'OpenRouter speech generation failed'),
    }, { status: getOpenRouterErrorStatus(error) });
  }
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
