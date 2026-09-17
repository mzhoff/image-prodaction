'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Loader2, X } from '@prodactionpro/ui-core/icons';
import { ImageViewer } from '@/features/graph-node/ui/image-viewer';
import type { ImageViewerItem } from '@/features/graph-node/ui/image-viewer';
import { fetchLibraryAsset } from '../api/library-api';
import { useLibrary } from '../model/library-context';
import type { LibraryAssetItem } from '../model/types';
import { LibraryImageToolbar } from './library-asset-actions';

interface LibraryPreviewProps {
  assetId: string;
  mode: 'intercepted' | 'direct';
}

export function LibraryPreview({ assetId: initialAssetId, mode }: LibraryPreviewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pathAssetId = /^\/library\/([^/]+)$/.exec(pathname ?? '')?.[1];
  const assetId = pathAssetId ?? initialAssetId;
  const library = useLibrary();
  const loadMore = library.loadMore;
  const [fallbackItem, setFallbackItem] = useState<LibraryAssetItem | null>(null);
  const [fallbackPending, setFallbackPending] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const currentFromCollection = library.items.find((item) => item.id === assetId);

  useEffect(() => {
    if (!library.nextCursor || library.loadingMore || library.error) return;
    void loadMore();
  }, [
    library.error,
    loadMore,
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
    const mediaKind = current?.mediaKind ?? 'image';
    const matchingItems = library.items.filter((item) => item.mediaKind === mediaKind);
    if (!current || matchingItems.some((item) => item.id === current.id)) return matchingItems;
    return [current, ...matchingItems];
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
  const querySuffix = library.navigationQuery ? `?${library.navigationQuery}` : '';
  const collectionPending = library.loading
    || library.loadingMore
    || Boolean(library.filterQuery && library.nextCursor);

  const close = useCallback(() => {
    if (mode === 'intercepted') router.back();
    else router.replace(`/library${querySuffix}`);
  }, [mode, querySuffix, router]);

  const selectAt = useCallback((index: number) => {
    const next = sequence[wrapIndex(index, sequence.length)];
    // This viewer already owns the overlay. A router navigation from a direct
    // asset page would intercept itself and mount a second viewer in @preview.
    // Native history integrates with usePathname and keeps the URL reloadable.
    if (next) window.history.replaceState(null, '', `/library/${encodeURIComponent(next.id)}${querySuffix}`);
  }, [querySuffix, sequence]);

  if (!pathAssetId) return null;

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

  return (
    <ImageViewer
      assetId={current.id}
      currentIndex={currentIndex}
      hasHistory={sequence.length > 1}
      historyAssetIds={sequence.map((item) => item.id)}
      items={viewerItems}
      thumbnailLayout={current.mediaKind === 'video' ? 'strip' : 'dock'}
      onClose={close}
      onNext={() => selectAt(currentIndex + 1)}
      onPrevious={() => selectAt(currentIndex - 1)}
      onSelectVersion={selectAt}
      sourceModel={current.modelId ?? current.provider ?? undefined}
      url={current.contentUrl}
      viewerMedia={current.mediaKind === 'video' ? <video
        className="image-viewer-media library-video-player"
        controls
        playsInline
        poster={current.thumbnailUrl ?? undefined}
        preload="metadata"
        src={current.contentUrl}
      /> : undefined}
      viewerPanel={current.mediaKind === 'image'
        ? { active: false, body: null, className: 'image-editor-panel-library', toolbar: <LibraryImageToolbar item={current} /> }
        : undefined}
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
