import { createHash } from 'node:crypto';
import { getAssetMetadata, type AssetDto } from '@/entities/asset/server/asset-service';
import { readWorkspaceAudioAsset } from '@/entities/asset/server/audio-asset-service';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import type { PipelineArtifactReference } from '../contracts/pipeline-contracts';

export async function readAudioArtifact(workspaceId: string, artifact: PipelineArtifactReference, signal: AbortSignal) {
  if (artifact.kind !== 'audio') {
    throw new AudioProcessingError('invalid_audio_asset', 'Audio does not belong to the selected workspace.');
  }
  const content = await readWorkspaceAudioAsset({ assetId: artifact.assetId, workspaceId, signal });
  if (artifact.checksumSha256 && artifact.checksumSha256 !== content.asset.checksumSha256) {
    throw new AudioProcessingError('audio_checksum_mismatch', 'Audio checksum does not match the stored file.');
  }
  return content;
}

export function toAudioArtifact(asset: AssetDto, runId?: string): PipelineArtifactReference {
  return {
    kind: 'audio', assetId: asset.id, mimeType: asset.contentType, sizeBytes: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    ...(asset.audio ? { durationSeconds: asset.audio.durationSeconds, sampleRateHz: asset.audio.sampleRateHz,
      channels: asset.audio.channels, codec: asset.audio.codec } : {}),
    ...(runId ? { contentUrl: `/v1/runs/${runId}/artifacts/${asset.id}` } : {}),
  };
}

export async function resolveStoredArtifact(userId: string, workspaceId: string, assetId: string, kind: 'image' | 'audio') {
  const asset = await getAssetMetadata(userId, assetId);
  if (asset.workspaceId !== workspaceId || asset.status !== 'ready' || asset.mediaKind !== kind) {
    throw new AudioProcessingError('invalid_import_asset', 'Import must reference a ready file of the correct type in this workspace.');
  }
  return kind === 'audio' ? toAudioArtifact(asset) : {
    kind: 'image' as const, assetId: asset.id, mimeType: asset.contentType, sizeBytes: asset.byteSize,
    checksumSha256: asset.checksumSha256, width: asset.width, height: asset.height,
  };
}

export function createAudioResultId(scope: string, key: string) {
  const bytes = createHash('sha256').update('audio-result@1\0').update(scope).update('\0').update(key).digest().subarray(0, 16);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f); bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
