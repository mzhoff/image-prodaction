import sharp from 'sharp';
import { optimizeReferenceImage } from '@/shared/media/reference-image-optimizer';
import { getAssetContent, getMaxImageUploadBytes, type AssetDto } from '@/entities/asset/server/asset-service';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import type { PipelineArtifactReference } from '../contracts/pipeline-contracts';

export async function readPipelineImageDataUrl(
  actorUserId: string,
  workspaceId: string,
  artifact: PipelineArtifactReference,
  preparation: 'legacy' | 'lossless' = 'legacy',
) {
  const content = await getAssetContent(actorUserId, artifact.assetId);
  if (content.asset.workspaceId !== workspaceId || content.asset.mediaKind !== 'image') {
    throw new Error('Image artifact does not belong to the pipeline workspace.');
  }
  const bytes = await readBoundedAudioStream(content.object.body, getMaxImageUploadBytes());
  if (preparation === 'lossless') return optimizeReferenceImage(toDataUrl(bytes, content.contentType));
  return prepareServerImageDataUrl(bytes, content.contentType);
}

export function toPipelineImageArtifact(asset: AssetDto, runId: string): PipelineArtifactReference {
  return {
    assetId: asset.id,
    checksumSha256: asset.checksumSha256,
    contentUrl: `/v1/runs/${runId}/artifacts/${asset.id}`,
    height: asset.height,
    kind: 'image',
    mimeType: asset.contentType,
    sizeBytes: asset.byteSize,
    width: asset.width,
  };
}

async function prepareServerImageDataUrl(bytes: Uint8Array, contentType: string) {
  const maxBytes = 4_500_000;
  if (bytes.byteLength <= maxBytes
    && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType)) {
    return toDataUrl(bytes, contentType);
  }
  for (const quality of [86, 78, 68, 58]) {
    const converted = await sharp(bytes).rotate().resize({
      fit: 'inside', height: 1536, width: 1536, withoutEnlargement: true,
    }).jpeg({ quality }).toBuffer();
    if (converted.byteLength <= maxBytes) return toDataUrl(converted, 'image/jpeg');
  }
  throw new Error('Image artifact is too large for the AI provider.');
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
}
