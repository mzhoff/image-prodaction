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
} from '@prodactionpro/ui-core/icons';
import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
import { ProTooltip } from '@/shared/ui/pro-tooltip';
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
  outputPending?: boolean;
  mediaStyle?: CSSProperties;
  adaptive?: boolean;
  renderLoadingOverlay?: (context: { previewUrl?: string }) => ReactNode;
  onActiveIndexChange?: (index: number) => void;
  navigationLabels?: { previous: string; next: string };
  maskDataUrl?: string;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onMaskChange?: (maskDataUrl: string | null) => void;
  sourceModel?: string;
  viewerPanel?: ImageViewerEditorPanel;
  previewMedia?: ReactNode;
  viewerMedia?: ReactNode;
  mediaKind?: 'image' | 'video';
}

export function ImagePlate({
  activeIndex,
  assetId,
  assetIds,
  assetMetadata,
  aspectRatio,
  compact,
  loading,
  outputPending,
  maskDataUrl,
  mediaStyle,
  renderLoadingOverlay,
  onActiveIndexChange,
  navigationLabels,
  onMaskChange,
  onMaskEdit,
  sourceModel,
  viewerPanel,
  previewMedia,
  viewerMedia,
  mediaKind = 'image',
}: ImagePlateProps) {
  const historyAssetIds = assetIds?.length ? assetIds : assetId ? [assetId] : [];
  const currentIndex = getSafeIndex(activeIndex, historyAssetIds.length);
  const currentAssetId = historyAssetIds[currentIndex] ?? assetId;
  const hasHistory = historyAssetIds.length > 1 && Boolean(onActiveIndexChange);
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === currentAssetId));
  const url = useAssetUrl(currentAssetId);
  const previewUrl = useAssetUrl(currentAssetId, 'thumbnail');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const imageAspectRatio = asset?.width && asset.height ? `${asset.width} / ${asset.height}` : undefined;
  const plateAspectRatio = formatCssAspectRatio(aspectRatio) ?? imageAspectRatio ?? formatCssAspectRatio(DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO);
  const mediaName = mediaKind === 'video' ? 'video' : 'image';

  const handleDownload = () => {
    if (!url || !asset || outputPending) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = asset.name || 'reverie-image.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleSaveToLibrary = async () => {
    if (!asset || outputPending || savingToLibrary || isAssetInLibrary(asset)) return;
    setSavingToLibrary(true);
    setSaveError(null);
    try {
      await persistAssetToLibrary(asset);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : `Не удалось сохранить ${mediaKind === 'video' ? 'видео' : 'изображение'} в библиотеку.`);
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
        {previewMedia ?? (previewUrl ? (
          <Image src={previewUrl} alt="Reference preview" fill sizes="368px" unoptimized draggable={false} className="image-plate-media" style={mediaStyle} />
        ) : (
          <div className="image-plate-empty">
            <ImageUp size={22} />
          </div>
        ))}
        {loading ? renderLoadingOverlay?.({ previewUrl: previewUrl ?? undefined }) : null}
        {url ? (
          <div className="image-plate-actions">
            <ProTooltip
              label={saveError || (isAssetInLibrary(asset) ? 'Saved in Library' : 'Save to Library')}
              side="bottom"
            >
              <button
                type="button"
                aria-label={saveError || (isAssetInLibrary(asset) ? `${mediaName === 'video' ? 'Video' : 'Image'} is saved in Library` : `Save ${mediaName} to Library`)}
                disabled={outputPending || savingToLibrary || isAssetInLibrary(asset)}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSaveToLibrary();
                }}
              >
                {savingToLibrary
                  ? <Loader2 className="spin" size={15} />
                  : isAssetInLibrary(asset) ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
              </button>
            </ProTooltip>
            <ProTooltip label="Download" side="bottom">
              <button
                type="button"
                aria-label={`Download ${mediaName}`}
                disabled={outputPending}
                onClick={(event) => {
                  event.stopPropagation();
                  handleDownload();
                }}
              >
                <Download size={15} />
              </button>
            </ProTooltip>
            <ProTooltip label="Open" side="bottom">
              <button
                type="button"
                aria-label={`Open ${mediaName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setViewerOpen(true);
                }}
              >
                <Maximize2 size={15} />
              </button>
            </ProTooltip>
          </div>
        ) : null}
        {hasHistory ? (
          <>
            <div className="image-plate-version-controls">
              <ProTooltip label="Previous">
                <button
                  type="button"
                  aria-label={navigationLabels?.previous ?? 'Previous generated image'}
                  onClick={(event) => {
                    event.stopPropagation();
                    showPrevious();
                  }}
                >
                  <ChevronLeft size={15} />
                </button>
              </ProTooltip>
              <ProTooltip label="Next">
                <button
                  type="button"
                  aria-label={navigationLabels?.next ?? 'Next generated image'}
                  onClick={(event) => {
                    event.stopPropagation();
                    showNext();
                  }}
                >
                  <ChevronRight size={15} />
                </button>
              </ProTooltip>
            </div>
            <div className="image-plate-version-badge">{currentIndex + 1}/{historyAssetIds.length}</div>
          </>
        ) : null}
      </div>
      {viewerOpen && url ? createPortal(
        <ImageViewer
          asset={asset}
          assetId={currentAssetId}
          busy={loading || outputPending}
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
          viewerMedia={viewerMedia}
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
