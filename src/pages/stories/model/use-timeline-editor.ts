'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import { useSession } from '@/shared/auth/client';
import { timelineWriteSchema, type TimelineDocument, type TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { createTimeline, loadTimeline, saveTimeline } from './timeline-api';
import { StoryRequestError } from './story-api';
import { timelineWrite, browserTimelineDraftStore, sameTimeline } from './timeline-local-draft';
import { publishDocumentAddress } from './new-document';
import { TimelineAutosave } from './timeline-autosave';

export function useTimelineEditor(id: string, initial?: TimelineDocument, resumeDraft = false) {
  const [seed] = useState(initial);
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const { data: session } = useSession();
  const userId = session?.user.id;
  const editor = useMemo(() => new TimelineAutosave({
    ...(seed ? { create: async (document: TimelineDocument) => {
      const address = window.location.href;
      const { timeline } = await createTimeline(document.workspaceId, timelineWrite(document), id);
      if (!sameTimeline(timeline, { ...document, ...timelineWriteSchema.parse(timelineWrite(document)) })) throw new StoryRequestError('Монтаж уже сохранён в другой версии.', 409);
      publishDocumentAddress('timeline', id, address);
      return timeline;
    } } : {}),
    store: browserTimelineDraftStore(userId ?? 'unauthenticated', id),
    save: async (document) => (await saveTimeline(id, document.revision, timelineWrite(document))).timeline,
    load: async () => (await loadTimeline(id, new AbortController().signal)).timeline,
  }), [id, userId, seed]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => {
    if (!userId) return;
    const abort = new AbortController();
    if (seed && !resumeDraft) editor.initialize(seed);
    else void loadTimeline(id, abort.signal).then(({ timeline }) => { if (!abort.signal.aborted) editor.initialize(timeline, undefined, true); })
      .catch((error) => {
        if (abort.signal.aborted) return;
        if (seed && error instanceof StoryRequestError && error.status === 404) { editor.initialize(seed); return; }
        // Cached documents never bypass a server denial of access.
        if (!(error instanceof StoryRequestError) || error.status >= 500) editor.initialize(null);
        editor.loadFailed(error);
      });
    const retry = () => { if (editor.getSnapshot().dirty || editor.getSnapshot().error) void editor.retry().catch(() => undefined); };
    window.addEventListener('online', retry);
    return () => { abort.abort(); editor.stop(); if (editor.getSnapshot().dirty) void editor.flush().catch(() => undefined); window.removeEventListener('online', retry); };
  }, [editor, id, userId, seed, resumeDraft]);
  useEffect(() => {
    if (!state.dirty || !state.localError) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || event.metaKey || event.ctrlKey) return;
      const url = new URL(anchor.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(tEffect("Правки ещё не сохранены ни в браузере, ни на сервере. Покинуть монтаж?"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [state.dirty, state.localError]);
  async function commitSnapshot(snapshot: TimelineSnapshot) {
    const current = editor.getSnapshot().draft;
    if (!current) throw new Error(tUi("Монтаж ещё загружается."));
    editor.edit({ ...current, snapshot });
    return editor.flush(true);
  }
  return { ...state, edit: editor.edit, undo: editor.undo, redo: editor.redo, accept: editor.accept, flush: editor.flush, commitSnapshot,
    ensurePersisted: () => editor.flush(true),
    retry: () => { void editor.retry().catch(() => undefined); },
    resolveConflict: editor.resolve,
    reload: () => { window.location.reload(); },
  };
}
