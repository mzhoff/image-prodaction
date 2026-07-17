'use client';

import Image from 'next/image';
import {
  BookmarkCheck,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageUp,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GenerationResultMetadata } from '@/entities/production-graph/model/types';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from '@/entities/production-graph/model/node-layout';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { cn } from '@/shared/lib/cn';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import {
  isAssetInLibrary,
  persistAssetToLibrary,
} from '@/entities/production-graph/lib/persist-asset-to-library';
import { ImageViewer } from './image-viewer';
import type { ImageViewerEditorPanel, MaskEditPayload } from './image-viewer-types';

interface ImagePlateProps {
  activeIndex?: number;
  assetId?: string;
  assetIds?: string[];
  assetMetadata?: Record<string, GenerationResultMetadata>;
  aspectRatio?: string;
  compact?: boolean;
  loading?: boolean;
  mediaStyle?: CSSProperties;
  adaptive?: boolean;
  onActiveIndexChange?: (index: number) => void;
  maskDataUrl?: string;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onMaskChange?: (maskDataUrl: string | null) => void;
  sourceModel?: string;
  viewerPanel?: ImageViewerEditorPanel;
}

export function ImagePlate({
  activeIndex,
  assetId,
  assetIds,
  assetMetadata,
  aspectRatio,
  compact,
  loading,
  maskDataUrl,
  mediaStyle,
  onActiveIndexChange,
  onMaskChange,
  onMaskEdit,
  sourceModel,
  viewerPanel,
}: ImagePlateProps) {
  const historyAssetIds = assetIds?.length ? assetIds : assetId ? [assetId] : [];
  const currentIndex = getSafeIndex(activeIndex, historyAssetIds.length);
  const currentAssetId = historyAssetIds[currentIndex] ?? assetId;
  const hasHistory = historyAssetIds.length > 1 && Boolean(onActiveIndexChange);
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === currentAssetId));
  const url = useAssetUrl(currentAssetId);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const imageAspectRatio = asset?.width && asset.height ? `${asset.width} / ${asset.height}` : undefined;
  const plateAspectRatio = formatCssAspectRatio(aspectRatio) ?? imageAspectRatio ?? formatCssAspectRatio(DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO);

  const handleDownload = () => {
    if (!url || !asset) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = asset.name || 'reverie-image.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSaveToLibrary = async () => {
    if (!asset || savingToLibrary || isAssetInLibrary(asset)) return;
    setSavingToLibrary(true);
    setSaveError(null);
    try {
      await persistAssetToLibrary(asset);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изображение в библиотеку.');
    } finally {
      setSavingToLibrary(false);
    }
  };

  const changeVersion = useCallback((nextIndex: number) => {
    if (!hasHistory) return;
    onActiveIndexChange?.(wrapIndex(nextIndex, historyAssetIds.length));
  }, [hasHistory, historyAssetIds.length, onActiveIndexChange]);

  const showPrevious = useCallback(() => changeVersion(currentIndex - 1), [changeVersion, currentIndex]);
  const showNext = useCallback(() => changeVersion(currentIndex + 1), [changeVersion, currentIndex]);

  return (
    <>
      <div
        className={cn(
          'image-plate',
          compact && 'image-plate-compact',
          plateAspectRatio && 'image-plate-sized',
          loading && 'image-plate-loading',
          url && 'image-plate-interactive',
        )}
        style={plateAspectRatio ? { aspectRatio: plateAspectRatio } : undefined}
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
          <Image src={url} alt="Reference preview" fill sizes="368px" unoptimized draggable={false} className="image-plate-media" style={mediaStyle} />
        ) : (
          <div className="image-plate-empty">
            <ImageUp size={22} />
          </div>
        )}
        {url ? (
          <div className="image-plate-actions">
            <button
              type="button"
              aria-label={saveError || (isAssetInLibrary(asset) ? 'Image is saved in Library' : 'Save image to Library')}
              title={saveError || (isAssetInLibrary(asset) ? 'Saved in Library' : 'Save to Library')}
              disabled={savingToLibrary || isAssetInLibrary(asset)}
              onClick={(event) => {
                event.stopPropagation();
                void handleSaveToLibrary();
              }}
            >
              {savingToLibrary
                ? <Loader2 className="spin" size={15} />
                : isAssetInLibrary(asset) ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
            </button>
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
        {hasHistory ? (
          <>
            <div className="image-plate-version-controls">
              <button
                type="button"
                aria-label="Previous generated image"
                title="Previous"
                onClick={(event) => {
                  event.stopPropagation();
                  showPrevious();
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                aria-label="Next generated image"
                title="Next"
                onClick={(event) => {
                  event.stopPropagation();
                  showNext();
                }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="image-plate-version-badge">{currentIndex + 1}/{historyAssetIds.length}</div>
          </>
        ) : null}
      </div>
      {viewerOpen && url ? createPortal(
        <ImageViewer
          asset={asset}
          assetId={currentAssetId}
          busy={loading}
          currentIndex={currentIndex}
          hasHistory={hasHistory}
          historyAssetIds={historyAssetIds}
          maskDataUrl={maskDataUrl}
          assetMetadata={assetMetadata}
          onClose={() => setViewerOpen(false)}
          onMaskChange={onMaskChange}
          onMaskEdit={onMaskEdit}
          onNext={showNext}
          onPrevious={showPrevious}
          onSaveToLibrary={async () => handleSaveToLibrary()}
          onSelectVersion={changeVersion}
          savedToLibrary={isAssetInLibrary(asset)}
          sourceModel={sourceModel}
          url={url}
          viewerPanel={viewerPanel}
        />,
        document.body,
      ) : null}
    </>
  );
}

function formatCssAspectRatio(value?: string) {
  const normalized = value?.trim().replace(':', ' / ');
  return normalized && /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined;
}

function getSafeIndex(index: number | undefined, length: number) {
  if (length <= 0) return -1;
  if (typeof index !== 'number' || Number.isNaN(index)) return length - 1;
  return Math.min(Math.max(index, 0), length - 1);
}

function wrapIndex(index: number, length: number) {
  if (length <= 0) return -1;
  return (index + length) % length;
}
