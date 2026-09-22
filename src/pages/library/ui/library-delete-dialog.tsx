'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef } from 'react';
import type { LibraryAssetItem } from '../model/types';

export function LibraryDeleteDialog({ items, busy, onCancel, onConfirm }: {
  items: LibraryAssetItem[]; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="library-delete-dialog" aria-labelledby="library-delete-title"
    aria-describedby="library-delete-description" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="library-delete-title">{tUi("Удалить")}{' '} {items.length === 1 ? tUi("файл") : tUi("файлы ({p1})", { p1: items.length })}?</h2>
    <p id="library-delete-description">{tUi("Файлы будут удалены безвозвратно. Они также станут недоступны в канвасах, где используются. Отменить это действие нельзя.")}</p>
    <ul>{items.slice(0, 5).map((item) => <li key={item.id}>{item.originalName}</li>)}{items.length > 5 ? <li>{tUi("И ещё")}{' '} {items.length - 5}</li> : null}</ul>
    <div className="library-delete-buttons">
      <button type="button" autoFocus disabled={busy} onClick={onCancel}>{tUi("Отмена")}</button>
      <button type="button" className="library-delete-confirm" disabled={busy} onClick={onConfirm}>{busy ? tUi("Удаляем…") : tUi("Удалить безвозвратно")}</button>
    </div>
  </dialog>;
}
