'use client';

import Image from 'next/image';
import { Brush, ChevronLeft, ChevronRight, Eraser, Loader2, RotateCcw, WandSparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { useAssetUrl } from '@/shared/ui/use-asset-url';
import { ImageMaskEditor, type ImageMaskEditorHandle, type MaskTool } from './image-mask-editor';

export interface MaskEditPayload {
  assetId: string;
  maskDataUrl: string;
  prompt: string;
}

interface ImageViewerProps {
  asset?: AssetRecord;
  assetId?: string;
  busy?: boolean;
  currentIndex: number;
  hasHistory: boolean;
  historyAssetIds: string[];
  onClose: () => void;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  onNext: () => void;
  onPrevious: () => void;
  onSelectVersion: (index: number) => void;
  url: string;
}

export function ImageViewer({
  asset,
  assetId,
  busy,
  currentIndex,
  hasHistory,
  historyAssetIds,
  onClose,
  onMaskEdit,
  onNext,
  onPrevious,
  onSelectVersion,
  url,
}: ImageViewerProps) {
  const canMaskEdit = Boolean(assetId && onMaskEdit);
  const [brushSize, setBrushSize] = useState(42);
  const [maskOpen, setMaskOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tool, setTool] = useState<MaskTool>('brush');
  const maskRef = useRef<ImageMaskEditorHandle | null>(null);
  const width = asset?.width ?? 1200;
  const height = asset?.height ?? 800;

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

  useEffect(() => {
    maskRef.current?.clear();
    setMessage('');
  }, [assetId]);

  const handleSubmitEdit = async () => {
    if (!assetId || !onMaskEdit) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setMessage('Опиши, что нужно изменить в выделенной области.');
      return;
    }
    const maskDataUrl = maskRef.current?.getMaskDataUrl();
    if (!maskDataUrl) {
      setMessage('Сначала нарисуй маску на изображении.');
      return;
    }

    setMessage('');
    try {
      await onMaskEdit({ assetId, maskDataUrl, prompt: trimmedPrompt });
      maskRef.current?.clear();
      setMaskOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось перегенерировать фрагмент.');
    }
  };

  return (
    <div className="image-viewer-overlay" data-node-interactive onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="image-viewer-backdrop" aria-label="Close image viewer" onClick={onClose} />
      <div className={cn('image-viewer-content', hasHistory && 'image-viewer-content-with-history', maskOpen && 'image-viewer-content-with-editor')}>
        <button type="button" className="image-viewer-close" aria-label="Close image viewer" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="image-viewer-stage">
          <Image
            src={url}
            alt={asset?.name ?? 'Image preview'}
            width={width}
            height={height}
            unoptimized
            draggable={false}
            className="image-viewer-media"
          />
          {canMaskEdit ? (
            <ImageMaskEditor
              ref={maskRef}
              brushSize={brushSize}
              enabled={maskOpen && !busy}
              height={height}
              tool={tool}
              width={width}
            />
          ) : null}
        </div>
        {canMaskEdit ? (
          <div className="image-editor-panel">
            <div className="image-editor-row">
              <button type="button" className={cn('image-editor-button', maskOpen && 'image-editor-button-active')} onClick={() => setMaskOpen((open) => !open)}>
                <Brush size={15} />
                Mask
              </button>
              {maskOpen ? (
                <>
                  <button type="button" className={cn('image-editor-icon-button', tool === 'brush' && 'image-editor-button-active')} onClick={() => setTool('brush')} aria-label="Brush">
                    <Brush size={15} />
                  </button>
                  <button type="button" className={cn('image-editor-icon-button', tool === 'eraser' && 'image-editor-button-active')} onClick={() => setTool('eraser')} aria-label="Eraser">
                    <Eraser size={15} />
                  </button>
                  <label className="image-editor-size-control">
                    <span>{brushSize}px</span>
                    <input type="range" min="8" max="120" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
                  </label>
                  <button type="button" className="image-editor-icon-button" onClick={() => maskRef.current?.clear()} aria-label="Clear mask">
                    <RotateCcw size={15} />
                  </button>
                </>
              ) : null}
            </div>
            {maskOpen ? (
              <>
                <textarea
                  className="image-editor-prompt"
                  value={prompt}
                  placeholder="Что нужно изменить в выделенном фрагменте"
                  onChange={(event) => setPrompt(event.target.value)}
                />
                <div className="image-editor-row image-editor-row-bottom">
                  <span className="image-editor-message">{message}</span>
                  <button type="button" className="image-editor-submit" onClick={handleSubmitEdit} disabled={busy}>
                    {busy ? <Loader2 className="spin" size={15} /> : <WandSparkles size={15} />}
                    Regenerate area
                  </button>
                </div>
              </>
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
