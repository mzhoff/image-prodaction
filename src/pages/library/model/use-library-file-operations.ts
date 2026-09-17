'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteLibraryItems, prepareLibraryDownload } from '../lib/library-batch-actions';
import type { LibraryAssetItem } from './types';

export function useLibraryFileOperations(scope: string, showMessage: (message: string) => void,
  onDeleted: (ids: string[]) => void) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    running.current = false;
    setBusy(false);
    return () => controller.abort();
  }, [scope]);

  const run = useCallback(async (operation: (signal: AbortSignal) => Promise<void>) => {
    const signal = lifecycle.current?.signal;
    if (running.current || !signal || signal.aborted) return;
    running.current = true;
    setBusy(true);
    try { await operation(signal); }
    catch (error) { if (!signal.aborted) showMessage(error instanceof Error ? error.message : 'Действие не выполнено. Попробуйте ещё раз.'); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  }, [showMessage]);

  const download = useCallback((items: LibraryAssetItem[]) => run(async (signal) => {
    showMessage(`Готовим скачивание: 0 из ${items.length}`);
    const result = await prepareLibraryDownload(items, signal, (done) => { if (!signal.aborted) showMessage(`Готовим скачивание: ${done} из ${items.length}`); });
    if (signal.aborted) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url; link.download = result.name; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showMessage(items.length === 1 ? 'Скачивание началось.' : `Архив из ${items.length} файлов готов к скачиванию.`);
  }), [run, showMessage]);

  const remove = useCallback((items: LibraryAssetItem[]) => run(async (signal) => {
    showMessage(`Удаляем: 0 из ${items.length}`);
    const result = await deleteLibraryItems(items, signal, (done) => { if (!signal.aborted) showMessage(`Удаляем: ${done} из ${items.length}`); });
    if (signal.aborted) return;
    onDeleted(result.deleted);
    if (signal.aborted) return;
    showMessage(result.failed.length ? `Удалено: ${result.deleted.length}. Не удалось удалить: ${result.failed.length}. Эти файлы остались выделенными — можно повторить.`
      : `Удалено файлов: ${result.deleted.length}. Восстановить их нельзя.`);
  }), [onDeleted, run, showMessage]);
  return { busy, download, remove };
}
