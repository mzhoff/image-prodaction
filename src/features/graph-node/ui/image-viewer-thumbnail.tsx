'use client';

import Image from 'next/image';
import { memo } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { cn } from '@/shared/lib/cn';
import type { ImageViewerItem } from './image-viewer-types';

export const ImageViewerThumbnail = memo(function ImageViewerThumbnail({
  active,
  assetId,
  index,
  item,
  onSelect,
}: {
  active: boolean;
  assetId: string;
  index: number;
  item?: ImageViewerItem;
  onSelect: (index: number) => void;
}) {
  const graphUrl = useAssetUrl(item ? undefined : assetId);
  const url = item?.thumbnailUrl ?? item?.url ?? graphUrl;
  if (!url) return null;
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      aria-label={`Open generated image variation ${index + 1}`}
      className={cn('image-viewer-thumbnail', active && 'image-viewer-thumbnail-active')}
      onClick={() => onSelect(index)}
    >
      <Image
        src={url}
        alt={item?.name ?? `Generated variation ${index + 1}`}
        fill
        sizes="80px"
        unoptimized
        loading="lazy"
        decoding="async"
        draggable={false}
        className="image-viewer-thumbnail-media"
      />
    </button>
  );
});
