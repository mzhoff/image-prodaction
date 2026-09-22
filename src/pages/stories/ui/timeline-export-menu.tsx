'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Download, FileJson, Film, LoaderCircle } from '@prodactionpro/ui-core/icons';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { exportTimelineOtio } from '@/modules/story-projects/core/timeline-otio';
import { createUuidV7 } from '@/shared/lib/id';
import { downloadTimeline } from '../model/timeline-api';
import type { useMontageJob } from '../model/use-montage-job';
import styles from './timeline-export-menu.module.css';

export function TimelineExportMenu({ timeline, dirty, disabled, jobs, flush }: {
  timeline: TimelineDocument; dirty: boolean; disabled: boolean;
  jobs: ReturnType<typeof useMontageJob>; flush(): Promise<TimelineDocument>;
}) {
  const tUi = useTranslations();
  const [position, setPosition] = useState<{ right: number; top: number } | null>(null);
  const [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), running = useRef(false);
  const id = useId();
  function close() { setPosition(null); trigger.current?.focus(); }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setPosition(null); trigger.current?.focus(); } };
    const resize = () => setPosition(null);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', resize); };
  }, [position]);
  async function mp4() {
    if (running.current || jobs.busy) return;
    close(); running.current = true; setPreparing(true); setError('');
    try {
      const saved = await flush();
      setPreparing(false);
      await jobs.run({ action: 'render', expectedRevision: saved.revision, idempotencyKey: createUuidV7() }, '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось начать экспорт.")); }
    finally { running.current = false; setPreparing(false); }
  }
  function otio() {
    close(); setError('');
    try {
      const data = exportTimelineOtio(timeline.name, timeline.snapshot);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `timeline-${timeline.id}.otio`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось экспортировать секвенцию.")); }
  }
  const download = jobs.render?.job.status === 'succeeded' ? jobs.render.downloadUrl : null;
  const stale = jobs.render?.revision !== timeline.revision || dirty;
  return <div className={styles.root}>
    <button ref={trigger} className={styles.trigger} type="button" aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={id}
      onClick={() => { if (position) { close(); return; } const rect = trigger.current!.getBoundingClientRect(); setPosition({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) }); }}>
      {preparing || jobs.busy ? <LoaderCircle size={16} className="home-generation-spinner" /> : download && !stale ? <Check size={16} /> : <Download size={16} />}<span>{tUi("Экспортировать")}</span><ChevronDown size={14} />
    </button>
    {position ? createPortal(<div ref={menu} id={id} className={styles.menu} role="menu" aria-label={tUi("Экспорт монтажа")} style={position} onKeyDown={(event) => {
      const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
      if (event.key === 'Tab') close();
    }}>
      <span className={styles.heading}>{tUi("Готовое видео")}</span>
      <button role="menuitem" disabled={disabled || preparing || jobs.busy || !timeline.snapshot.clips.length} onClick={() => void mp4()}><Film size={17} /><span>{tUi("Экспортировать в MP4")}<small>{preparing ? tUi("Синхронизируем правки…") : jobs.busy ? jobs.status : tUi("Видео со звуком")}</small></span></button>
      {download ? <a role="menuitem" href={download} download onClick={close}><Download size={17} /><span>{tUi("Скачать MP4")}<small>{stale ? tUi("Предыдущая версия монтажа") : tUi("Экспорт готов")}</small></span></a> : null}
      <span className={styles.heading}>{tUi("Редактируемая последовательность")}</span>
      <button role="menuitem" onClick={otio}><FileJson size={17} /><span>{tUi("Экспортировать секвенцию")}<small>{tUi("OpenTimelineIO · .otio · без исходников")}</small></span></button>
      {['CapCut', 'Premiere Pro', 'DaVinci Resolve'].map((name) => <button key={name} role="menuitem" disabled><span className={styles.icon} /><span>{tUi("Экспортировать в")}{' '} {name}<small>{tUi("Формат пока недоступен")}</small></span></button>)}
      <button role="menuitem" onClick={() => { close(); downloadTimeline(timeline); }}><FileJson size={17} /><span>{tUi("Скачать резервную копию")}<small>{tUi("Текущая локальная версия · JSON")}</small></span></button>
    </div>, document.body) : null}
    <span className={styles.announcement} role="status">{preparing ? tUi("Синхронизируем перед экспортом…") : jobs.busy ? jobs.status : download && !stale ? tUi("MP4 готов. Скачать можно в меню «Экспортировать».") : ''}</span>
    {error ? <div className={styles.error} role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}<button type="button" aria-label={tUi("Скрыть ошибку экспорта")} onClick={() => setError('')}>×</button></div> : null}
  </div>;
}
