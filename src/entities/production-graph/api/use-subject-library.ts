'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { LibrarySubjectProfile, SubjectLibraryItem } from '../model/subject-profile';
import { subjectLibraryRequest, subjectLibraryUrl } from './subject-library-api';

type State = { subjects: SubjectLibraryItem[]; loading: boolean; error: string };
const empty: State = { subjects: [], loading: false, error: '' };
const caches = new Map<string, { state: State; pending?: Promise<void>; loaded: boolean; listeners: Set<() => void> }>();
function cache(id: string) {
  if (!caches.has(id)) caches.set(id, { state: empty, loaded: false, listeners: new Set() });
  return caches.get(id)!;
}
function emit(id: string, patch: Partial<State>) {
  const entry = cache(id); entry.state = { ...entry.state, ...patch }; entry.listeners.forEach((listener) => listener());
}
async function refresh(id: string) {
  const entry = cache(id);
  if (entry.pending) return entry.pending;
  emit(id, { loading: true, error: '' });
  entry.pending = subjectLibraryRequest<{ subjects: SubjectLibraryItem[] }>(subjectLibraryUrl(id))
    .then(({ subjects }) => { entry.loaded = true; emit(id, { subjects }); })
    .catch((error: unknown) => { emit(id, { subjects: [], error: error instanceof Error ? error.message : 'Не удалось загрузить персонажей.' }); })
    .finally(() => { entry.pending = undefined; emit(id, { loading: false }); });
  return entry.pending;
}
export function rememberLibrarySubject(profile: LibrarySubjectProfile) {
  const entry = cache(profile.workspaceId);
  emit(profile.workspaceId, { subjects: [profile, ...entry.state.subjects.filter((item) => item.id !== profile.id)] });
}

/** One request per workspace even when several Subject Builder nodes are mounted. */
export function useSubjectLibrary(workspaceId?: string) {
  const subscribe = useCallback((listener: () => void) => {
    if (!workspaceId) return () => undefined;
    const entry = cache(workspaceId); entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }, [workspaceId]);
  const snapshot = useCallback(() => workspaceId ? cache(workspaceId).state : empty, [workspaceId]);
  const state = useSyncExternalStore(subscribe, snapshot, () => empty);
  useEffect(() => { if (workspaceId && !cache(workspaceId).loaded) void refresh(workspaceId); }, [workspaceId]);
  const reload = useCallback(() => workspaceId ? refresh(workspaceId) : Promise.resolve(), [workspaceId]);
  // Revalidate after returning from another tab; loaded node passports remain snapshots.
  useEffect(() => { const focus = () => { void reload(); }; window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus); }, [reload]);
  return { ...state, reload };
}
