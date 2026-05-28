'use client';

import Image from 'next/image';
import { Download, ImageUp, Maximize2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';
import { useAssetUrl } from '@/shared/ui/use-asset-url';

interface ImagePlateProps {
  assetId?: string;
  compact?: boolean;
  loading?: boolean;
  adaptive?: boolean;
}

export function ImagePlate({ assetId, compact, loading }: ImagePlateProps) {
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === assetId));
  const url = useAssetUrl(assetId);
  const [viewerOpen, setViewerOpen] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const aspectRatio = asset?.width && asset.height ? `${asset.width} / ${asset.height}` : undefined;

  const handleDownload = () => {
    if (!url || !asset) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = asset.name || 'reverie-image.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      <div
        className={cn(
          'image-plate',
          compact && 'image-plate-compact',
          aspectRatio && 'image-plate-sized',
          loading && 'image-plate-loading',
          url && 'image-plate-interactive',
        )}
        style={aspectRatio ? { aspectRatio } : undefined}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
        }}
        onClick={(event) => {
          const pointerStart = pointerStartRef.current;
          if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) return;
          if (url) setViewerOpen(true);
        }}
      >
        {url ? (
          <Image src={url} alt="Reference preview" fill sizes="360px" unoptimized draggable={false} className="image-plate-media" />
        ) : (
          <div className="image-plate-empty">
            <ImageUp size={22} />
          </div>
        )}
        {url ? (
          <div className="image-plate-actions">
            <button
              type="button"
              aria-label="Download image"
              title="Download"
              onClick={(event) => {
                event.stopPropagation();
                handleDownload();
              }}
            >
              <Download size={15} />
            </button>
            <button
              type="button"
              aria-label="Open image"
              title="Open"
              onClick={(event) => {
                event.stopPropagation();
                setViewerOpen(true);
              }}
            >
              <Maximize2 size={15} />
            </button>
          </div>
        ) : null}
      </div>
      {viewerOpen && url ? createPortal(
        <div className="image-viewer-overlay" data-node-interactive onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" className="image-viewer-backdrop" aria-label="Close image viewer" onClick={() => setViewerOpen(false)} />
          <div className="image-viewer-content">
            <button type="button" className="image-viewer-close" aria-label="Close image viewer" onClick={() => setViewerOpen(false)}>
              <X size={18} />
            </button>
            <Image
              src={url}
              alt={asset?.name ?? 'Image preview'}
              width={asset?.width ?? 1200}
              height={asset?.height ?? 800}
              unoptimized
              className="image-viewer-media"
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
