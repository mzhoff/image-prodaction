import { analyticsModeForOrigin } from './config';
import { analyticsUserId, BEHAVIOR_EVENTS, sanitizeBehaviorParams } from './contracts';
import type { AnalyticsConfig, BehaviorEvent, BehaviorParams } from './contracts';
import { analyticsPage } from './routes';
import type { AnalyticsPage } from './routes';
import { sanitizeAnalyticsAudience, type AnalyticsAudience } from './audience';

export type AnalyticsCommand = [method: string, ...args: unknown[]];
type Pending = { event: BehaviorEvent; params: BehaviorParams; screen: string }
  | { page: AnalyticsPage; referer: string };

export const METRICA_INIT = {
  defer: true, sendTitle: false, webvisor: false, clickmap: false,
  trackLinks: false, trackHash: false, accurateTrackBounce: false,
  ecommerce: false, disableYtm: true,
} as const;

export class BehavioralAnalytics {
  readonly mode: AnalyticsConfig['mode'];
  private userId: string | null = null;
  private routeKey: string | null = null;
  private page: AnalyticsPage | null = null;
  private queue: Pending[] = [];
  private ready = false;
  private started = false;
  private productOpened = false;
  private failed = false;
  private audience: AnalyticsAudience | null = null;
  private sentAudience = '';
  private recording = false;
  private readonly origin: string;
  private readonly send: (command: AnalyticsCommand) => void;

  constructor(config: AnalyticsConfig, origin: string, send: (command: AnalyticsCommand) => void) {
    this.mode = analyticsModeForOrigin(config, origin);
    this.origin = origin;
    this.send = send;
    this.ready = this.mode === 'debug';
  }

  setContext(rawUserId: string | null, pathname: string, entryParams: BehaviorParams = {}, allowReplay = false) {
    const id = analyticsUserId(rawUserId);
    const page = analyticsPage(pathname);
    const anonymous = page?.screen === 'login' || page?.screen === 'register';
    if ((!id && !anonymous) || !page || this.mode === 'off' || this.failed) { this.stop(); return; }
    if (this.userId && this.userId !== 'anonymous' && id !== this.userId) this.stop();
    // Replay is restricted to the masked questionnaire. Never record editor/chat,
    // login deep links, callbacks, query-bearing routes or preview pages.
    const recording = allowReplay && pathname === '/onboarding';
    if (recording !== this.recording && this.started) {
      this.dispatch(['destruct']); this.started = false; this.sentAudience = '';
    }
    this.recording = recording;
    this.userId = id ?? 'anonymous';
    const routeKey = pathname.split(/[?#]/, 1)[0];
    if (routeKey !== this.routeKey) {
      const referer = this.page ? this.origin + this.page.path : this.origin + '/';
      this.enqueue({ page, referer });
      this.routeKey = routeKey;
    }
    this.page = page;
    if (id && !this.productOpened && !['login', 'register', 'onboarding'].includes(page.screen)) {
      this.productOpened = true;
      this.enqueue({ event: 'ip_app_opened', params: sanitizeBehaviorParams(entryParams), screen: page.screen });
    }
    this.flush();
  }

  track(event: BehaviorEvent, params: BehaviorParams = {}) {
    if (!this.userId || !this.page || this.mode === 'off' || this.failed || !BEHAVIOR_EVENTS.includes(event)) return;
    this.enqueue({ event, params: sanitizeBehaviorParams(params), screen: this.page.screen });
    this.flush();
  }

  get canTrack() { return Boolean(this.userId && this.page && !this.failed && this.mode !== 'off'); }

  setAudience(input: unknown) {
    if (!this.canTrack || this.userId === 'anonymous') return;
    const audience = sanitizeAnalyticsAudience(input);
    if (!audience) return;
    if (this.audience && this.audience.userId !== audience.userId) {
      // A different signed-in account must not inherit the previous account's pending actions.
      this.queue = [];
      if (this.started) this.dispatch(['destruct']);
      this.started = false;
      this.sentAudience = '';
    }
    this.audience = audience;
    this.flush();
  }

  markReady() { this.ready = true; this.flush(); }

  stop() {
    if (this.started) this.dispatch(['destruct']);
    this.started = false;
    this.productOpened = false;
    this.userId = null;
    this.routeKey = null;
    this.page = null;
    this.queue = [];
    this.audience = null;
    this.sentAudience = '';
    this.recording = false;
  }

  fail() { this.stop(); this.failed = true; }

  private enqueue(item: Pending) {
    if (this.queue.length < 100) this.queue.push(item);
  }

  private dispatch(command: AnalyticsCommand): boolean {
    try { this.send(command); return true; }
    catch { this.failed = true; this.queue = []; return false; }
  }

  private flush() {
    if (!this.ready || !this.userId || this.failed || this.mode === 'off') return;
    if (!this.started) {
      if (!this.dispatch(['init', { ...METRICA_INIT, webvisor: this.recording }])) return;
      this.started = true;
    }
    if (this.audience && this.sentAudience !== JSON.stringify(this.audience)) {
      if (!this.dispatch(['setUserID', this.audience.userId])) return;
      if (!this.dispatch(['userParams', { UserID: this.audience.userId, reverie: this.audience.params }])) return;
      // Snapshot categories on the visit as well: userParams applies the latest profile to history.
      if (!this.dispatch(['params', { audience: this.audience.params }])) return;
      this.sentAudience = JSON.stringify(this.audience);
    }
    while (this.queue.length && !this.failed) {
      const item = this.queue.shift()!;
      const common = {
        product: 'image-production', event_schema: 2,
        environment: this.mode === 'debug' ? 'local' : 'beta',
      };
      if ('page' in item) {
        this.dispatch(['hit', this.origin + item.page.path, {
          title: item.page.title, referer: item.referer,
          params: { ...common, screen: item.page.screen },
        }]);
      } else {
        this.dispatch(['reachGoal', item.event, { ...common, screen: item.screen, ...item.params }]);
      }
    }
  }
}
