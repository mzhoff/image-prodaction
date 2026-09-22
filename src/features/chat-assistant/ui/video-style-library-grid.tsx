'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useState } from 'react';
import { Palette, Pencil, Trash2 } from '@prodactionpro/ui-core/icons';
import type { VideoStylePreset } from '@/modules/video-style-presets/contracts/video-style-preset';
import { loadVideoStylePresets, deleteVideoStyle } from '../api/video-style-presets-api';
import { VideoStyleSaveDialog } from './video-style-save-dialog';
import { VideoStyleDialog } from './video-style-dialog';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import styles from './video-style-library.module.css';

export function VideoStyleLibraryGrid({ workspaceId, onChoose, revision = 0 }: {
  workspaceId: string; onChoose?: (preset: VideoStylePreset) => void; revision?: number;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [items, setItems] = useState<VideoStylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<VideoStylePreset | null>(null);
  const [deleting, setDeleting] = useState<VideoStylePreset | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]);
    void loadVideoStylePresets(workspaceId, controller.signal).then((presets) => {
      if (!controller.signal.aborted) setItems(presets);
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось загрузить стили."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, revision, attempt]);
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true); setError('');
    try {
      await deleteVideoStyle(workspaceId, deleting.id, deleting.revision);
      setItems((current) => current.filter((item) => item.id !== deleting.id)); setDeleting(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось удалить стиль.")); }
    finally { setBusy(false); }
  };
  const visible = items.filter((item) => `${item.name} ${item.style.prompt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className={styles.library} aria-label={tUi("Стили в Library")}>
    <input className={styles.input} type="search" placeholder={tUi("Найти стиль")} aria-label={tUi("Поиск стилей")} value={query} onChange={(event) => setQuery(event.target.value)} />
    {loading ? <p role="status">{tUi("Загружаем стили…")}</p> : null}
    {!loading && !error && !visible.length ? <ProductionEmptyState kind="library" compact title={query ? tUi("Стили не найдены") : tUi("Ваш визуальный почерк")}
      description={query ? tUi("Попробуйте другое название или очистите поиск.") : tUi("Сохраните стиль из настроек истории, чтобы применять его к новым сценам и кадрам.")}
      action={query ? { label: tUi("Сбросить поиск"), onClick: () => setQuery('') } : undefined} /> : null}
    {error && !deleting ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)} <button type="button" className={styles.button} onClick={() => setAttempt((value) => value + 1)}>{tUi("Обновить")}</button></p> : null}
    <div className={styles.grid}>{visible.map((item) => <article key={item.id} className={styles.preset}>
      <button type="button" className={styles.card} aria-label={tUi("{p1} стиль {p2}", { p1: onChoose ? 'Применить' : 'Изменить', p2: item.name })}
        onClick={() => onChoose ? onChoose(item) : setEditing(item)}>
        {item.coverAssetId ? <img src={`/api/assets/${item.coverAssetId}/content?variant=thumbnail`} alt="" loading="lazy" draggable={false} /> : <span className={styles.placeholder}><Palette size={32} /></span>}
        <strong>{item.name}</strong><span className={styles.description}>{item.style.prompt || tUi("Стиль изображения")}</span>
      </button>
      <div className={styles.cardActions}><button type="button" className={styles.iconButton} aria-label={tUi("Изменить стиль {p1}", { p1: item.name })}
        onClick={() => setEditing(item)}><Pencil size={15} /></button>
        <button type="button" className={styles.iconButton} aria-label={tUi("Удалить стиль {p1}", { p1: item.name })} onClick={() => { setError(''); setDeleting(item); }}><Trash2 size={15} /></button></div>
    </article>)}</div>
    {editing ? <VideoStyleSaveDialog key={editing.id} workspaceId={workspaceId} value={editing.style} preset={editing} editable
      onClose={() => setEditing(null)} onSaved={(saved) => { setItems((current) => current.map((item) => item.id === saved.id ? saved : item)); setEditing(null); }} /> : null}
    {deleting ? <VideoStyleDialog title={tUi("Удалить стиль?")} onClose={() => setDeleting(null)} busy={busy}>
      <p>«{deleting.name}{tUi("» исчезнет из Library. Изображение обложки и настройки, уже применённые в сценах, останутся.")}</p>
      {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      <footer className={styles.footer}><button type="button" className={styles.button} disabled={busy} onClick={() => setDeleting(null)}>{tUi("Отмена")}</button>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void remove()}>{busy ? tUi("Удаляем…") : tUi("Удалить стиль")}</button></footer>
    </VideoStyleDialog> : null}
  </section>;
}
