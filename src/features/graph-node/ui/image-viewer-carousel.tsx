'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight } from '@prodactionpro/ui-core/icons';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IMAGE_DOCK_PITCH } from '../lib/image-viewer-dock';
import { createGalleryLayout, galleryCardRange, galleryOffset, galleryPosition, projectGalleryCards } from '../lib/image-viewer-motion';
import { useImageViewerMotion } from '../model/use-image-viewer-motion';
import { useImageViewerGesture } from '../model/use-image-viewer-gesture';
import { hasOpenFloatingContextMenu } from '@/shared/ui/floating-context-menu';
import { ImageViewerDock } from './image-viewer-dock';
import type { ImageViewerItem } from './image-viewer-types';

export function ImageViewerCarousel({ assetIds, currentIndex, itemsById, url, onSelect, onMovingChange }: {
  assetIds: string[];
  currentIndex: number;
  itemsById: Map<string, ImageViewerItem>;
  url: string;
  onSelect: (index: number) => void;
  onMovingChange: (moving: boolean) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dockTrackRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const layout = useMemo(() => createGalleryLayout(assetIds.map((id) => {
    const item = itemsById.get(id);
    return (item?.width ?? 1200) / (item?.height ?? 800);
  }), size.width, size.height), [assetIds, itemsById, size]);
  const centers = useMemo(() => layout.map((card) => card.center), [layout]);
  const motion = useImageViewerMotion({ count: assetIds.length, currentIndex, onSelect, onMovingChange,
    onPaint: (position) => {
      if (dockTrackRef.current) dockTrackRef.current.style.transform = `translate3d(${-position * IMAGE_DOCK_PITCH}px,0,0)`;
      if (trackRef.current) {
        const projected = new Map(projectGalleryCards(layout, position, size.width).map((card) => [card.index, card]));
        for (const card of trackRef.current.querySelectorAll<HTMLElement>('[data-carousel-index]')) {
          const placement = projected.get(Number(card.dataset.carouselIndex));
          // React may still be committing a new window after a fast jump.
          // Never leave an out-of-window card at its last (or default) center.
          card.style.visibility = placement ? 'visible' : 'hidden';
          if (!placement) continue;
          card.style.transform = `translate(-50%,-50%) translateX(${placement.center}px) scale(${placement.scale})`;
          card.style.setProperty('--carousel-dim', String(placement.dim));
        }
      }
    },
  });
  const gesture = useImageViewerGesture(viewportRef, motion,
    (position) => galleryOffset(centers, position), (offset) => galleryPosition(centers, offset));
  // Small, bounded image window. Only the settled item loads an original.
  const range = galleryCardRange(assetIds.length, motion.previewIndex);
  const entries = assetIds.slice(range.start, range.end + 1).map((assetId, offset) => ({ assetId, index: range.start + offset }));
  const navigate = (delta: number) => motion.select((motion.previewIndex + delta + assetIds.length) % assetIds.length);
  const { paint, previewIndex, select } = motion;

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize((previous) => {
        const next = { width: element.clientWidth, height: Math.max(0, element.clientHeight - 20) };
        return previous.width === next.width && previous.height === next.height ? previous : next;
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { paint(); }, [centers, previewIndex, paint]);
  useLayoutEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || hasOpenFloatingContextMenu() || document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement | null)?.closest('textarea,input,select,[contenteditable="true"]')) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') select(0);
      else if (event.key === 'End') select(assetIds.length - 1);
      else select((previewIndex + (event.key === 'ArrowLeft' ? -1 : 1) + assetIds.length) % assetIds.length);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [assetIds.length, previewIndex, select]);

  return <>
    <ImageViewerDock assetIds={assetIds} itemsById={itemsById} motion={motion} width={size.width} trackRef={dockTrackRef} />
    <div ref={viewportRef} className="image-viewer-viewport image-viewer-carousel" role="region"
      aria-roledescription="карусель" aria-label="Просмотр изображений — перетащите для выбора"
      tabIndex={0} {...gesture}>
      <div ref={trackRef} className="image-viewer-carousel-track">
        {entries.map(({ assetId, index }) => {
          const item = itemsById.get(assetId);
          const card = layout[index];
          if (!card) return null;
          const original = index === currentIndex;
          return <div key={assetId} className="image-viewer-carousel-card"
            data-carousel-index={index} aria-current={index === motion.previewIndex ? 'true' : undefined}
            style={{ width: card.width, height: card.height }}>
            <Image src={original ? url : (item?.thumbnailUrl ?? `/api/assets/${encodeURIComponent(assetId)}/content?variant=thumbnail`)}
              alt={item?.name ?? 'Image preview'} fill sizes="(max-width: 600px) 72vw, 62vw" unoptimized loading="eager"
              decoding="async" draggable={false} className={original ? 'image-viewer-media' : 'image-viewer-neighbor-media'} />
            <span className="image-viewer-carousel-dim" aria-hidden="true" />
          </div>;
        })}
      </div>
      {assetIds.length > 1 ? <>
        <button type="button" className="image-viewer-nav image-viewer-nav-prev" aria-label="Previous generated image"
          onClick={() => navigate(-1)}><ChevronLeft size={38} strokeWidth={1.7} /></button>
        <button type="button" className="image-viewer-nav image-viewer-nav-next" aria-label="Next generated image"
          onClick={() => navigate(1)}><ChevronRight size={38} strokeWidth={1.7} /></button>
      </> : null}
    </div>
    <div className="image-viewer-version-badge" aria-live="off">{motion.previewIndex + 1}/{assetIds.length}</div>
    <span className="image-viewer-carousel-status" aria-live="polite" aria-atomic="true">Изображение {currentIndex + 1} из {assetIds.length}</span>
  </>;
}
