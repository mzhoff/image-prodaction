import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { getDocument } from '@/entities/document/server/document-service';
import { AssetDocumentWorkspaceMismatchError, AssetNotFoundError, AssetStorageError } from '@/entities/asset/server/asset-service';
import { readWorkspaceAudioAsset, uploadAudioAsset } from '@/entities/asset/server/audio-asset-service';
import { transcribeAudio } from '@/modules/generation/server/audio-transcription';
import { createAudioResultId } from '@/modules/executable-pipelines/server/pipeline-audio-artifacts';
import { convertAudioBytes } from '@/shared/media/audio-processor';
import { AudioProcessingError, audioConvertOptionsSchema, MAX_AUDIO_OUTPUT_BYTES } from '@/shared/media/audio-contracts';
import { isUuidV7 } from '@/shared/lib/id';
import { apiError } from '@/shared/api/api-error';
import { shortAiScopeSchema, toShortAiApiErrorResponse } from './short-ai-execution';

const sourceSchema = shortAiScopeSchema.extend({ audioAssetId: z.string().refine(isUuidV7) });
const transcribeSchema = sourceSchema.extend({
  idempotencyKey: z.string().trim().min(1).max(255),
  model: z.string().min(1).max(200).default('google/gemini-3.1-flash-lite'),
  language: z.string().max(80).optional(),
}).strict();
const convertSchema = sourceSchema.extend(audioConvertOptionsSchema.shape).strict();

export async function postTranscribeAudio(request: Request) {
  try {
    const session = await requireApiSession(request);
    const input = transcribeSchema.parse(await readAudioRequest(request));
    await assertAudioScope(session.user.id, input);
    const source = await readWorkspaceAudioAsset({ assetId: input.audioAssetId, workspaceId: input.workspaceId, signal: request.signal });
    const text = await transcribeAudio({
      ...input, actorUserId: session.user.id, bytes: source.bytes, signal: request.signal,
      metadata: { sourceAssetId: source.asset.id },
    });
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return audioErrorResponse(error); }
}

export async function postConvertAudio(request: Request) {
  try {
    const session = await requireApiSession(request);
    const input = convertSchema.parse(await readAudioRequest(request));
    await assertAudioScope(session.user.id, input);
    const source = await readWorkspaceAudioAsset({ assetId: input.audioAssetId, workspaceId: input.workspaceId, signal: request.signal });
    const options = audioConvertOptionsSchema.parse({ format: input.format,
      ...(input.bitrateKbps === undefined ? {} : { bitrateKbps: input.bitrateKbps }),
      ...(input.sampleRateHz === undefined ? {} : { sampleRateHz: input.sampleRateHz }),
      ...(input.channels === undefined ? {} : { channels: input.channels }),
    });
    const converted = await convertAudioBytes({ bytes: source.bytes, options, signal: request.signal });
    const asset = await uploadAudioAsset({
      bytes: converted.bytes, claimedContentType: converted.contentType, signal: request.signal,
      documentId: input.documentId, maxBytes: MAX_AUDIO_OUTPUT_BYTES, libraryVisible: false,
      operation: 'audio_convert', origin: 'unknown', originalName: `converted.${converted.extension}`,
      requestedAssetId: createAudioResultId(`${input.workspaceId}:${session.user.id}:${input.documentId ?? ''}`,
        `${source.asset.id}:${source.asset.checksumSha256}:${JSON.stringify(options)}`),
      metadata: { sourceAssetId: source.asset.id }, userId: session.user.id, workspaceId: input.workspaceId,
    });
    return Response.json({ asset }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return audioErrorResponse(error); }
}

async function assertAudioScope(userId: string, input: { workspaceId: string; documentId?: string }) {
  await requireWorkspaceMembership(userId, input.workspaceId);
  if (input.documentId && (await getDocument(userId, input.documentId)).workspaceId !== input.workspaceId) {
    throw new AssetDocumentWorkspaceMismatchError();
  }
}
async function readAudioRequest(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AudioProcessingError('invalid_content_type', 'JSON is required.', 415);
  // No bytes, URLs or provider credentials are accepted in these commands.
  const reader = request.body?.getReader();
  if (!reader) throw new AudioProcessingError('invalid_request', 'A request body is required.', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const value = await reader.read(); if (value.done) break;
      length += value.value.byteLength;
      if (length > 8192) throw new AudioProcessingError('request_too_large', 'Audio command is too large.', 413);
      chunks.push(value.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
function audioErrorResponse(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return apiError('invalid_audio_request', 'Audio settings are invalid.', 400);
  if (error instanceof AudioProcessingError) return apiError(error.code, error.message, error.status);
  if (error instanceof AssetNotFoundError) return apiError('asset_not_found', 'Audio file not found.', 404);
  if (error instanceof AssetStorageError) return apiError('asset_storage_unavailable', error.message, 503);
  if (error instanceof AssetDocumentWorkspaceMismatchError) return apiError('invalid_document', error.message, 422);
  return toShortAiApiErrorResponse(error);
}
