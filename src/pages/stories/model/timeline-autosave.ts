import { timelineWriteSchema, type TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { sameTimeline, timelineWrite, type LocalTimelineDraft, type TimelineDraftStore } from './timeline-local-draft';

type SaveState = { draft: TimelineDocument | null; isNew: boolean; dirty: boolean; saving: boolean; error: string; localError: string; conflict: boolean; canUndo: boolean; canRedo: boolean };
type Dependencies = {
  store: TimelineDraftStore;
  save(document: TimelineDocument): Promise<TimelineDocument>;
  load(): Promise<TimelineDocument>;
  create?(document: TimelineDocument): Promise<TimelineDocument>;
  delay?: number;
};
const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось синхронизировать монтаж.';
const status = (error: unknown) => error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;

/** Local-first journal + a serial CAS queue. Network acknowledgements never replace newer edits. */
export class TimelineAutosave {
  private state: SaveState = { draft: null, isNew: false, dirty: false, saving: false, error: '', localError: '', conflict: false, canUndo: false, canRedo: false };
  private creation: TimelineDocument | null = null;
  private base: TimelineDocument | null = null;
  private remote: TimelineDocument | null = null;
  private past: TimelineDocument[] = [];
  private future: TimelineDocument[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<TimelineDocument> | null = null;
  private active = true;
  private failures = 0;
  private deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; this.state.isNew = Boolean(deps.create); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SaveState> = {}) {
    this.state = { ...this.state, ...patch, dirty: Boolean(this.base && this.state.draft && !sameTimeline(this.base, this.state.draft)), canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
    this.listeners.forEach((listener) => listener());
  }
  private journal() {
    if (!this.base || !this.state.draft) return;
    if (this.state.isNew && sameTimeline(this.base, this.state.draft)) return;
    try { this.deps.store.write({ version: 1, base: this.base, draft: this.state.draft, savedAt: Date.now() }); this.state = { ...this.state, localError: '' }; }
    catch { this.state = { ...this.state, localError: 'Браузер не смог сохранить локальную копию. Не закрывайте окно до синхронизации.' }; }
  }
  readLocal() { try { return this.deps.store.read(); } catch { return null; } }
  initialize(server: TimelineDocument | null, local: LocalTimelineDraft | null = this.readLocal(), persisted = !this.deps.create) {
    this.active = true;
    if (persisted) this.state.isNew = false;
    if (!server && !local) return;
    if (server && local && local.draft.workspaceId !== server.workspaceId) local = null;
    const pending = local && !sameTimeline(local.base, local.draft);
    this.base = pending ? local!.base : server ?? local!.base;
    const draft = pending ? local!.draft : server ?? local!.draft;
    this.state = { ...this.state, draft, error: '', conflict: false };
    if (server && pending && local) {
      if (sameTimeline(server, draft)) { this.base = server; this.state.draft = server; }
      else if (server.revision !== local.base.revision) { this.remote = server; this.state.conflict = true; this.state.error = 'На сервере есть другая версия монтажа. Выберите, какую сохранить.'; }
      else this.base = server;
    }
    this.journal(); this.publish(); if (this.state.dirty && !this.state.conflict) this.schedule();
  }
  loadFailed(error: unknown) { this.publish({ error: message(error) }); }
  edit = (next: TimelineDocument) => {
    if (!this.state.draft || sameTimeline(next, this.state.draft)) return;
    this.past = [...this.past.slice(-49), this.state.draft]; this.future = [];
    this.change(next);
  };
  private change(next: TimelineDocument) {
    this.state = { ...this.state, draft: { ...next, revision: this.base!.revision }, error: this.state.conflict ? this.state.error : '' };
    this.journal(); this.publish(); if (!this.state.conflict) this.schedule();
  }
  undo = () => { const previous = this.past.pop(); if (previous && this.state.draft) { this.future.unshift(this.state.draft); this.change(previous); } };
  redo = () => { const next = this.future.shift(); if (next && this.state.draft) { this.past.push(this.state.draft); this.change(next); } };
  accept = (server: TimelineDocument) => {
    if (this.state.draft && !sameTimeline(server, this.state.draft)) this.past.push(this.state.draft);
    this.future = []; this.base = server; this.state = { ...this.state, draft: server, isNew: false, error: '', conflict: false };
    this.journal(); this.publish();
  };
  private schedule(delay = this.deps.delay ?? 650) {
    clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, delay);
  }
  private acknowledge(server: TimelineDocument, sent: TimelineDocument) {
    this.base = server;
    this.state = { ...this.state, draft: sameTimeline(this.state.draft!, sent) ? server : { ...this.state.draft!, revision: server.revision, updatedAt: server.updatedAt }, error: '' };
    this.failures = 0; this.journal(); this.publish();
  }
  flush = (create = false): Promise<TimelineDocument> => {
    clearTimeout(this.timer);
    if (this.inFlight) return create ? this.inFlight.then(() => this.flush(true)) : this.inFlight;
    if (!this.base || !this.state.draft) return Promise.reject(new Error('Монтаж ещё загружается.'));
    if (this.state.conflict) return Promise.reject(new Error(this.state.error));
    // Start in a microtask so even a synchronously rejected validation owns the queue.
    this.inFlight = Promise.resolve().then(async () => {
      this.publish({ saving: true });
      while (this.state.dirty || (create && this.state.isNew)) {
        const sent = this.state.isNew && this.creation ? this.creation : { ...this.state.draft!, revision: this.base!.revision };
        const parsed = timelineWriteSchema.safeParse(timelineWrite(sent));
        if (!parsed.success) { this.publish({ error: !sent.name.trim() ? 'Введите название монтажа.' : parsed.error.issues[0]?.message ?? 'Проверьте монтаж.' }); throw new Error(this.state.error); }
        try {
          if (this.state.isNew) this.creation ??= sent;
          const server = await (this.state.isNew ? this.deps.create!(sent) : this.deps.save(sent));
          this.state.isNew = false; this.creation = null;
          this.acknowledge(server, sent);
        }
        catch (error) {
          if (status(error) === 409) {
            try {
              const remote = await this.deps.load();
              this.state.isNew = false; this.creation = null;
              if (sameTimeline(remote, sent)) { this.acknowledge(remote, sent); continue; }
              this.remote = remote; this.publish({ conflict: true, error: 'Монтаж изменён в другом окне. Локальная версия сохранена. Выберите, какую оставить.' });
            } catch { this.publish({ error: 'Не удалось проверить новую версию. Правки сохранены локально.' }); this.schedule(5000); }
          } else {
            this.publish({ error: message(error) });
            if (!status(error) || status(error) >= 500 || status(error) === 429) this.schedule(Math.min(30_000, 2000 * 2 ** this.failures++));
          }
          throw error;
        }
      }
      return this.base!;
    }).finally(() => { this.inFlight = null; this.publish({ saving: false }); });
    return this.inFlight;
  };
  resolve = (choice: 'local' | 'server') => {
    if (!this.remote || this.state.saving) return;
    const draft = this.state.draft!;
    if (choice === 'server') this.past.push(draft);
    this.base = this.remote; this.remote = null;
    this.state = { ...this.state, draft: choice === 'server' ? this.base : { ...draft, revision: this.base.revision }, conflict: false, error: '' };
    this.journal(); this.publish(); if (choice === 'local') this.schedule(0);
  };
  retry = async () => {
    if (this.state.dirty) return this.flush();
    try { const remote = await this.deps.load(); this.initialize(remote); return remote; }
    catch (error) { this.loadFailed(error); throw error; }
  };
  stop() { this.active = false; clearTimeout(this.timer); }
}
