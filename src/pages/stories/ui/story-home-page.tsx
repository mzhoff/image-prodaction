'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { SectionHelpButton } from '@/shared/ui/section-help';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffectEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Layers, Plus, Sparkles, SlidersHorizontal } from '@prodactionpro/ui-core/icons';
import { AssistantPanel } from '@/widgets/assistant-shell/ui/assistant-panel';
import { StoryBlueprintChat } from '@/features/chat-assistant/ui/story-blueprint-chat';
import { loadHomeSubjects, type HomeSubjectChoice } from '@/features/chat-assistant/api/home-subject-api';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useDocumentReturnHref } from '@/pages/workspace/ui/document-navigation';
import { STORY_FORMATS, STORY_GENRES } from '@/modules/story-projects/core/story-presets';
import { useStoryEditor } from '../model/use-story-editor';
import { StoryBlueprintDocument } from './story-blueprint-document';
import { StoryBoard } from './story-board';
import { useStoryCharacters } from '../model/use-story-characters';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { StoryCreateDialog } from './story-create-dialog';
import { StoryCharacters } from './story-characters';

export function StoryHomePage({ documentId, initial }: { documentId?: string; initial?: StoryProject } = {}) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell();
  const workspaceId = workspace.activeWorkspace?.id;
  const params = useSearchParams();
  const id = documentId ?? params?.get('story') ?? '';
  return workspaceId ? <StoryHomeSession key={`${workspaceId}:${id}`} workspaceId={workspaceId} id={id} initial={initial} />
    : <p className="production-home-loading">{workspace.error || tUi("Загружаю пространство…")}</p>;
}

function StoryHomeSession({ workspaceId, id, initial }: { workspaceId: string; id: string; initial?: StoryProject }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const ui_STORY_FORMATS = useUiCatalog(STORY_FORMATS, tUi);
  const ui_STORY_GENRES = useUiCatalog(STORY_GENRES, tUi);
  const workspace = useWorkspaceShell(), editor = useStoryEditor(id, initial), returnHref = useDocumentReturnHref();
  const story = editor.draft;
  const [wizardOpen, setWizardOpen] = useState(Boolean(initial));
  const [catalog, setCatalog] = useState<HomeSubjectChoice[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [expanded, setExpanded] = useState(Boolean(initial)), [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<'blueprint' | 'storyboard' | 'characters'>('blueprint');
  const [sceneRequest, setSceneRequest] = useState(0);
  const openCharacters = useCallback(() => { setExpanded(true); setCollapsed(false); setView('characters'); }, []);
  const characters = useStoryCharacters(editor, openCharacters, assistantBusy);
  const [subjectError, setSubjectError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void loadHomeSubjects(workspaceId, controller.signal).then(setCatalog).catch(() => {
      if (!controller.signal.aborted) setSubjectError(tEffect("Не удалось загрузить героев. Откройте библиотеку персонажей в композере."));
    });
    return () => controller.abort();
  }, [workspaceId]);
  const refresh = editor.refreshFromAssistant;
  const onBlueprintSaved = useCallback(async (_revision: number, nextView: 'blueprint' | 'storyboard' | 'characters') => {
    await refresh(); setView(nextView); setExpanded(true); setCollapsed(false);
  }, [refresh]);
  const subjects = catalog.filter((item) => story?.snapshot.subjectIds?.includes(item.id));
  const busy = editor.saving || assistantBusy || characters.busy;
  const openDocument = expanded || Boolean(story?.snapshot.blueprint.script.trim());
  if (story && story.workspaceId !== workspaceId) return <p className="story-home-error">{tUi("Эта история находится в другом пространстве. Переключите Workspace.")}</p>;
  return <div className="production-home story-home" data-mode="storyboard">
    <header className="production-home-header"><div className="home-screen-heading"><Link className="home-screen-back" href={returnHref} aria-label={tUi("Вернуться к предыдущему экрану")}><ArrowLeft size={18} /></Link><h1>{story?.name ?? 'Storyboard'}</h1></div>
      <div className="story-home-actions"><SectionHelpButton />{story ? <button type="button" disabled={busy || editor.dirty || characters.dirty} onClick={() => setWizardOpen(true)} aria-label={tUi("Настроить историю")}><SlidersHorizontal size={15} />{tUi("Настроить историю")}</button> : null}{story ? <button type="button" disabled={characters.dirty || busy} onClick={() => { setExpanded(true); setView('blueprint'); }}><Layers size={15} />{tUi("Blueprint и раскадровка")}</button> : null}<Link href={`/create?type=storyboard&new=${id}`}><Plus size={15} />{tUi("Новая история")}</Link></div></header>
    {story ? <div className="story-home-presets"><span>{ui_STORY_FORMATS.find((item) => item.value === story.snapshot.settings.format)?.label}</span><span>{ui_STORY_GENRES.find((item) => item.value === story.snapshot.settings.genre)?.label}</span><span>{story.snapshot.settings.targetDurationSeconds}  {' '}{tUi("сек")}</span><span>{story.snapshot.settings.aspectRatio}</span><span>{editor.saving ? tUi("Сохраняем…") : editor.dirty ? tUi("Есть несохранённые правки") : editor.isNew ? tUi("Новая история") : tUi("История сохранена в Stories")}</span></div> : null}
    {editor.error || subjectError ? <div className="story-home-error" role="alert">{typeof (editor.error || subjectError) === 'string' ? tUi((editor.error || subjectError) as string) : (editor.error || subjectError)}{editor.error ? <button type="button" onClick={editor.reload}>{tUi("Обновить историю")}</button> : null}</div> : null}
    <section className={`production-home-conversation story-authoring-workspace ${openDocument ? 'is-document-open' : ''} ${collapsed ? 'is-coauthor-collapsed' : ''}`} aria-label={tUi("Создание Storyboard")}>
      <aside className="story-authoring-chat" aria-label={tUi("Соавтор истории")}>
        <AssistantPanel placement={openDocument ? 'docked' : 'fullscreen'} open={!collapsed || !openDocument} onOpen={() => setCollapsed(false)} onClose={() => setCollapsed(true)} title={tUi("Соавтор")} contextLabel={tUi("История")}>
          {story ? <StoryBlueprintChat isNew={editor.isNew} ensurePersisted={editor.ensurePersisted} id={story.id} workspaceId={workspaceId} revision={story.revision} dirty={editor.dirty || editor.saving || characters.dirty || characters.busy} fullscreen={!openDocument}
            characterContext={characters.context} characterRequest={characters.request} sceneRequest={sceneRequest} onBlueprintSaved={onBlueprintSaved} onBusyChange={setAssistantBusy} subjects={subjects} onSubjectsChange={(selected) => {
              setCatalog((items) => [...items.filter((item) => !selected.some((candidate) => candidate.id === item.id)), ...selected]);
              void editor.saveSubjects(selected.map((item) => item.id));
            }} />
            : <div className="story-home-empty"><Layers size={38} strokeWidth={1.25} /><h2>{tUi("Всё начинается с истории")}</h2><p>{id ? tUi("Открываем ваш замысел…") : tUi("Выберите формат и настроение. Затем расскажите идею соавтору.")}</p>{!id ? <Link href="/create?type=storyboard">{tUi("Выбрать пресет")}</Link> : null}</div>}
        </AssistantPanel>
      </aside>
      <div className="story-authoring-document" inert={!openDocument} aria-hidden={!openDocument}>
        {story ? <><nav className="story-authoring-tabs" aria-label={tUi("Документы истории")}><button type="button" aria-pressed={view === 'blueprint'} disabled={characters.dirty || busy} onClick={() => setView('blueprint')}>Blueprint</button><button type="button" aria-pressed={view === 'characters'} disabled={characters.dirty || busy} onClick={openCharacters}>{tUi("Герои")}{' '} {characters.context.ready}/{characters.context.total}</button><button type="button" disabled={characters.dirty || busy} aria-pressed={view === 'storyboard'} onClick={() => setView('storyboard')}>{tUi("Раскадровка")}</button>{story.snapshot.blueprint.script.trim() && !story.snapshot.scenes.length ? <button type="button" disabled={editor.dirty || characters.dirty || busy} onClick={() => { setCollapsed(false); setSceneRequest((n) => n + 1); }}><Sparkles size={14} />{tUi("Собрать раскадровку")}</button> : null}<button type="button" className="story-authoring-save" disabled={!editor.dirty || busy} onClick={editor.save}>{editor.saving ? tUi("Сохраняем…") : tUi("Сохранить")}</button></nav>
          <fieldset disabled={busy} className="story-authoring-document-body">{view === 'blueprint'
            ? <StoryBlueprintDocument story={story} folders={workspace.folders.filter((folder) => folder.workspaceId === workspaceId)} onChange={editor.edit} />
            : view === 'characters' ? <StoryCharacters story={story} authoring={characters} disabled={editor.saving || editor.dirty || assistantBusy} /> : <StoryBoard story={story} onChange={(snapshot) => editor.edit({ ...story, snapshot })} />}</fieldset></> : null}
      </div>
    </section>
    {wizardOpen && story ? <StoryCreateDialog workspaceId={workspaceId} allowBlank={editor.isNew} folders={workspace.folders.filter((folder) => folder.workspaceId === workspaceId)} initial={story}
      onClose={() => setWizardOpen(false)} onConfigure={async (input) => { await editor.configure({ ...story, ...input }); setWizardOpen(false); void workspace.refresh(); }} /> : null}
  </div>;
}
