'use client';

import { workspaceAiAccessFromError, type WorkspaceAiAccess } from './workspace-ai-access';
import { refreshWorkspaceAiAccess } from './workspace-ai-access-refresh';
export { isWorkspaceAiAccessError, type WorkspaceAiAccess } from './workspace-ai-access';

interface Entry {
  value?: WorkspaceAiAccess;
  revision: number;
  expiresAt: number;
  pending?: { revision: number; promise: Promise<WorkspaceAiAccess> };
  listeners: Set<() => void>;
}
interface Dependencies {
  load(workspaceId: string, previous: WorkspaceAiAccess | undefined, force: boolean): Promise<WorkspaceAiAccess>;
  now(): number;
}

/** Session-memory UX hints only. The server always authorizes each paid operation. */
export function createWorkspaceAiAccessStore(dependencies: Dependencies = { load: refreshWorkspaceAiAccess, now: Date.now }) {
  const entries = new Map<string, Entry>();
  const entryFor = (id: string) => {
    let entry = entries.get(id);
    if (!entry) { entry = { revision: 0, expiresAt: 0, listeners: new Set() }; entries.set(id, entry); }
    return entry;
  };
  const publish = (entry: Entry) => { for (const listener of [...entry.listeners]) listener(); };
  const read = (id: string) => entries.get(id)?.value;
  const load = (id: string, { force = false }: { force?: boolean } = {}): Promise<WorkspaceAiAccess> => {
    if (!id) return Promise.reject(new Error('Выберите рабочее пространство.'));
    const entry = entryFor(id);
    // Known denials are sticky until an explicit check; connected hints expire locally.
    if (!force && entry.value && (entry.value.status !== 'connected' || entry.expiresAt > dependencies.now())) return Promise.resolve(entry.value);
    if (entry.pending?.revision === entry.revision) return entry.pending.promise;
    const revision = entry.revision, previous = entry.value;
    const promise = Promise.resolve().then(() => dependencies.load(id, previous, force)).then((value) => {
      if (entry.revision !== revision) {
        if (entry.value) return entry.value;
        throw new Error('Проверка доступа устарела. Повторите её для текущего аккаунта.');
      }
      entry.value = value; entry.expiresAt = dependencies.now() + 60_000; publish(entry);
      return value;
    }, (error: unknown) => {
      if (entry.revision !== revision && entry.value) return entry.value;
      throw error;
    }).finally(() => { if (entry.pending?.promise === promise) entry.pending = undefined; });
    entry.pending = { revision, promise };
    return promise;
  };
  const report = (id: string, error: unknown) => {
    const value = workspaceAiAccessFromError(error);
    if (!id || !value) return false;
    const entry = entryFor(id);
    entry.revision++; entry.value = value; entry.expiresAt = 0; publish(entry);
    return true;
  };
  const subscribe = (id: string, listener: () => void) => {
    const entry = entryFor(id); entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  };
  const clear = (id?: string) => {
    for (const entry of id === undefined ? entries.values() : [entries.get(id)]) {
      if (!entry) continue;
      entry.revision++; entry.value = undefined; entry.expiresAt = 0; entry.pending = undefined; publish(entry);
    }
  };
  return { read, load, report, subscribe, clear };
}

const store = createWorkspaceAiAccessStore();
export const readWorkspaceAiAccess = store.read;
export const loadWorkspaceAiAccess = store.load;
export const subscribeWorkspaceAiAccess = store.subscribe;
export const reportWorkspaceAiAccessError = store.report;
/** Call on account changes; member-specific denials must not follow another signed-in user. */
export const clearWorkspaceAiAccess = store.clear;
