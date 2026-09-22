'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Image from 'next/image';
import { useRef, type RefObject } from 'react';
import { dockWindowSize, IMAGE_DOCK_PITCH } from '../lib/image-viewer-dock';
import { getImageViewerThumbnailWindow } from '../lib/image-viewer-thumbnail-window';
import { useImageViewerGesture } from '../model/use-image-viewer-gesture';
import type { ImageViewerMotionController } from '../model/use-image-viewer-motion';
import type { ImageViewerItem } from './image-viewer-types';

export function ImageViewerDock({ assetIds, itemsById, motion, width, trackRef }: {
  assetIds: string[];
  itemsById: Map<string, ImageViewerItem>;
  motion: ImageViewerMotionController;
  width: number;
  trackRef: RefObject<HTMLDivElement | null>;
}) {
  const tUi = useTranslations();
  const stripRef = useRef<HTMLDivElement>(null);
  const gesture = useImageViewerGesture(stripRef, motion, (position) => position * IMAGE_DOCK_PITCH, (offset) => offset / IMAGE_DOCK_PITCH, {
    selectTappedThumbnail: true,
  });
  const entries = getImageViewerThumbnailWindow(assetIds, motion.previewIndex, dockWindowSize(width));
  return (
    <div ref={stripRef} className="image-viewer-dock" role="region"
      aria-label={tUi("Лента изображений — перетащите для выбора")} tabIndex={0} {...gesture}>
      <div ref={trackRef} className="image-viewer-dock-track">
        {entries.map(({ assetId, index }) => {
          const item = itemsById.get(assetId);
          return (
            <div key={assetId} className="image-viewer-dock-tile" data-dock-index={index}
              style={{ left: `calc(50% + ${index * IMAGE_DOCK_PITCH}px)` }}>
              <button type="button" className="image-viewer-dock-button"
                aria-label={tUi("Открыть изображение {p1}: {p2}", { p1: index + 1, p2: item?.name ?? '' })}
                aria-current={index === motion.previewIndex ? 'true' : undefined}
                tabIndex={index === motion.previewIndex ? 0 : -1}
                onClick={() => motion.select(index)}>
                <Image src={item?.thumbnailUrl ?? `/api/assets/${encodeURIComponent(assetId)}/content?variant=thumbnail`}
                  alt={item?.name ?? ''} fill sizes="88px" unoptimized loading="eager" decoding="async" draggable={false} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
