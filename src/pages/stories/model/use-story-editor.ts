'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { storyWriteSchema, type StoryProject } from '@/modules/story-projects/contracts/story-project';
import { sameDocumentContent } from './document-content';
import { publishDocumentAddress } from './new-document';
import { useStoryUnsavedGuard } from './use-story-unsaved-guard';
import { createStory, loadStory, saveStory } from './story-api';

export function useStoryEditor(id: string, initial?: StoryProject) {
  const [seed] = useState(initial);
  const [isNew, setIsNew] = useState(Boolean(initial));
  const persisted = useRef(!initial);
  const firstWrite = useRef<StoryProject | null>(null);
  const creating = useRef<Promise<StoryProject> | null>(null);
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [draft, setDraft] = useState<StoryProject | null>(seed ?? null);
  const [saved, setSaved] = useState<StoryProject | null>(seed ?? null);
  const [past, setPast] = useState<StoryProject[]>([]); const [future, setFuture] = useState<StoryProject[]>([]);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const current = useRef(draft);
  useLayoutEffect(() => { current.current = draft; }, [draft]);
  const persist = useCallback(async (next: StoryProject) => {
    const write = (value: StoryProject) => ({ name: value.name, folderId: value.folderId, snapshot: value.snapshot });
    if (!persisted.current) {
      const address = window.location.href;
      firstWrite.current ??= next;
      creating.current ??= createStory(next.workspaceId, write(firstWrite.current), id).then(({ story }) => story)
        .catch((error) => { creating.current = null; throw error; });
      const created = await creating.current;
      persisted.current = true; setIsNew(false); publishDocumentAddress('storyboard', id, address);
      if (sameDocumentContent(write(created), storyWriteSchema.parse(write(next)))) return created;
      return (await saveStory(id, created.revision, write(next))).story;
    }
    return (await saveStory(id, next.revision, write(next))).story;
  }, [id]);
  const ensurePersisted = useCallback(async () => {
    const next = current.current;
    if (!next) throw new Error('История ещё загружается.');
    if (persisted.current) return next;
    const story = await persist(next);
    current.current = story; setDraft(story); setSaved(story); setError('');
    return story;
  }, [persist]);
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  const acceptSaved = useCallback((story: StoryProject) => {
    if (story.id !== id) return;
    setDraft(story); setSaved(story); setPast([]); setFuture([]); setError('');
  }, [id]);
  useEffect(() => {
    if (!id || (seed && !persisted.current)) return;
    const controller = new AbortController();
    loadStory(id, controller.signal).then(({ story }) => { if (!controller.signal.aborted) { setDraft(story); setSaved(story); setPast([]); setFuture([]); setError(''); } })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось открыть историю.")); });
    return () => controller.abort();
  }, [id, reload, seed]);
  useStoryUnsavedGuard(dirty);
  function edit(next: StoryProject) {
    if (!draft || saving) return;
    setPast((items) => [...items.slice(-49), draft]); setFuture([]); setDraft(next);
  }
  async function save() {
    if (!draft || !saved || saving) return;
    setSaving(true); setError('');
    try {
      const story = await persist({ ...draft, revision: saved.revision });
      setDraft(story); setSaved(story); setPast([]); setFuture([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось сохранить историю.")); }
    finally { setSaving(false); }
  }
  async function configure(next: StoryProject) {
    setSaving(true); setError('');
    try { const story = await persist(next); acceptSaved(story); }
    finally { setSaving(false); }
  }
  async function saveSubjects(subjectIds: string[]) {
    if (!draft || !saved || saving || dirty) return;
    setSaving(true); setError('');
    try {
      const story = await persist({ ...draft, revision: saved.revision, snapshot: { ...draft.snapshot, subjectIds } });
      setDraft(story); setSaved(story); setPast([]); setFuture([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось сохранить героев.")); }
    finally { setSaving(false); }
  }
  const refreshFromAssistant = useCallback(async () => {
    if (dirty) throw new Error(tUi("Сначала сохраните свои правки, затем откройте обновлённый blueprint."));
    const { story } = await loadStory(id);
    setDraft(story); setSaved(story); setPast([]); setFuture([]); setError('');
  }, [tUi, dirty, id]);
  return { configure, isNew, ensurePersisted, acceptSaved, saveSubjects, refreshFromAssistant, draft, dirty, error, saving, edit, save,
    reload: () => { if (!dirty || window.confirm(tUi("Открыть сохранённую версию? Несохранённые правки будут потеряны."))) setReload((value) => value + 1); },
    canUndo: past.length > 0, canRedo: future.length > 0,
    undo: () => { const previous = past.at(-1); if (previous && draft && !saving) { setFuture((items) => [draft, ...items]); setPast(past.slice(0, -1)); setDraft(previous); } },
    redo: () => { const next = future[0]; if (next && draft && !saving) { setPast((items) => [...items, draft]); setFuture(future.slice(1)); setDraft(next); } },
  };
}
