'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useId, useRef, useState } from 'react';
import { Check, ImagePlus, LibraryBig, LoaderCircle, Search, X } from '@prodactionpro/ui-core/icons';
import {
  isHomeReferenceTooLarge, loadHomeLibraryReferences,
  type HomeLibraryReference,
} from '../api/home-library-reference-api';
import styles from './home-library-picker.module.css';
import { HomeMaterialTrigger } from './home-material-trigger';
import { commitHomeLibrarySelection, toggleHomeLibrarySelection } from '../model/home-library-selection';

export function HomeLibraryReferencePicker({ workspaceId, disabled, onChoose, variant = 'inline', count = 0, maxCount = 3 }: {
  workspaceId: string; disabled: boolean; onChoose: (files: File[]) => Promise<void>; variant?: 'inline' | 'card' | 'icon'; count?: number; maxCount?: number;
}) {
  const tUi = useTranslations();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, maxCount - count);
  return <>
    {variant === 'card' ? <HomeMaterialTrigger label={tUi("Референс")} icon={<ImagePlus />} count={count} limit={maxCount}
      disabled={disabled || !workspaceId || !remaining} expanded={open} ariaLabel={tUi("Референс из Library")} onClick={() => setOpen(true)} /> :
      <button type="button" className={styles.trigger} disabled={disabled || !workspaceId || !remaining}
        aria-label={tUi("Референс из Library")} title={tUi("Референс из Library")} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><LibraryBig size={16} />{variant === 'inline' ? tUi("Из Library") : null}</button>}
    {open ? <HomeLibraryReferenceDialog key={workspaceId} workspaceId={workspaceId} maxSelection={remaining} onChoose={onChoose} onClose={() => setOpen(false)} /> : null}
  </>;
}

export function HomeLibraryReferenceDialog({ workspaceId, onChoose, onClose, maxSelection = 3 }: {
  workspaceId: string; onChoose: (files: File[]) => Promise<void>; onClose: () => void; maxSelection?: number;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<HomeLibraryReference[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<HomeLibraryReference[]>([]);
  const [addingLimit, setAddingLimit] = useState<number | null>(null);
  const adding = addingLimit !== null;
  const limit = addingLimit ?? Math.max(0, Math.min(3, maxSelection));
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const listController = useRef<AbortController | null>(null);
  const contentController = useRef<AbortController | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { contentController.current?.abort(); element?.close(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true); setLoadingMore(false); setError(''); setItems([]); setCursor(null);
    const timer = setTimeout(() => {
      void loadHomeLibraryReferences(workspaceId, query, controller.signal)
        .then((result) => { if (!controller.signal.aborted) { setItems(result.items); setCursor(result.nextCursor); } })
        .catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить Library. Проверьте подключение и повторите попытку.")); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [workspaceId, query, attempt]);

  const loadMore = async () => {
    const controller = listController.current;
    if (!cursor || loadingMore || !controller || controller.signal.aborted) return;
    setLoadingMore(true); setError('');
    try {
      const result = await loadHomeLibraryReferences(workspaceId, query, controller.signal, cursor);
      if (!controller.signal.aborted) {
        setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
        setCursor(result.nextCursor);
      }
    } catch { if (!controller.signal.aborted) setError(tUi("Не удалось загрузить следующую страницу. Нажмите «Показать ещё».")); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  };
  const choose = async () => {
    if (contentController.current || !selected.length || selected.length > limit) return;
    const controller = new AbortController();
    contentController.current = controller;
    setAddingLimit(limit); setError('');
    try {
      await commitHomeLibrarySelection(selected, limit, controller.signal, onChoose);
      if (!controller.signal.aborted) onClose();
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error && /8 МБ|недоступно|формат|пустым/.test(caught.message)
        ? caught.message : tUi("Не удалось прикрепить референсы. Проверьте соединение и попробуйте снова."));
    } finally { controller.abort(); contentController.current = null; setAddingLimit(null); }
  };
  const close = () => { if (!contentController.current) onClose(); };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.panel}>
      <header><div><h2 id={titleId}>{tUi("Референсы из Library")}</h2><p id={descriptionId}>{tUi("Можно добавить:")}{' '} {limit}</p></div>
        <button type="button" className={styles.close} aria-label={tUi("Закрыть выбор референса")} disabled={adding} onClick={close}><X size={18} /></button></header>
      <div className={styles.content}>
      <label className={styles.search}><Search size={16} />
        <input autoFocus type="search" aria-label={tUi("Поиск изображений в Library")} placeholder={tUi("Найти изображение")} value={query}
          disabled={adding} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.results} aria-busy={loading || adding}>
        {loading ? <p className={styles.state} role="status">{tUi("Загружаем изображения…")}</p> : <>
          <div className={styles.grid}>{items.map((item) => {
            const tooLarge = isHomeReferenceTooLarge(item);
            const chosen = selected.some((value) => value.id === item.id);
            return <button type="button" className={styles.card} key={item.id} aria-pressed={chosen}
              disabled={adding || tooLarge || (!chosen && selected.length >= limit)}
              aria-label={`${item.originalName}${tooLarge ? tUi(", больше 8 МБ") : ''}`}
              onClick={() => setSelected((current) => toggleHomeLibrarySelection(current, item, limit))}>
              <span className={styles.preview}><img src={`/api/assets/${encodeURIComponent(item.id)}/content?variant=thumbnail`} alt="" loading="lazy" draggable={false} />
                <span className={styles.selectIcon} aria-hidden="true">{chosen ? <Check size={16} /> : null}</span></span>
              {tooLarge ? <small>{tUi("Больше 8 МБ")}</small> : null}
            </button>;
          })}</div>
          {!items.length && !error ? <p className={styles.state}>{query ? tUi("Изображения не найдены. Измените запрос.") : tUi("В Library пока нет изображений. Можно загрузить референс с устройства.")}</p> : null}
        </>}
      </div>
      {error ? <div className={styles.error} role="alert"><p>{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p>{!items.length ? <button type="button" onClick={() => setAttempt((value) => value + 1)}>{tUi("Повторить")}</button> : null}</div> : null}
      {cursor && !loading ? <button type="button" className={styles.more} disabled={loadingMore || adding}
        onClick={() => void loadMore()}>{loadingMore ? tUi("Загружаем…") : tUi("Показать ещё")}</button> : null}
      </div>
      <footer className={styles.footer}><span role="status">{tUi("Выбрано:")}{' '} {selected.length}  {' '}{tUi("из")}{' '} {limit}</span>
        <button type="button" className={styles.add} disabled={adding || !selected.length || selected.length > limit} onClick={() => void choose()}>
          {adding ? <><LoaderCircle size={16} className={styles.spinner} />{tUi("Добавляем…")}</> : <>{tUi("Добавить")}{selected.length ? ` · ${selected.length}` : ''}</>}</button>
      </footer>
    </div>
  </dialog>;
}
