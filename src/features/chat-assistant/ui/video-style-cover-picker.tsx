'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
import { loadHomeLibraryReferences, type HomeLibraryReference } from '../api/home-library-reference-api';
import styles from './video-style-library.module.css';

export function VideoStyleCoverPicker({ workspaceId, onChoose, onCancel }: {
  workspaceId: string; onChoose: (assetId: string) => void; onCancel: () => void;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<HomeLibraryReference[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true); setError(''); setItems([]); setCursor(null);
    const timer = setTimeout(() => {
      void loadHomeLibraryReferences(workspaceId, query, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setItems(result.items); setCursor(result.nextCursor); }
      }).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить изображения. Повторите попытку.")); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 200 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [workspaceId, query, attempt]);
  const more = async () => {
    const controller = requestController.current;
    if (!cursor || loading || !controller || controller.signal.aborted) return;
    setLoading(true); setError('');
    try {
      const result = await loadHomeLibraryReferences(workspaceId, query, controller.signal, cursor);
      if (controller.signal.aborted) return;
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((old) => old.id === item.id))]);
      setCursor(result.nextCursor);
    } catch { if (!controller.signal.aborted) setError(tUi("Не удалось загрузить следующую страницу. Повторите попытку.")); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  };
  return <section className={styles.coverPicker} aria-label={tUi("Выбор обложки стиля")}>
    <div className={styles.toolbar}><strong>{tUi("Обложка из Library")}</strong><button type="button" className={styles.button} onClick={onCancel}>{tUi("Назад")}</button></div>
    <input className={styles.input} type="search" placeholder={tUi("Найти изображение")} aria-label={tUi("Найти обложку")} value={query}
      onChange={(event) => setQuery(event.target.value)} />
    <div className={styles.grid}>{items.map((item) => <button key={item.id} type="button" className={styles.card}
      onClick={() => onChoose(item.id)} aria-label={tUi("Выбрать обложку: {p1}", { p1: item.originalName })}>
      <img src={`/api/assets/${item.id}/content?variant=thumbnail`} alt="" loading="lazy" draggable={false} /><strong>{item.originalName}</strong>
    </button>)}</div>
    {loading ? <p role="status">{tUi("Загружаем изображения…")}</p> : null}
    {!loading && !items.length && !error ? <p>{tUi("Изображений пока нет. Сохраните результат генерации в Library или загрузите изображение.")}</p> : null}
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)} <button type="button" className={styles.button} onClick={() => setAttempt((value) => value + 1)}>{tUi("Повторить")}</button></p> : null}
    {cursor ? <button type="button" className={styles.button} disabled={loading} onClick={() => void more()}>{tUi("Показать ещё")}</button> : null}
  </section>;
}
