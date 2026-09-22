import { createHash } from 'node:crypto';
import { persistAuthorizedAudioAsset } from '@/entities/asset/server/audio-asset-service';
import { AssetProvenanceError } from '@/entities/asset/server/asset-service-contracts';
import { AudioProcessingError, MAX_AUDIO_BYTES } from '@/shared/media/audio-contracts';
import { inspectAudioBytes } from '@/shared/media/audio-processor';
import { withStreamingUpload } from '@/shared/media/streaming-upload';
import { runtimeAudioUploadResponseSchema } from '../contracts/runtime-audio-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { authenticateRuntimeClientRequest, requireRuntimeClient } from './runtime-client-auth';
import { runtimeIdempotencyKey, runtimeJson } from './runtime-v2-http';

export async function uploadRuntimeAudio(request: Request) {
  try {
    await authenticateRuntimeClientRequest(request, 'pipeline.asset.write');
    return await withStreamingUpload(request, MAX_AUDIO_BYTES, ['file'], async ({ file }) => {
    const key = request.headers.has('idempotency-key') ? runtimeIdempotencyKey(request) : undefined;
    const bytes = file;
    const inspected = await inspectAudioBytes(bytes, { claimedContentType: file.type, maxBytes: MAX_AUDIO_BYTES, signal: request.signal });
    // Re-check after upload/decoding: a revoked/disabled connection must not gain a new asset.
    const actor = await authenticateRuntimeClientRequest(request, 'pipeline.asset.write');
    const client = await requireRuntimeClient(actor, actor.serviceClientId);
    const asset = await persistAuthorizedAudioAsset({
      bytes, originalName: file.name, maxBytes: MAX_AUDIO_BYTES, signal: request.signal,
      workspaceId: client.workspaceId, userId: client.createdByUserId, documentId: null,
      origin: 'unknown', libraryVisible: false, operation: 'runtime_audio_upload',
      requestedAssetId: key ? runtimeAudioUploadAssetId(client.id, key) : undefined,
      metadata: { runtimeServiceClientId: client.id },
    }, inspected);
    return runtimeJson(runtimeAudioUploadResponseSchema.parse({ artifact: {
      kind: 'audio', assetId: asset.id, mimeType: asset.contentType, sizeBytes: asset.byteSize,
      checksumSha256: asset.checksumSha256, durationSeconds: asset.audio.durationSeconds,
    }, audio: asset.audio }), 201);
    });
  } catch (error) {
    if (error instanceof AudioProcessingError) throw new RuntimeV2Error(error.code, error.message, error.status);
    if (error instanceof AssetProvenanceError) throw new RuntimeV2Error('idempotency_conflict', 'This upload key already belongs to another file.', 409);
    throw error;
  }
}

export function runtimeAudioUploadAssetId(clientId: string, key: string) {
  const hex = createHash('sha256').update(JSON.stringify(['runtime-audio-upload-v1', clientId, key])).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}
