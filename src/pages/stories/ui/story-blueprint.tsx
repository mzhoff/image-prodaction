'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useCallback, useEffect, useState } from 'react';
import { AssistantPanel } from '@/widgets/assistant-shell/ui/assistant-panel';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { StoryBlueprintChat } from '@/features/chat-assistant/ui/story-blueprint-chat';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { StoryBlueprintDocument } from './story-blueprint-document';
import { useStoryCharacters } from '../model/use-story-characters';
import type { useStoryEditor } from '../model/use-story-editor';
import { StoryCharacters } from './story-characters';
import { StoryBoard } from './story-board';

export function StoryBlueprint({ story, folders, onChange, dirty, onBlueprintSaved, onBusyChange, editor, initialView = 'blueprint' }: { story: StoryProject; folders: StudioFolder[]; onChange: (story: StoryProject) => void; dirty: boolean; onBlueprintSaved: (revision: number, view: 'blueprint' | 'storyboard' | 'characters') => Promise<void>; onBusyChange: (busy: boolean) => void; editor: ReturnType<typeof useStoryEditor>; initialView?: 'blueprint' | 'characters' }) {
  const tUi = useTranslations();
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<'blueprint' | 'characters' | 'storyboard'>(initialView);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const openCharacters = useCallback(() => { setView('characters'); setCollapsed(false); }, []);
  const characters = useStoryCharacters(editor, openCharacters, assistantBusy);
  useEffect(() => { setView(initialView); }, [initialView]);
  useEffect(() => { onBusyChange(assistantBusy || characters.busy || characters.dirty); }, [assistantBusy, characters.busy, characters.dirty, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const saved = useCallback(async (revision: number, nextView: 'blueprint' | 'storyboard' | 'characters') => { await onBlueprintSaved(revision, nextView); setView(nextView); }, [onBlueprintSaved]);
  return <div className={`story-blueprint-workspace ${collapsed ? 'story-chat-collapsed' : ''}`}>
    <aside className="story-blueprint-assistant" aria-label={tUi("Соавтор истории")}>
      <AssistantPanel placement="docked" open={!collapsed} onOpen={() => setCollapsed(false)} onClose={() => setCollapsed(true)} title={tUi("Соавтор")} contextLabel={tUi("История")}>
        <StoryBlueprintChat id={story.id} workspaceId={story.workspaceId} dirty={dirty || characters.dirty || characters.busy} revision={story.revision} onBlueprintSaved={saved} onBusyChange={setAssistantBusy} characterContext={characters.context} characterRequest={characters.request} />
      </AssistantPanel>
    </aside>
    <div className="story-blueprint-main"><nav className="story-authoring-tabs"><button type="button" disabled={characters.dirty || characters.busy} aria-pressed={view === 'blueprint'} onClick={() => setView('blueprint')}>Blueprint</button><button type="button" disabled={characters.dirty || characters.busy} aria-pressed={view === 'characters'} onClick={openCharacters}>{tUi("Герои")}{' '} {characters.context.ready}/{characters.context.total}</button></nav>
      {view === 'characters' ? <StoryCharacters story={story} authoring={characters} disabled={dirty || assistantBusy} /> : view === 'storyboard' ? <StoryBoard story={story} onChange={(snapshot) => onChange({ ...story, snapshot })} /> : <StoryBlueprintDocument story={story} folders={folders} onChange={onChange} />}</div>
  </div>;
}
