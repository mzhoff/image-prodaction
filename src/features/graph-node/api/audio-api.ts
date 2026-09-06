import { z } from 'zod';
import type { AudioConvertOptions } from '@/shared/media/audio-contracts';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { mapRemoteAudioAsset, remoteAudioAssetSchema } from '@/entities/production-graph/lib/remote-audio-asset';
import { formatApiError } from './ai-request-error';

async function postAudio(path: string, payload: object, signal?: AbortSignal) {
  const scope = getActiveAssetScope();
  if (!scope) throw new Error('Open a saved project before processing audio.');
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...scope }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(result?.error ?? 'Audio request failed.'));
  return result;
}

export async function requestTranscribeAudio(payload: { audioAssetId: string; model: string; language?: string; idempotencyKey: string }, signal?: AbortSignal) {
  const result = await postAudio('/api/ai/transcribe-audio', payload, signal);
  return z.object({ text: z.string() }).parse(result);
}

export async function requestConvertAudio(payload: AudioConvertOptions & { audioAssetId: string }, signal?: AbortSignal) {
  const result = await postAudio('/api/ai/convert-audio', payload, signal);
  return mapRemoteAudioAsset(remoteAudioAssetSchema.parse(result?.asset));
}
