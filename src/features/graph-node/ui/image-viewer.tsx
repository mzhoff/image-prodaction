'use client';

import Image from 'next/image';
import { Brush, ChevronLeft, ChevronRight, Eraser, Loader2, Mic, RotateCcw, WandSparkles, X } from 'lucide-react';
import { useEffect, type CSSProperties } from 'react';
import type { AssetRecord, GenerationResultMetadata } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { DarkSelect } from '@/shared/ui/dark-select';
import { RangeSlider } from '@/shared/ui/range-slider';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { ImageMaskEditor } from './image-mask-editor';
import type { MaskEditPayload } from './image-viewer-types';
import { MAX_MASK_BRUSH_SIZE, MIN_MASK_BRUSH_SIZE, useImageViewerMaskModel } from './use-image-viewer-mask-model';

interface ImageViewerProps {
  asset?: AssetRecord;
  assetId?: string;
  assetMetadata?: Record<string, GenerationResultMetadata>;
  busy?: boolean;
  currentIndex: number;
  hasHistory: boolean;
  historyAssetIds: string[];
  onClose: () => void;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  onSelectVersion: (index: number) => void;
  sourceModel?: string;
  url: string;
}

export function ImageViewer({
  asset,
  assetId,
  assetMetadata,
  busy,
  currentIndex,
  hasHistory,
  historyAssetIds,
  onClose,
  onMaskEdit,
  onNext,
  onPrevious,
  onSelectVersion,
  sourceModel,
  url,
}: ImageViewerProps) {
  const maskModel = useImageViewerMaskModel({ asset, assetId, assetMetadata, onMaskEdit, sourceModel });
  const width = asset?.width ?? 1200;
  const height = asset?.height ?? 800;
  const stageStyle = {
    aspectRatio: `${width} / ${height}`,
    '--image-viewer-aspect-ratio': width / height,
    '--image-viewer-inverse-aspect-ratio': height / width,
  } as CSSProperties;

  useEffect(() => {
    if (!hasHistory) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasHistory, onNext, onPrevious]);

  return (
    <div
      className={cn('image-viewer-overlay', maskModel.maskOpen && 'image-viewer-overlay-editing')}
      data-node-interactive
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
          maskModel.canMaskEdit && 'image-viewer-content-with-tools',
          hasHistory && 'image-viewer-content-with-history',
          (maskModel.sourceModelLabel || maskModel.imageSizeLabel) && 'image-viewer-content-with-meta',
          maskModel.maskOpen && 'image-viewer-content-with-editor',
        )}
      >
        <button type="button" className="image-viewer-close" aria-label="Close image viewer" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="image-viewer-viewport">
          <div className="image-viewer-stage" style={stageStyle}>
            <Image
              src={url}
              alt={asset?.name ?? 'Image preview'}
              width={width}
              height={height}
              unoptimized
              draggable={false}
              className="image-viewer-media"
            />
            {maskModel.canMaskEdit ? (
              <ImageMaskEditor
                ref={maskModel.maskRef}
                brushSize={maskModel.brushSize}
                enabled={maskModel.maskOpen && !busy}
                height={height}
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
        {maskModel.canMaskEdit ? (
          <div className="image-editor-panel">
            <div className="image-editor-toolbar">
              <button type="button" className={cn('image-editor-button', maskModel.maskOpen && 'image-editor-button-active')} onClick={() => maskModel.setMaskOpen((open) => !open)}>
                <Brush size={15} />
                Mask
              </button>
              {maskModel.maskOpen ? (
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
            </div>
            {maskModel.maskOpen ? (
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
              {historyAssetIds.map((historyAssetId, index) => (
                <ImageViewerThumbnail
                  key={historyAssetId}
                  active={index === currentIndex}
                  assetId={historyAssetId}
                  index={index}
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

function ImageViewerThumbnail({
  active,
  assetId,
  index,
  onSelect,
}: {
  active: boolean;
  assetId: string;
  index: number;
  onSelect: (index: number) => void;
}) {
  const url = useAssetUrl(assetId);

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
        alt={`Generated variation ${index + 1}`}
        fill
        sizes="80px"
        unoptimized
        draggable={false}
        className="image-viewer-thumbnail-media"
      />
    </button>
  );
}
