'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from '@prodactionpro/ui-core/icons';
import { SectionHelpButton } from '@/shared/ui/section-help';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { newTimelineDocument } from '@/pages/stories/model/new-document';
import { TimelineEditorPage } from '@/pages/stories/ui/timeline-editor-page';
import styles from './production-create.module.css';

const presets = [
  { id: 'promo', title: 'Промо-ролик на основе трека', detail: 'Музыка задаёт ритм, ваши видео — историю', image: '/home/timeline-promo-glass.webp' },
  { id: 'empty', title: 'Новый пустой таймлайн', detail: 'Чистый монтаж: добавляйте кадры и звук', image: '/home/timeline-empty-glass.webp' },
] as const;

export function TimelineCreation({ workspaceId }: { workspaceId: string }) {
  const tUi = useTranslations();
  const ui_presets = useUiCatalog(presets, tUi);
  const params = useSearchParams();
  const documentId = params?.get('document');
  const [resumeDraft] = useState(Boolean(params?.get('draft')));
  const [draft, setDraft] = useState<TimelineDocument | undefined>(() => {
    if (documentId || !['empty', 'promo'].includes(params?.get('preset') ?? '')) return undefined;
    const value = newTimelineDocument(workspaceId, params?.get('folderId') ?? null, params?.get('storyboardId') ?? null, params?.get('preset') === 'promo');
    const id = params?.get('draft');
    return id && /^[0-9a-f-]{36}$/i.test(id) ? { ...value, id } : value;
  });
  if (documentId || draft) return <TimelineEditorPage key={documentId ?? draft!.id} id={documentId ?? draft!.id} initial={!documentId || draft?.id === documentId ? draft : undefined} resumeDraft={resumeDraft} />;
  return <div className={`production-home ${styles.page}`}>
    <header className="production-home-header"><div className="home-screen-heading"><Link className="home-screen-back" href="/" aria-label={tUi("Вернуться на Home")}><ArrowLeft size={18} /></Link><h1>{tUi("Создание Timeline")}</h1></div><div className="home-header-actions"><SectionHelpButton /><Link className="home-library-link" href="/library">{tUi("Моя библиотека")}</Link></div></header>
    <fieldset className={styles.body}><div className={styles.settings}>
      <h2>{tUi("С чего начнём монтаж?")}</h2><p>{tUi("Выберите основу. Материалы, музыка и помощник будут рядом в редакторе.")}</p>
      <div className={styles.timelinePresets} aria-label={tUi("Шаблоны таймлайна")}>{ui_presets.map((item) => <button className="production-start-card" key={item.id} type="button" onClick={() => { const next = newTimelineDocument(workspaceId, params?.get('folderId') ?? null, params?.get('storyboardId') ?? null, item.id === 'promo'); const url = new URL(window.location.href); url.searchParams.set('preset', item.id); url.searchParams.set('draft', next.id); window.history.replaceState(null, '', `${url.pathname}${url.search}`); setDraft(next); }}>
        <span className="production-start-visual"><img src={item.image} width={640} height={640} alt="" draggable={false} /></span><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
    </div></fieldset>
  </div>;
}
