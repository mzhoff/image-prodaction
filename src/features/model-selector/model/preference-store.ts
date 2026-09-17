import {
  applyModelPreferenceChange, emptyAccountModelPreferences,
  type AccountModelPreferences, type ModelPreferenceChange, type ModelPreference,
} from '@/shared/model-preferences/contracts';

export interface PreferenceSnapshot {
  data: AccountModelPreferences;
  ready: boolean;
  loading: boolean;
  pending: boolean;
  error: string;
}
/** One cache per authenticated user, shared by every node and account settings. */
export class ModelPreferenceStore {
  private base: AccountModelPreferences;
  private listeners = new Set<() => void>();
  private queue: ModelPreferenceChange[] = [];
  private running = false;
  private epoch = 0;
  private read: Promise<void> | null = null;
  private snapshot: PreferenceSnapshot;
  private readonly accountId: string;
  private readonly request: typeof fetch;
  constructor(accountId: string, request: typeof fetch = (input, init) => fetch(input, init)) {
    this.accountId = accountId; this.request = request;
    this.base = emptyAccountModelPreferences(accountId);
    this.snapshot = { data: this.base, ready: false, loading: false, pending: false, error: '' };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<PreferenceSnapshot> = {}) {
    const data = { ...this.base, preferences: { ...this.base.preferences } };
    for (const change of this.queue) {
      data.preferences[change.modality] = applyModelPreferenceChange(data.preferences[change.modality], change);
    }
    this.snapshot = { ...this.snapshot, ...patch, data, pending: this.queue.length > 0 };
    this.listeners.forEach((listener) => listener());
  }
  refresh = (): Promise<void> => {
    if (this.read) return this.read;
    if (this.running || !this.accountId) return Promise.resolve();
    const epoch = this.epoch;
    this.publish({ loading: true });
    this.read = (async () => {
      try {
        const response = await this.request('/api/account/model-preferences', { cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { 'x-account-id': this.accountId } });
        if (!response.ok) throw new Error('Не удалось загрузить настройки моделей.');
        const data = await response.json() as AccountModelPreferences;
        if (data.accountId !== this.accountId) throw new Error('Аккаунт изменился. Обновите страницу.');
        if (epoch === this.epoch) { this.base = data; this.publish({ ready: true, error: '' }); }
      } catch (error) {
        this.publish({ error: error instanceof Error ? error.message : 'Не удалось загрузить настройки моделей.' });
      } finally { this.publish({ loading: false }); }
    })().finally(() => { this.read = null; });
    return this.read;
  };
  change = (change: ModelPreferenceChange) => {
    if (!this.snapshot.ready || !this.accountId) return;
    this.epoch += 1;
    this.queue.push(change);
    this.publish({ error: '' });
    void this.drain();
  };
  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const change = this.queue[0];
      let errorMessage = '';
      try {
        const response = await this.request('/api/account/model-preferences', {
          method: 'PATCH', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/json', 'x-account-id': this.accountId }, body: JSON.stringify(change),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message ?? 'Не удалось сохранить настройки моделей. Повторите действие.');
        if (result.accountId !== this.accountId) throw new Error('Аккаунт изменился. Обновите страницу.');
        this.base = { ...this.base, preferences: { ...this.base.preferences, [change.modality]: result.preference as ModelPreference } };
      } catch (error) { errorMessage = error instanceof Error ? error.message : 'Не удалось сохранить настройки моделей.'; }
      this.queue.shift();
      this.publish({ error: errorMessage });
    }
    this.running = false;
  }
}
