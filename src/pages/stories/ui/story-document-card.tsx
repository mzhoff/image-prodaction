'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Film, MoreHorizontal, PanelsTopLeft, Pencil } from '@prodactionpro/ui-core/icons';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { BrandSelect } from '@/shared/ui/brand-select';
import { ContextMenu } from '@/shared/ui/context-menu';
import { useContextMenu } from '@/shared/ui/use-context-menu';
import { createStory, downloadStory, loadStory, saveStory } from '../model/story-api';
import { createTimeline, downloadTimeline, loadTimeline, saveTimeline } from '../model/timeline-api';

export function StoryDocumentCard({ document, kind, onChanged }: { document: StorySummary | TimelineSummary; kind: 'storyboard' | 'timeline'; onChanged: () => void }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const router = useRouter(); const menu = useContextMenu(); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const href = kind === 'timeline' ? `/stories/timelines/${document.id}` : `/stories/${document.id}?view=blueprint`;
  const run = async (action: 'duplicate' | 'download') => { if (busy) return; setBusy(true); setError('');
    try {
      if (kind === 'storyboard') { const { story } = await loadStory(document.id, new AbortController().signal);
        if (action === 'download') downloadStory(story); else { const result = await createStory(story.workspaceId, { name: `${story.name.slice(0, 108)} · Копия`, folderId: story.folderId, snapshot: story.snapshot }); router.push(`/stories/${result.story.id}?view=blueprint`); }
      } else { const { timeline } = await loadTimeline(document.id, new AbortController().signal);
        if (action === 'download') downloadTimeline(timeline); else { const result = await createTimeline(timeline.workspaceId, { name: `${timeline.name.slice(0, 108)} · Копия`, folderId: timeline.folderId, storyboardId: timeline.storyboardId, snapshot: timeline.snapshot }); router.push(`/stories/timelines/${result.timeline.id}`); }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось выполнить действие.")); } finally { setBusy(false); }
  };
  const actions = [{ id: 'open', label: tUi("Открыть"), onSelect: () => router.push(href) },
    { id: 'edit', label: tUi("Переименовать или переместить"), icon: <Pencil size={14} />, onSelect: () => setEdit(true) },
    { id: 'duplicate', label: tUi("Создать копию"), icon: <Copy size={14} />, disabled: busy, onSelect: () => void run('duplicate') },
    { id: 'download', label: tUi("Скачать JSON"), icon: <Download size={14} />, disabled: busy, onSelect: () => void run('download') }];
  return <article className="workspace-project-card story-file-card" onContextMenu={(event) => menu.openContextMenu(event, actions)} onKeyDown={(event) => { if (event.key === 'Escape') menu.closeContextMenu(); }}>
    <div className={`workspace-project-preview story-file-preview story-file-${kind}`}><Link href={href} aria-label={tUi("Открыть {p1}", { p1: document.name })} draggable={false}><img src="/stories/story-atmosphere.webp" alt="" loading="lazy" draggable={false} /><span className="story-file-illustration">{kind === 'timeline' ? <Film size={38} strokeWidth={1.1} /> : <PanelsTopLeft size={38} strokeWidth={1.1} />}</span><span className="story-file-kind">{kind === 'timeline' ? 'Timeline' : 'Storyboard'}</span>{kind === 'timeline' ? <span className="story-file-tracks" aria-hidden="true"><i /><i /><i /></span> : <span className="story-file-frames" aria-hidden="true"><i /><i /><i /></span>}</Link>
      <button className="story-file-menu" type="button" aria-label={tUi("Действия: {p1}", { p1: document.name })} disabled={busy} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); menu.openContextMenuAt(rect.right - 220, rect.bottom + 6, actions, 220); }}><MoreHorizontal size={18} /></button></div>
    <div className="story-file-identity"><Link href={href}>{document.name}</Link><time dateTime={document.updatedAt}>{new Date(document.updatedAt).toLocaleDateString(language, { day: 'numeric', month: 'short' })}</time></div>
    {error ? <p role="alert" className="story-error">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}<ContextMenu menu={menu.menu} onClose={menu.closeContextMenu} />
    {edit ? <StoryDocumentDetails document={document} kind={kind} onClose={() => setEdit(false)} onChanged={onChanged} /> : null}</article>;
}
function StoryDocumentDetails({ document, kind, onClose, onChanged }: { document: StorySummary; kind: 'storyboard' | 'timeline'; onClose: () => void; onChanged: () => void }) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell(); const ref = useRef<HTMLDialogElement>(null); const [name, setName] = useState(document.name); const [folderId, setFolderId] = useState(document.folderId ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="story-dialog" aria-labelledby={`details-${document.id}`} onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}><form onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { if (kind === 'storyboard') { const { story } = await loadStory(document.id, new AbortController().signal); await saveStory(document.id, document.revision, { name, folderId: folderId || null, snapshot: story.snapshot }); }
      else { const { timeline } = await loadTimeline(document.id, new AbortController().signal); await saveTimeline(document.id, document.revision, { name, folderId: folderId || null, storyboardId: timeline.storyboardId, snapshot: timeline.snapshot }); }
      onChanged(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось сохранить.")); } finally { setBusy(false); }
  }}><h2 id={`details-${document.id}`}>{tUi("Детали документа")}</h2><fieldset className="story-fields" disabled={busy}><label>{tUi("Название")}<input autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><BrandSelect label={tUi("Папка проекта")} value={folderId} options={[{ value: '', label: tUi("Без папки") }, ...workspace.folders.filter((folder) => folder.workspaceId === document.workspaceId).map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={setFolderId} /></fieldset>{error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}<footer><button type="button" disabled={busy} onClick={onClose}>{tUi("Отмена")}</button><button className="story-primary" disabled={busy || !name.trim()}>{tUi("Сохранить")}</button></footer></form></dialog>;
}
