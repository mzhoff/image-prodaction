'use client';

import Image from 'next/image';
import { Brush, ChevronLeft, ChevronRight, Eraser, Loader2, Mic, RotateCcw, WandSparkles, X } from 'lucide-react';
import { memo, useEffect, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { AssetRecord, GenerationResultMetadata } from '@/entities/production-graph/model/types';
import { getImageViewerThumbnailWindow } from '@/features/graph-node/lib/image-viewer-thumbnail-window';
import { cn } from '@/shared/lib/cn';
import { DarkSelect } from '@/shared/ui/dark-select';
import { RangeSlider } from '@/shared/ui/range-slider';
import { SaveToLibraryButton } from '@/shared/ui/save-to-library-button';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { ImageMaskEditor } from './image-mask-editor';
import type { ImageViewerEditorPanel, MaskEditPayload } from './image-viewer-types';
import { MAX_MASK_BRUSH_SIZE, MIN_MASK_BRUSH_SIZE, useImageViewerMaskModel } from './use-image-viewer-mask-model';

export interface ImageViewerItem {
  id: string;
  height?: number;
  name?: string;
  thumbnailUrl?: string;
  url: string;
  width?: number;
}

interface ImageViewerProps {
  asset?: AssetRecord;
  assetId?: string;
  assetMetadata?: Record<string, GenerationResultMetadata>;
  busy?: boolean;
  currentIndex: number;
  hasHistory: boolean;
  historyAssetIds: string[];
  items?: ImageViewerItem[];
  maskDataUrl?: string;
  onClose: () => void;
  onMaskChange?: (maskDataUrl: string | null) => void;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  onSelectVersion: (index: number) => void;
  onSaveToLibrary?: (assetId: string) => Promise<void>;
  savedToLibrary?: boolean;
  sourceModel?: string;
  url: string;
  viewerPanel?: ImageViewerEditorPanel;
}

export function ImageViewer({
  asset,
  assetId,
  assetMetadata,
  busy,
  currentIndex,
  hasHistory,
  historyAssetIds,
  items,
  maskDataUrl,
  onClose,
  onMaskChange,
  onMaskEdit,
  onNext,
  onPrevious,
  onSelectVersion,
  onSaveToLibrary,
  savedToLibrary,
  sourceModel,
  url,
  viewerPanel,
}: ImageViewerProps) {
  const maskModel = useImageViewerMaskModel({ asset, assetId, assetMetadata, maskDataUrl, onMaskChange, onMaskEdit, sourceModel });
  const itemsById = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, item])),
    [items],
  );
  const currentItem = assetId ? itemsById.get(assetId) : undefined;
  const visibleThumbnails = useMemo(
    () => getImageViewerThumbnailWindow(historyAssetIds, currentIndex),
    [currentIndex, historyAssetIds],
  );
  const hasToolPanel = maskModel.canMaskEdit || Boolean(viewerPanel);
  const customPanelOpen = Boolean(viewerPanel?.active);
  const editorOpen = maskModel.maskOpen || customPanelOpen;
  const width = asset?.width ?? currentItem?.width ?? 1200;
  const height = asset?.height ?? currentItem?.height ?? 800;
  const stageStyle = {
    aspectRatio: `${width} / ${height}`,
    '--image-viewer-aspect-ratio': width / height,
    '--image-viewer-inverse-aspect-ratio': height / width,
  } as CSSProperties;
  const contentStyle = customPanelOpen && viewerPanel?.height
    ? { '--image-viewer-panel-height': `${viewerPanel.height}px` } as CSSProperties
    : undefined;
  const closeOnEmptyPreviewArea = (event: ReactMouseEvent<HTMLElement>) => {
    if (editorOpen) return;
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return;
      if (hasHistory && event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      }
      if (hasHistory && event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasHistory, onClose, onNext, onPrevious]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  return (
    <div
      className={cn('image-viewer-overlay', maskModel.maskOpen && 'image-viewer-overlay-editing')}
      data-node-interactive
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="image-viewer-backdrop" aria-label="Close image viewer" onClick={onClose} />
      <div
        className={cn(
          'image-viewer-content',
          hasToolPanel && 'image-viewer-content-with-tools',
          hasHistory && 'image-viewer-content-with-history',
          (maskModel.sourceModelLabel || maskModel.imageSizeLabel) && 'image-viewer-content-with-meta',
          editorOpen && 'image-viewer-content-with-editor',
          maskModel.localMaskMode && 'image-viewer-content-with-local-mask',
        )}
        style={contentStyle}
        onMouseDown={closeOnEmptyPreviewArea}
      >
        <button type="button" className="image-viewer-close" aria-label="Close image viewer" onClick={onClose}>
          <X size={18} />
        </button>
        {assetId && onSaveToLibrary ? (
          <div className="image-viewer-save-to-library">
            <SaveToLibraryButton
              assetId={assetId}
              onSave={onSaveToLibrary}
              saved={savedToLibrary}
            />
          </div>
        ) : null}
        <div className="image-viewer-viewport" onMouseDown={closeOnEmptyPreviewArea}>
          <div className="image-viewer-stage" style={stageStyle}>
            <Image
              src={url}
              alt={asset?.name ?? currentItem?.name ?? 'Image preview'}
              width={width}
              height={height}
              unoptimized
              loading="eager"
              decoding="async"
              draggable={false}
              className="image-viewer-media"
            />
            {maskModel.canMaskEdit ? (
              <ImageMaskEditor
                ref={maskModel.maskRef}
                brushSize={maskModel.brushSize}
                enabled={maskModel.maskOpen && !busy}
                height={height}
                initialMaskDataUrl={maskModel.maskDataUrl ?? null}
                onMaskChange={maskModel.onMaskChange}
                onPreviewToolChange={maskModel.setPreviewTool}
                tool={maskModel.tool}
                width={width}
              />
            ) : null}
          </div>
        </div>
        {maskModel.sourceModelLabel || maskModel.imageSizeLabel ? (
          <div className="image-viewer-meta">
            {maskModel.sourceModelLabel ? <span className="image-viewer-meta-model">{maskModel.sourceModelLabel}</span> : null}
            {maskModel.imageSizeLabel ? <span className="image-viewer-meta-size">{maskModel.imageSizeLabel}</span> : null}
          </div>
        ) : null}
        {hasToolPanel ? (
          <div className={cn('image-editor-panel', viewerPanel?.className)}>
            <div className="image-editor-toolbar">
              {maskModel.canMaskEdit ? (
                <button type="button" className={cn('image-editor-button', maskModel.maskOpen && 'image-editor-button-active')} onClick={() => maskModel.setMaskOpen((open) => !open)}>
                  <Brush size={15} />
                  Mask
                </button>
              ) : null}
              {maskModel.canMaskEdit && maskModel.maskOpen ? (
                <div className="image-editor-mask-tools">
                  <div className="image-editor-tool-pair">
                    <button type="button" className={cn('image-editor-icon-button', maskModel.visibleTool === 'brush' && 'image-editor-button-active')} onClick={() => maskModel.setTool('brush')} aria-label="Brush">
                      <Brush size={15} />
                    </button>
                    <button type="button" className={cn('image-editor-icon-button', maskModel.visibleTool === 'eraser' && 'image-editor-button-active')} onClick={() => maskModel.setTool('eraser')} aria-label="Eraser">
                      <Eraser size={15} />
                    </button>
                  </div>
                  <RangeSlider
                    ariaLabel="Mask brush size"
                    className="image-editor-size-slider"
                    max={MAX_MASK_BRUSH_SIZE}
                    min={MIN_MASK_BRUSH_SIZE}
                    value={maskModel.brushSize}
                    valueLabel={`${maskModel.brushSize}px`}
                    onChange={maskModel.setBrushSize}
                  />
                  <button type="button" className="image-editor-icon-button" onClick={() => maskModel.maskRef.current?.clear()} aria-label="Clear mask">
                    <RotateCcw size={15} />
                  </button>
                </div>
              ) : null}
              {viewerPanel?.toolbar ? <div className="image-editor-custom-toolbar">{viewerPanel.toolbar}</div> : null}
            </div>
            {maskModel.maskOpen && !maskModel.localMaskMode ? (
              <div className="image-editor-input-area">
                <textarea
                  className="image-editor-prompt"
                  value={maskModel.prompt}
                  placeholder="Что необходимо изменить в выделенном фрагменте?"
                  onChange={(event) => maskModel.setPrompt(event.target.value)}
                />
                <div className="image-editor-input-toolbar">
                  <DarkSelect className="image-editor-model-button" value={maskModel.selectedEditModel} options={maskModel.modelOptions} onChange={maskModel.setEditModel} />
                  <div className="image-editor-action-group">
                    <button type="button" className="image-editor-mic-button" aria-label="Voice input">
                      <Mic size={20} />
                    </button>
                    <button type="button" className="image-editor-submit" onClick={maskModel.handleSubmitEdit} disabled={busy}>
                      {busy ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
                      ReGenerate
                    </button>
                  </div>
                </div>
                {maskModel.message ? <span className="image-editor-message">{maskModel.message}</span> : null}
              </div>
            ) : null}
            {viewerPanel?.active ? (
              <div className="image-editor-custom-panel">
                {viewerPanel.body}
              </div>
            ) : null}
          </div>
        ) : null}
        {hasHistory ? (
          <>
            <button type="button" className="image-viewer-nav image-viewer-nav-prev" aria-label="Previous generated image" onClick={onPrevious}>
              <ChevronLeft size={24} />
            </button>
            <button type="button" className="image-viewer-nav image-viewer-nav-next" aria-label="Next generated image" onClick={onNext}>
              <ChevronRight size={24} />
            </button>
            <div className="image-viewer-thumbnail-strip" aria-label="Generated image variations">
              {visibleThumbnails.map(({ assetId: historyAssetId, index }) => (
                <ImageViewerThumbnail
                  key={historyAssetId}
                  active={index === currentIndex}
                  assetId={historyAssetId}
                  index={index}
                  item={itemsById.get(historyAssetId)}
                  onSelect={onSelectVersion}
                />
              ))}
            </div>
            <div className="image-viewer-version-badge">{currentIndex + 1}/{historyAssetIds.length}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const ImageViewerThumbnail = memo(function ImageViewerThumbnail({
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
