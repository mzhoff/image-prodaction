'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterCommand, CharacterGeneration } from '@/modules/story-projects/contracts/story-character';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { isCharacterReady } from '@/modules/story-projects/core/character-passport';
import type { StoryCharacterChatContext } from '@/features/chat-assistant/ui/story-character-chat';
import { useStoryUnsavedGuard } from './use-story-unsaved-guard';
import { storyRequest } from './story-api';
import type { useStoryEditor } from './use-story-editor';

type Change = CharacterCommand extends infer C ? C extends CharacterCommand ? Omit<C, 'expectedRevision'> : never : never;
export function useStoryCharacters(editor: ReturnType<typeof useStoryEditor>, open: () => void, assistantBusy: boolean) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const story = editor.draft, id = story?.id ?? '';
  const [selectedId, setSelectedId] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false), [dirty, setDirty] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [generations, setGenerations] = useState<CharacterGeneration[]>([]);
  const lock = useRef(false), attempts = useRef(new Map<string, string>());
  const [request, setRequest] = useState<{ id: number; text: string }>();
  useStoryUnsavedGuard(dirty);
  const selected = story?.snapshot.characters?.find((item) => item.id === selectedId);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!id || editor.isNew) return;
    const result = await storyRequest<{ generations: CharacterGeneration[] }>(`/api/stories/${id}/characters/generations`, { signal });
    if (!signal?.aborted) setGenerations(result.generations);
  }, [id, editor.isNew]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить варианты героев. Повторите проверку.")); });
    return () => controller.abort();
  }, [load]);
  const pending = generations.some((item) => item.status === 'queued' || item.status === 'running');
  useEffect(() => {
    if (!pending) return;
    const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await load(controller.signal); }
      catch { if (!controller.signal.aborted) setError(tEffect("Проверяем создание образа. Если связь прервётся, результат останется в истории.")); }
      if (!controller.signal.aborted) timeout = setTimeout(() => void poll(), 3000);
    };
    timeout = setTimeout(() => void poll(), 1500);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [load, pending]);
  const change = async (command: Change) => {
    if (!story || lock.current || assistantBusy || editor.dirty || editor.saving) return false;
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await editor.ensurePersisted();
      const result = await storyRequest<{ story: StoryProject }>(`/api/stories/${id}/characters`, { method: 'POST', body: JSON.stringify({ ...command, expectedRevision: saved.revision }) });
      editor.acceptSaved(result.story); setDirty(false);
      if (command.action === 'import') setSelectedId(result.story.snapshot.characters?.find((item) => item.source?.subjectId === command.subjectId)?.id);
      if (command.action === 'save' && !command.character.id) setSelectedId(result.story.snapshot.characters?.at(-1)?.id);
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось сохранить героя.")); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const generate = async (characterId: string, model: string) => {
    if (!story || lock.current || dirty || editor.dirty || assistantBusy) return;
    lock.current = true; setBusy(true); setError('');
    const key = `${characterId}:${story.revision}:${model}`;
    const attemptId = attempts.current.get(key) ?? crypto.randomUUID(); attempts.current.set(key, attemptId);
    try {
      await storyRequest(`/api/stories/${id}/characters/generations`, { method: 'POST', body: JSON.stringify({ characterId, model, attemptId, expectedRevision: story.revision }) });
      attempts.current.delete(key); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось создать образ.")); }
    finally { lock.current = false; setBusy(false); }
  };
  const ask = (text: string) => { if (!dirty && !busy && !assistantBusy && !editor.dirty) { open(); setRequest((previous) => ({ id: (previous?.id ?? 0) + 1, text })); } };
  const context: StoryCharacterChatContext = {
    hasBlueprint: Boolean(story?.snapshot.blueprint.script.trim()), total: story?.snapshot.characters?.length ?? 0,
    ready: story?.snapshot.characters?.filter((item) => isCharacterReady(item, story.snapshot.blueprint.visualStyle)).length ?? 0,
    skipped: Boolean(story?.snapshot.charactersSkipped), focused: selected ? { id: selected.id, name: selected.passport.name } : undefined,
    open, library: () => { open(); setLibraryOpen(true); }, clearFocus: () => { if (!dirty) setSelectedId(undefined); },
  };
  return { context, selected, selectedId, select: (next?: string) => { if (!dirty && !busy) setSelectedId(next); },
    libraryOpen, setLibraryOpen, dirty, setDirty, busy: busy || transferring, setTransferring, error, generations, request, ask, change, generate,
    refresh: () => { setError(''); void load().catch(() => setError(tUi("Не удалось обновить варианты. Проверьте соединение."))); } };
}
