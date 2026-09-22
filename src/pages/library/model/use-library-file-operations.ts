'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteLibraryItems, prepareLibraryDownload } from '../lib/library-batch-actions';
import type { LibraryAssetItem } from './types';

export function useLibraryFileOperations(scope: string, showMessage: (message: string) => void,
  onDeleted: (ids: string[]) => void) {
  const tUi = useTranslations();
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
    catch (error) { if (!signal.aborted) showMessage(error instanceof Error ? error.message : tUi("Действие не выполнено. Попробуйте ещё раз.")); }
    finally { if (!signal.aborted) { running.current = false; setBusy(false); } }
  }, [tUi, showMessage]);

  const download = useCallback((items: LibraryAssetItem[]) => run(async (signal) => {
    showMessage(tUi("Готовим скачивание: 0 из {p1}", { p1: items.length }));
    const result = await prepareLibraryDownload(items, signal, (done) => { if (!signal.aborted) showMessage(tUi("Готовим скачивание: {p1} из {p2}", { p1: done, p2: items.length })); });
    if (signal.aborted) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url; link.download = result.name; document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showMessage(items.length === 1 ? tUi("Скачивание началось.") : tUi("Архив из {p1} файлов готов к скачиванию.", { p1: items.length }));
  }), [tUi, run, showMessage]);

  const remove = useCallback((items: LibraryAssetItem[]) => run(async (signal) => {
    showMessage(tUi("Удаляем: 0 из {p1}", { p1: items.length }));
    const result = await deleteLibraryItems(items, signal, (done) => { if (!signal.aborted) showMessage(tUi("Удаляем: {p1} из {p2}", { p1: done, p2: items.length })); });
    if (signal.aborted) return;
    onDeleted(result.deleted);
    if (signal.aborted) return;
    showMessage(result.failed.length ? tUi("Удалено: {p1}. Не удалось удалить: {p2}. Эти файлы остались выделенными — можно повторить.", { p1: result.deleted.length, p2: result.failed.length })
      : tUi("Удалено файлов: {p1}. Восстановить их нельзя.", { p1: result.deleted.length }));
  }), [tUi, onDeleted, run, showMessage]);
  return { busy, download, remove };
}
