'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { SectionHelpButton } from '@/shared/ui/section-help';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useDocumentReturnHref } from '@/pages/workspace/ui/document-navigation';
import { useStoryEditor } from '../model/use-story-editor';
import { downloadStory } from '../model/story-api';
import { StoryBlueprint } from './story-blueprint';
import { StoryBoard } from './story-board';
import { StoryLinkedTimelines } from './story-linked-timelines';

export function StoryEditorPage({ id }: { id: string }) {
  const tUi = useTranslations();
  const returnHref = useDocumentReturnHref();
  const [assistantBusy, setAssistantBusy] = useState(false);
  const editor = useStoryEditor(id); const workspace = useWorkspaceShell();
  const params = useSearchParams(); const view = params?.get('view') ?? 'storyboard';
  const { draft } = editor;
  const selectWorkspace = workspace.selectWorkspace;
  useEffect(() => { if (draft) selectWorkspace(draft.workspaceId); }, [draft?.workspaceId, selectWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!draft) return <div className="stories-page"><Link href={returnHref}>{tUi("← Назад")}</Link>{editor.error ? <p role="alert">{typeof (editor.error) === 'string' ? tUi((editor.error) as string) : (editor.error)} <button onClick={editor.reload}>{tUi("Повторить")}</button></p> : <p role="status">{tUi("Открываем историю…")}</p>}</div>;
  const busy = editor.saving || assistantBusy;
  const changeSnapshot = (snapshot: typeof draft.snapshot) => editor.edit({ ...draft, snapshot });
  return <div className="story-editor">
    <header className="story-editor-header"><Link href={returnHref}>{tUi("← Назад")}</Link><input aria-label={tUi("Название истории")} maxLength={120} value={draft.name} disabled={busy} onChange={(e) => editor.edit({ ...draft, name: e.target.value })} /><span className="story-ratio">{draft.snapshot.settings.aspectRatio}</span>
      <div className="story-editor-actions"><SectionHelpButton /><button type="button" disabled={!editor.canUndo || busy} onClick={editor.undo} title={tUi("Отменить изменение")}>↶</button><button type="button" disabled={!editor.canRedo || busy} onClick={editor.redo} title={tUi("Повторить изменение")}>↷</button><button type="button" onClick={() => downloadStory(draft)}>{tUi("Скачать JSON")}</button><button className="story-primary" type="button" disabled={!editor.dirty || busy} onClick={editor.save}>{editor.saving ? tUi("Сохраняем…") : tUi("Сохранить")}</button></div>
    </header>
    <nav className="story-view-tabs" aria-label={tUi("Представления истории")}>{[['blueprint', 'Blueprint'], ['characters', tUi("Герои")], ['storyboard', tUi("Раскадровка")], ['timeline', tUi("Связанные монтажи")]].map(([key, title]) => busy ? <span key={key}>{title}</span> : <Link key={key} aria-current={view === key ? 'page' : undefined} href={`/stories/${id}${key === 'storyboard' ? '' : `?view=${key}`}`} scroll={false}>{title}</Link>)}<span role="status">{editor.dirty ? tUi("Есть несохранённые изменения") : tUi("Сохранено")}</span></nav>
    {editor.error ? <div className="story-error" role="alert">{typeof (editor.error) === 'string' ? tUi((editor.error) as string) : (editor.error)} <button type="button" onClick={editor.reload}>{tUi("Открыть сохранённую версию")}</button></div> : null}
    <fieldset className="story-editor-content" disabled={editor.saving}>{view === 'blueprint' || view === 'characters' ? <StoryBlueprint editor={editor} initialView={view} dirty={editor.dirty} story={draft} folders={workspace.folders.filter((folder) => folder.workspaceId === draft.workspaceId)} onChange={(next) => { if (!assistantBusy) editor.edit(next); }} onBlueprintSaved={editor.refreshFromAssistant} onBusyChange={setAssistantBusy} /> : view === 'timeline' ? <StoryLinkedTimelines story={draft} /> : <StoryBoard story={draft} onChange={changeSnapshot} />}</fieldset>
  </div>;
}
