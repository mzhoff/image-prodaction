'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useRef, useState } from 'react';
import type { StoryMedia } from '@/modules/story-projects/contracts/story-project';
import { loadStoryMedia } from '../model/story-api';

export function StoryMediaBrowser({ workspaceId, kind, onSelect }: { workspaceId: string; kind?: 'image' | 'video'; onSelect: (asset: StoryMedia) => void }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [items, setItems] = useState<StoryMedia[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(true); const [query, setQuery] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    loadStoryMedia(workspaceId, abort.signal).then((result) => { if (!abort.signal.aborted) { setItems(result.items); setCursor(result.nextCursor); } })
      .catch((caught) => { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось загрузить медиа.")); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [workspaceId]);
  async function more() {
    if (!controller.current || busy) return;
    setBusy(true); setError('');
    try { const result = await loadStoryMedia(workspaceId, controller.current.signal, cursor ?? undefined);
      if (!controller.current.signal.aborted) { setItems((current) => cursor ? [...current, ...result.items] : result.items); setCursor(result.nextCursor); }
    } catch (caught) { if (!controller.current.signal.aborted) setError(caught instanceof Error ? caught.message : tUi("Не удалось загрузить медиа.")); }
    finally { if (!controller.current.signal.aborted) setBusy(false); }
  }
  const visible = items.filter((item) => (item.mediaKind === 'image' || item.mediaKind === 'video') && (!kind || item.mediaKind === kind) && item.originalName.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="story-media-browser"><input type="search" aria-label={tUi("Поиск в загруженных медиа")} placeholder={tUi("Найти среди загруженных")} value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="story-media-grid">{visible.map((item) => <button type="button" className="story-media-item" key={item.id} onClick={() => onSelect(item)}>
      {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" draggable={false} /> : null}<span>{item.originalName}</span><small>{item.mediaKind === 'video' ? tUi("Видео") : tUi("Изображение")}</small></button>)}</div>
    {!busy && !error && !visible.length ? <p>{tUi("Подходящих материалов пока нет. Добавьте их в Library.")}</p> : null}
    {busy ? <p role="status">{tUi("Загружаем медиа…")}</p> : null}
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)} <button type="button" onClick={more}>{tUi("Повторить")}</button></p> : null}
    {cursor ? <button type="button" onClick={more} disabled={busy}>{tUi("Показать ещё")}</button> : null}
  </div>;
}
export function StoryMediaDialog({ workspaceId, kind, onSelect, onClose }: { workspaceId: string; kind: 'image' | 'video'; onSelect: (asset: StoryMedia) => void; onClose: () => void }) {
  const tUi = useTranslations();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog className="story-dialog story-media-dialog" ref={dialog} aria-label={tUi("Выбор материала")} onCancel={onClose} onClose={onClose}>
    <div className="story-heading"><h2>{kind === 'image' ? tUi("Изображения") : tUi("Видео")}  {' '}{tUi("из Library")}</h2><button type="button" aria-label={tUi("Закрыть")} onClick={onClose}>×</button></div>
    <StoryMediaBrowser workspaceId={workspaceId} kind={kind} onSelect={onSelect} />
  </dialog>;
}
