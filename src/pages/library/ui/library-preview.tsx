'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ImageViewer } from '@/features/graph-node/ui/image-viewer';
import type { ImageViewerItem } from '@/features/graph-node/ui/image-viewer';
import { fetchLibraryAsset } from '../api/library-api';
import { useLibrary } from '../model/library-context';
import type { LibraryAssetItem } from '../model/types';

interface LibraryPreviewProps {
  assetId: string;
  mode: 'intercepted' | 'direct';
}

export function LibraryPreview({ assetId, mode }: LibraryPreviewProps) {
  const router = useRouter();
  const library = useLibrary();
  const [fallbackItem, setFallbackItem] = useState<LibraryAssetItem | null>(null);
  const [fallbackPending, setFallbackPending] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const currentFromCollection = library.items.find((item) => item.id === assetId);

  useEffect(() => {
    if (!library.nextCursor || library.loadingMore || library.error) return;
    void library.loadMore();
  }, [
    library.error,
    library.loadMore,
    library.loadingMore,
    library.nextCursor,
  ]);

  useEffect(() => {
    if (currentFromCollection || library.loading) return;
    if (library.filterQuery) {
      if (library.nextCursor || library.loadingMore) return;
      setFallbackItem(null);
      setFallbackPending(false);
      setFallbackError('Объект не входит в текущую отфильтрованную выдачу.');
      return;
    }
    const controller = new AbortController();
    setFallbackItem(null);
    setFallbackPending(true);
    setFallbackError(null);
    fetchLibraryAsset(assetId, controller.signal)
      .then((item) => {
        setFallbackItem(item);
        if (!item) setFallbackError('Объект не найден или больше недоступен.');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFallbackError(error instanceof Error ? error.message : 'Не удалось открыть объект.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setFallbackPending(false);
      });
    return () => controller.abort();
  }, [
    assetId,
    currentFromCollection,
    library.filterQuery,
    library.loading,
    library.loadingMore,
    library.nextCursor,
  ]);

  const current = currentFromCollection ?? fallbackItem;
  const sequence = useMemo(() => {
    const imageItems = library.items.filter((item) => item.mediaKind === 'image');
    if (!current || imageItems.some((item) => item.id === current.id)) return imageItems;
    return current.mediaKind === 'image' ? [current, ...imageItems] : imageItems;
  }, [current, library.items]);
  const currentIndex = Math.max(0, sequence.findIndex((item) => item.id === assetId));
  const viewerItems = useMemo<ImageViewerItem[]>(() => sequence.map((item) => ({
    id: item.id,
    height: item.height ?? undefined,
    name: item.originalName,
    thumbnailUrl: item.thumbnailUrl ?? undefined,
    url: item.contentUrl,
    width: item.width ?? undefined,
  })), [sequence]);
  const querySuffix = library.filterQuery ? `?${library.filterQuery}` : '';
  const collectionPending = library.loading
    || library.loadingMore
    || Boolean(library.filterQuery && library.nextCursor);

  const close = useCallback(() => {
    if (mode === 'intercepted') router.back();
    else router.replace(`/library${querySuffix}`);
  }, [mode, querySuffix, router]);

  const selectAt = useCallback((index: number) => {
    const next = sequence[wrapIndex(index, sequence.length)];
    if (next) router.replace(`/library/${encodeURIComponent(next.id)}${querySuffix}`, { scroll: false });
  }, [querySuffix, router, sequence]);

  if ((collectionPending || fallbackPending) && !current) {
    return (
      <PreviewState onClose={close}>
        <Loader2 className="spin" size={24} />
        <strong>Открываем оригинал…</strong>
      </PreviewState>
    );
  }

  if (!current || fallbackError) {
    return (
      <PreviewState onClose={close}>
        <AlertTriangle size={24} />
        <strong>Не удалось открыть объект</strong>
        <span>{fallbackError || 'Объект отсутствует в текущей выдаче.'}</span>
      </PreviewState>
    );
  }

  if (current.mediaKind !== 'image') {
    return (
      <PreviewState onClose={close}>
        <AlertTriangle size={24} />
        <strong>Предпросмотр этого формата пока недоступен</strong>
        <a href={current.contentUrl} target="_blank" rel="noreferrer">Открыть оригинал</a>
      </PreviewState>
    );
  }

  return (
    <ImageViewer
      assetId={current.id}
      currentIndex={currentIndex}
      hasHistory={sequence.length > 1}
      historyAssetIds={sequence.map((item) => item.id)}
      items={viewerItems}
      onClose={close}
      onNext={() => selectAt(currentIndex + 1)}
      onPrevious={() => selectAt(currentIndex - 1)}
      onSelectVersion={selectAt}
      sourceModel={current.modelId ?? current.provider ?? undefined}
      url={current.contentUrl}
    />
  );
}

function PreviewState({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="library-preview-state-overlay" role="dialog" aria-modal="true" aria-label="Asset preview">
      <button type="button" className="image-viewer-backdrop" aria-label="Close image viewer" onClick={onClose} />
      <div className="library-preview-state">
        <button type="button" onClick={onClose} aria-label="Close image viewer"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return (index + length) % length;
}
