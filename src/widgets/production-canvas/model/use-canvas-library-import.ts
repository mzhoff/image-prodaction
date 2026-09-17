'use client';

import { useCallback, useEffect, useRef } from 'react';
import { loadLibraryImageReference, readLibraryProjectImports } from '@/entities/production-graph/lib/library-image-reference';
import { insertLibraryImageBatch } from '@/entities/production-graph/model/library-image-batch-import';
import { getActiveAssetScopeSnapshot } from '@/entities/production-graph/lib/remote-asset';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { GraphPoint } from '@/entities/production-graph/model/types';

export function useCanvasLibraryImport({ projectId, ready, documentStatus, getPosition, showToast }: {
  projectId?: string;
  ready: boolean;
  documentStatus: 'active' | 'trash';
  getPosition: () => GraphPoint;
  showToast: (message: string) => void;
}) {
  const positionRef = useRef(getPosition);
  positionRef.current = getPosition;
  const canImportRef = useRef(ready && documentStatus === 'active');
  canImportRef.current = ready && documentStatus === 'active';
  const lifecycleRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycleRef.current = controller;
    return () => controller.abort();
  }, [projectId]);

  const importLibraryImages = useCallback(async (entries: Array<{ assetId: string; nodeId?: string }>) => {
    const scope = getActiveAssetScopeSnapshot();
    const signal = lifecycleRef.current?.signal;
    if (!ready || !projectId || scope?.documentId !== projectId || documentStatus !== 'active') {
      showToast('Сначала откройте доступный проект и дождитесь загрузки канваса.');
      return false;
    }
    const pending = entries.filter(({ nodeId }) => !nodeId || !useProductionGraphStore.getState().nodes.some((node) => node.id === nodeId));
    if (!pending.length) return true;
    const position = positionRef.current();
    try {
      if (pending.length > 1) showToast(`Добавляем изображения из библиотеки: ${pending.length}…`);
      const loaded = [];
      for (const { assetId, nodeId } of pending) {
        loaded.push({ asset: await loadLibraryImageReference(assetId, scope.workspaceId, signal), nodeId });
      }
      if (signal?.aborted || !canImportRef.current || getActiveAssetScopeSnapshot() !== scope) return false;
      insertLibraryImageBatch(loaded, position);
      showToast(loaded.length > 1 ? `Добавлено изображений: ${loaded.length}. Всю группу можно отменить одним Undo.`
        : 'Изображение добавлено в Import. Оригинал и миниатюра используются из библиотеки.');
      return true;
    } catch (error) {
      if (!signal?.aborted) showToast(error instanceof Error ? error.message : 'Не удалось вставить изображение.');
      return false;
    }
  }, [documentStatus, projectId, ready, showToast]);

  useEffect(() => {
    if (!ready || !projectId) return;
    const request = readLibraryProjectImports(window.location.search);
    if (!request) return;
    let active = true;
    void importLibraryImages(request).then((inserted) => {
      if (!active || !inserted) return;
      const url = new URL(window.location.href);
      url.searchParams.delete('importAsset');
      url.searchParams.delete('importRequest');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    });
    return () => { active = false; };
  }, [importLibraryImages, projectId, ready]);

  const importLibraryImage = useCallback((assetId: string, nodeId?: string) => importLibraryImages([{ assetId, nodeId }]), [importLibraryImages]);
  return importLibraryImage;
}
