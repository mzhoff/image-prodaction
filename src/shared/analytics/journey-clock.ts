export interface ClockState { started: number; active: number }
export type ClockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const MAX = 30 * 86400_000;
/** Only timestamps/durations; never form values or identity data. */
export class JourneyClock {
  private state: ClockState;
  private last: number;
  private foreground = false;
  private stepStart: number;
  private stepActive = 0;
  private key: string; private storage?: ClockStorage; private now: () => number;
  constructor(key: string, storage?: ClockStorage, now = Date.now) {
    this.key = key; this.storage = storage; this.now = now;
    const time = now();
    this.state = { started: time, active: 0 };
    try {
      const saved = JSON.parse(storage?.getItem(key) ?? 'null');
      if (saved && Number.isFinite(saved.started) && saved.started <= time && time - saved.started <= MAX
        && Number.isFinite(saved.active) && saved.active >= 0 && saved.active <= time - saved.started) this.state = saved;
    } catch { /* Storage is optional. */ }
    this.last = time; this.stepStart = time;
  }
  private tick() {
    const time = this.now();
    // Heartbeat runs every 5s. Suspension/closed-document gaps are not active time.
    const delta = Math.max(0, Math.min(time - this.last, 6000));
    if (this.foreground) { this.state.active += delta; this.stepActive += delta; }
    this.last = time;
    try { this.storage?.setItem(this.key, JSON.stringify(this.state)); } catch { /* Optional. */ }
  }
  visible(value: boolean) { this.tick(); this.foreground = value; }
  step() { this.tick(); this.stepStart = this.now(); this.stepActive = 0; }
  metrics() {
    this.tick();
    return { elapsed_ms: Math.max(0, this.now() - this.state.started), active_ms: this.state.active,
      step_elapsed_ms: Math.max(0, this.now() - this.stepStart), step_active_ms: this.stepActive };
  }
  clear() { try { this.storage?.removeItem(this.key); } catch { /* Optional. */ } }
}
