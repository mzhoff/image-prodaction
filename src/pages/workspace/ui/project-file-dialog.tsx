'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkspaceProject, updateWorkspaceProject } from '@/entities/workspace/api/workspace-api';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { loadStories, loadStory, saveStory } from '@/pages/stories/model/story-api';
import { loadTimelines, loadTimeline, saveTimeline } from '@/pages/stories/model/timeline-api';
import { creationUrl } from '@/pages/create/model/create-draft';
import { BrandSelect } from '@/shared/ui/brand-select';
import { useWorkspaceShell } from './workspace-shell-context';
import styles from './project-container.module.css';

export function ProjectFileDialog({ folderId, mode, onClose, onChanged }: {
  folderId: string; mode: 'flow' | 'story' | 'timeline' | 'existing'; onClose: () => void; onChanged: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    if (mode === 'existing') return;
    router.push(creationUrl(mode === 'story' ? 'storyboard' : mode, { folderId }));
    onClose();
  }, [folderId, mode, onClose, router]);
  return mode === 'existing' ? <ProjectOtherFileDialog folderId={folderId} mode={mode} onClose={onClose} onChanged={onChanged} /> : null;
}

function ProjectOtherFileDialog({ folderId, mode, onClose, onChanged }: { folderId: string; mode: 'flow' | 'existing'; onClose: () => void; onChanged: () => void }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const workspace = useWorkspaceShell(); const workspaceId = workspace.activeWorkspace!.id; const router = useRouter(); const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState('');
  const [stories, setStories] = useState<StorySummary[]>([]); const [timelines, setTimelines] = useState<TimelineSummary[]>([]); const [loading, setLoading] = useState(mode === 'existing');
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (mode !== 'existing') return; const controller = new AbortController();
    Promise.all([loadStories(workspaceId, controller.signal), loadTimelines(workspaceId, controller.signal)]).then(([a, b]) => { if (!controller.signal.aborted) { setStories(a.stories); setTimelines(b.timelines); } }).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить документы Stories.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort();
  }, [mode, workspaceId]);
  const flows = workspace.projects.filter((item) => item.workspaceId === workspaceId && item.folderId !== folderId && item.status === 'active');
  const availableStories = stories.filter((item) => item.folderId !== folderId); const availableTimelines = timelines.filter((item) => item.folderId !== folderId);
  const options = [...flows.map((item) => ({ value: `flow:${item.id}`, label: item.name, description: 'Flow' })), ...availableStories.map((item) => ({ value: `story:${item.id}`, label: item.name, description: 'Storyboard' })), ...availableTimelines.map((item) => ({ value: `timeline:${item.id}`, label: item.name, description: 'Timeline' }))];
  return <dialog ref={dialog} className={`${styles.dialog} story-dialog`} aria-labelledby="project-file-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}><form onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { if (mode === 'flow') { const flow = await createWorkspaceProject(workspaceId, name.trim(), folderId); await workspace.refresh(); router.push(`/projects/${flow.id}`); }
      else { const [kind, id] = selected.split(':'); if (kind === 'flow' && flows.some((item) => item.id === id)) await updateWorkspaceProject(id, { folderId });
        else if (kind === 'story' && availableStories.some((item) => item.id === id)) { const { story } = await loadStory(id, new AbortController().signal); await saveStory(id, story.revision, { name: story.name, folderId, snapshot: story.snapshot }); }
        else if (kind === 'timeline' && availableTimelines.some((item) => item.id === id)) { const { timeline } = await loadTimeline(id, new AbortController().signal); await saveTimeline(id, timeline.revision, { name: timeline.name, folderId, storyboardId: timeline.storyboardId, snapshot: timeline.snapshot }); }
        else throw Error(tUi("Выберите доступный файл.")); await workspace.refresh(); onChanged(); }
      onClose();
    } catch { setError(tUi("Не удалось сохранить файл. Проверьте подключение и повторите попытку.")); } finally { setBusy(false); }
  }}><h2 id="project-file-dialog-title">{mode === 'existing' ? tUi("Добавить файл в проект") : tUi("Создать Flow")}</h2>
    {mode === 'existing' ? <><p>{tUi("Выбранный документ переместится в этот проект.")}</p><BrandSelect label={tUi("Файл")} value={selected} disabled={busy} options={options} onChange={setSelected} />{loading ? <p role="status">{tUi("Загружаем документы…")}</p> : !options.length ? <p>{tUi("Нет других файлов в этом Workspace.")}</p> : null}</> : <label>{tUi("Название")}<input autoFocus required maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder={tUi("Название файла")} /></label>}
    {error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}<footer><button type="button" onClick={onClose} disabled={busy}>{tUi("Отмена")}</button><button type="submit" disabled={busy || (mode === 'existing' ? !selected : !name.trim())}>{busy ? tUi("Сохраняем…") : mode === 'existing' ? tUi("Переместить") : tUi("Создать")}</button></footer></form></dialog>;
}
