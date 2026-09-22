'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, useState } from 'react';
import { Film, X } from '@prodactionpro/ui-core/icons';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { BrandSelect } from '@/shared/ui/brand-select';
import { emptyTimeline, type TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import { createTimeline } from '../model/timeline-api';
import { RatioChoices } from './story-settings';
export function TimelineCreateDialog({ workspaceId, folders, stories, initialFolderId = null, initialStoryboardId = null, onClose, onCreated }: {
  workspaceId: string; folders: StudioFolder[]; stories: StorySummary[]; initialFolderId?: string | null; initialStoryboardId?: string | null;
  onClose: () => void; onCreated: (timeline: TimelineDocument) => void;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null); const [name, setName] = useState('');
  const [folderId, setFolderId] = useState(initialFolderId ?? ''); const [storyboardId, setStoryboardId] = useState(initialStoryboardId ?? '');
  const [ratio, setRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="story-dialog story-timeline-create" aria-labelledby="timeline-create-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <form onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError('');
      try { const { timeline } = await createTimeline(workspaceId, { name: name.trim() || 'Новый монтаж', folderId: folderId || null, storyboardId: storyboardId || null, snapshot: emptyTimeline(ratio) }); onCreated(timeline); }
      catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось создать монтаж.")); } finally { setBusy(false); }
    }}><header className="story-heading"><div><span className="story-eyebrow">TIMELINE</span><h2 id="timeline-create-title">{tUi("Соберём вашу историю")}</h2></div><button type="button" aria-label={tUi("Закрыть")} onClick={onClose} disabled={busy}><X size={18} /></button></header>
      <div className="story-timeline-create-art"><img src="/stories/story-atmosphere.webp" alt="" draggable={false} /><Film size={32} strokeWidth={1.2} /></div>
      <fieldset disabled={busy} className="story-fields"><input autoFocus aria-label={tUi("Название монтажа")} placeholder={tUi("Название монтажа")} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <RatioChoices value={ratio} onChange={setRatio} /><BrandSelect label={tUi("Раскадровка")} value={storyboardId} options={[{ value: '', label: tUi("Самостоятельный монтаж"), description: tUi("Начните с любых материалов") }, ...stories.map((story) => ({ value: story.id, label: story.name }))]} onChange={setStoryboardId} />
        <BrandSelect label={tUi("Папка проекта")} value={folderId} options={[{ value: '', label: tUi("Без папки") }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={setFolderId} /></fieldset>
      {error ? <p role="alert" className="story-error">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}<footer><button className="story-primary" disabled={busy}>{busy ? tUi("Создаём…") : tUi("Создать Timeline")}</button></footer>
    </form></dialog>;
}
