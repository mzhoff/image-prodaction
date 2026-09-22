'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useEffectEvent, useEffect, useState } from 'react';
import { ArrowLeft, Film, SlidersHorizontal } from '@prodactionpro/ui-core/icons';
import { SectionHelpButton } from '@/shared/ui/section-help';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { BrandSelect } from '@/shared/ui/brand-select';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useDocumentReturnHref } from '@/pages/workspace/ui/document-navigation';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import { useTimelineEditor } from '../model/use-timeline-editor';
import { useMontageJob } from '../model/use-montage-job';
import { TimelineExportMenu } from './timeline-export-menu';
import { loadStories } from '../model/story-api';
import { RatioChoices } from './story-settings';
import { StoryTimeline } from './story-timeline';
import styles from './timeline-editor.module.css';

export function TimelineEditorPage({ id, initial, resumeDraft }: { id: string; initial?: TimelineDocument; resumeDraft?: boolean }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const editor = useTimelineEditor(id, initial, resumeDraft), workspace = useWorkspaceShell(), returnHref = useDocumentReturnHref();
  const { draft } = editor;
  const jobs = useMontageJob(id);
  const [working, setWorking] = useState(false), [settingsOpen, setSettingsOpen] = useState(false);
  const [stories, setStories] = useState<StorySummary[]>([]), [linkError, setLinkError] = useState('');
  const workspaceId = draft?.workspaceId, selectWorkspace = workspace.selectWorkspace;
  useEffect(() => { if (workspaceId) selectWorkspace(workspaceId); }, [workspaceId, selectWorkspace]);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    loadStories(workspaceId, controller.signal).then((result) => setStories(result.stories)).catch(() => {
      if (!controller.signal.aborted) setLinkError(tEffect("Не удалось загрузить раскадровки."));
    });
    return () => controller.abort();
  }, [workspaceId]);
  if (!draft) return <div className={styles.loading}><Link href={returnHref}>{tUi("← Назад")}</Link>{editor.error ? <p role="alert">{typeof (editor.error) === 'string' ? tUi((editor.error) as string) : (editor.error)}<button onClick={editor.reload}>{tUi("Повторить")}</button></p> : <p role="status">{tUi("Открываем монтаж…")}</p>}</div>;
  const busy = working;
  const folder = workspace.folders.find((item) => item.id === draft.folderId);
  return <div className={styles.editor} aria-label={tUi("Редактор Timeline")}>
    <header className={styles.header}>
      <ProTooltip label={tUi("Вернуться к предыдущему экрану")}><Link className={styles.back} href={returnHref} aria-label={tUi("Назад из таймлайна")}><ArrowLeft size={19} /></Link></ProTooltip>
      <span className={styles.documentIcon}><Film size={19} /></span>
      <div className={styles.identity}><input aria-label={tUi("Название монтажа")} maxLength={120} value={draft.name} disabled={busy} onChange={(event) => editor.edit({ ...draft, name: event.target.value })} />
        <div><span>Timeline</span>{folder ? <span className={styles.folder}>{folder.name}</span> : null}<span className={styles.status} data-dirty={editor.dirty} role="status" aria-label={tUi("Состояние сохранения")}>{working ? tUi("Подготавливаем…") : editor.conflict ? tUi("Конфликт версий") : editor.saving ? tUi("Синхронизируем…") : editor.dirty ? editor.localError ? tUi("Не сохранено") : tUi("Сохранено локально") : editor.isNew ? tUi("Новый монтаж") : tUi("Сохранено")}</span></div>
      </div>
      <div className={styles.actions}>
        <ProTooltip label={tUi("Настройки монтажа")}><button disabled={busy} onClick={() => setSettingsOpen(!settingsOpen)} aria-label={tUi("Настройки монтажа")} aria-expanded={settingsOpen} aria-controls="timeline-document-settings"><SlidersHorizontal size={17} /></button></ProTooltip>
        <SectionHelpButton />
        <TimelineExportMenu timeline={draft} dirty={editor.dirty} disabled={busy || editor.conflict} jobs={jobs} flush={editor.flush} />
      </div>
    </header>
    {editor.error || (editor.localError && editor.dirty) ? <div className={styles.error} role="alert">{typeof (editor.localError || editor.error) === 'string' ? tUi((editor.localError || editor.error) as string) : (editor.localError || editor.error)}{editor.conflict ? <><button disabled={editor.saving} onClick={() => editor.resolveConflict('local')}>{tUi("Сохранить мою версию")}</button><button disabled={editor.saving} onClick={() => editor.resolveConflict('server')}>{tUi("Использовать серверную")}</button></> : <button disabled={editor.saving} onClick={editor.retry}>{tUi("Повторить синхронизацию")}</button>}</div> : null}
    {settingsOpen ? <fieldset id="timeline-document-settings" disabled={busy} className={styles.settings}>
      <div><span className={styles.label}>{tUi("Формат кадра")}</span><RatioChoices value={draft.snapshot.aspectRatio} onChange={(aspectRatio) => editor.edit({ ...draft, snapshot: { ...draft.snapshot, aspectRatio } })} /></div>
      <BrandSelect label={tUi("Частота кадров")} value={String(draft.snapshot.frameRate ?? 30)} options={[24, 25, 30, 50, 60].map((fps) => ({ value: String(fps), label: `${fps} fps` }))} onChange={(fps) => editor.edit({ ...draft, snapshot: { ...draft.snapshot, frameRate: Number(fps) as 24 | 25 | 30 | 50 | 60 } })} />
      <BrandSelect label={tUi("Раскадровка")} value={draft.storyboardId ?? ''} options={[{ value: '', label: tUi("Самостоятельный монтаж") }, ...stories.map((story) => ({ value: story.id, label: story.name }))]} onChange={(storyboardId) => editor.edit({ ...draft, storyboardId: storyboardId || null, snapshot: { ...draft.snapshot, clips: draft.snapshot.clips.map((clip) => ({ ...clip, shotId: null })) } })} />
      <BrandSelect label={tUi("Папка проекта")} value={draft.folderId ?? ''} options={[{ value: '', label: tUi("Без папки") }, ...workspace.folders.filter((item) => item.workspaceId === workspaceId).map((item) => ({ value: item.id, label: item.name }))]} onChange={(folderId) => editor.edit({ ...draft, folderId: folderId || null })} />
      <div className={styles.settingsLinks}>{draft.storyboardId ? <Link href={`/stories/${draft.storyboardId}?view=blueprint`}>{tUi("Открыть раскадровку ↗")}</Link> : null}</div>
      {linkError ? <p role="alert">{typeof (linkError) === 'string' ? tUi((linkError) as string) : (linkError)}</p> : null}
    </fieldset> : null}
    <fieldset className={styles.content} disabled={busy}><StoryTimeline isNew={editor.isNew} ensurePersisted={editor.ensurePersisted} history={{ canUndo: editor.canUndo, canRedo: editor.canRedo, undo: editor.undo, redo: editor.redo }} jobs={jobs} key={draft.id} dirty={editor.dirty} disabled={busy} commit={editor.commitSnapshot} accept={editor.accept} timeline={draft} onBusy={setWorking} onChange={(snapshot) => editor.edit({ ...draft, snapshot })} /></fieldset>
  </div>;
}
