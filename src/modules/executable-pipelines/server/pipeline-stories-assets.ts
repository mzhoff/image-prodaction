import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { videoMetadataSchema } from '@/shared/media/video-contracts';
import type { StoryImageAssetV3, StoryVideoAssetV3 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';

export type StoryStoredAsset = Pick<typeof asset.$inferSelect,
  'id' | 'workspaceId' | 'status' | 'mediaKind' | 'checksumSha256' | 'contentType' | 'byteSize' | 'width' | 'height' | 'metadata'>;
export type StoryAssetReader = (workspaceId: string, ids: string[]) => Promise<StoryStoredAsset[]>;
export const readStoryAssets: StoryAssetReader = async (workspaceId, ids) => {
  if (!ids.length) return [];
  return getDb().select({ id: asset.id, workspaceId: asset.workspaceId, status: asset.status,
    mediaKind: asset.mediaKind, checksumSha256: asset.checksumSha256, contentType: asset.contentType,
    byteSize: asset.byteSize, width: asset.width, height: asset.height, metadata: asset.metadata })
    .from(asset).where(and(eq(asset.workspaceId, workspaceId), inArray(asset.id, ids)));
};

export function storyImageAsset(record: StoryStoredAsset, altText: string): StoryImageAssetV3 {
  if (record.mediaKind !== 'image' || !['image/jpeg', 'image/png', 'image/webp'].includes(record.contentType)) {
    throw new Error('Для фона и постера выберите изображение JPEG, PNG или WebP.');
  }
  return { ...base(record, altText), kind: 'image', mimeType: record.contentType as StoryImageAssetV3['mimeType'] };
}

export function storyVideoAsset(record: StoryStoredAsset, poster: StoryImageAssetV3, altText: string): StoryVideoAssetV3 {
  const video = videoMetadataSchema.safeParse(record.metadata?.video);
  if (record.mediaKind !== 'video' || record.contentType !== 'video/mp4' || !video.success
    || video.data.codec !== 'h264' || !video.data.browserPlayable) {
    throw new Error('Выберите видео MP4 H.264, пригодное для просмотра в приложении.');
  }
  return { ...base(record, altText), kind: 'video', mimeType: 'video/mp4',
    durationMs: Math.round(video.data.durationSeconds * 1000), poster };
}

function base(record: StoryStoredAsset, altText: string) {
  if (record.status !== 'ready' || !record.width || !record.height || !/^[a-f0-9]{64}$/.test(record.checksumSha256)) {
    throw new Error('Файл ещё не готов. Дождитесь окончания обработки.');
  }
  return { assetId: record.id, source: { kind: 'productionArtifact' as const,
    artifactId: record.id, producerKey: 'image-production', checksum: `sha256:${record.checksumSha256}` },
    width: record.width, height: record.height, byteSize: record.byteSize, altText };
}
