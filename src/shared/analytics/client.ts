'use client';

import { analyticsPage } from './routes';
import { BehavioralAnalytics } from './engine';
import { sanitizeBehaviorParams } from './contracts';
import type { AnalyticsConfig, BehaviorEvent, BehaviorParams } from './contracts';

type Metrika = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global { interface Window { ym?: Metrika } }

let engine: BehavioralAnalytics | undefined;
let configKey = '';
let counterId: number | null = null;
const initialViews = new Set<BehaviorEvent>(['ip_login_viewed', 'ip_questionnaire_step_viewed', 'ip_topup_viewed', 'ip_tour_opened', 'ip_tour_step_viewed']);
let pendingViews: { event: BehaviorEvent; params: BehaviorParams; path: string; at: number }[] = [];

export function configureBehavior(config: AnalyticsConfig, origin: string) {
  const key = JSON.stringify([config, origin]);
  if (engine && configKey === key) return engine.mode;
  engine?.stop();
  configKey = key;
  counterId = config.counterId;
  engine = new BehavioralAnalytics(config, origin, (command) => {
    if (engine?.mode === 'debug') {
      console.debug('[behavioral-analytics]', JSON.stringify(command));
    } else if (typeof window !== 'undefined' && window.ym && config.counterId) {
      window.ym(config.counterId, ...command);
    }
  });
  if (engine.mode === 'live' && typeof window !== 'undefined' && !window.ym) {
    const stub: Metrika = (...args) => { stub.a?.push(args); };
    stub.a = [];
    stub.l = Date.now();
    window.ym = stub;
  }
  return engine.mode;
}

export function setBehaviorContext(userId: string | null, pathname: string, allowReplay = false) {
  const params: BehaviorParams = {};
  if (engine?.mode !== 'off' && engine) try {
    const key = 'reverie.analytics.entry.v1';
    const start = Number(sessionStorage.getItem(key));
    const valid = start > 0 && start <= Date.now() && Date.now() - start < 30 * 86400_000;
    if (!userId && ['/login', '/register'].includes(pathname) && !valid) sessionStorage.setItem(key, String(Date.now()));
    if (userId && analyticsPage(pathname) && !['/onboarding', '/login', '/register'].includes(pathname) && valid) {
      params.elapsed_ms = Date.now() - start; sessionStorage.removeItem(key);
    }
  } catch { /* Optional timing, never an auth dependency. */ }
  engine?.setContext(userId, pathname, params, allowReplay);
  const views = pendingViews; pendingViews = [];
  for (const view of views) {
    if (view.path === pathname && Date.now() - view.at < 10_000) engine?.track(view.event, view.params);
  }
}
export function trackBehavior(event: BehaviorEvent, params?: BehaviorParams) {
  // Analytics must never turn a successful product operation into an error.
  try {
    if (!engine?.canTrack && initialViews.has(event) && engine?.mode !== 'off' && typeof window !== 'undefined') {
      if (pendingViews.length < 20) pendingViews.push({ event, params: sanitizeBehaviorParams(params), path: window.location.pathname, at: Date.now() });
      return;
    }
    engine?.track(event, params);
  } catch { /* best effort */ }
}
export function markBehaviorReady() { engine?.markReady(); }
export function setBehaviorAudience(value: unknown) { engine?.setAudience(value); }
export function stopBehavior() { pendingViews = []; engine?.stop(); }
export function failBehavior() { pendingViews = []; engine?.fail(); }

/** No synthetic ID: an unavailable/blocked counter leaves the bot unattributed. */
export async function getBehaviorAttribution(): Promise<{ clientId: string } | undefined> {
  if (engine?.mode !== 'live' || !counterId || !window.ym) return undefined;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 500);
    try {
      window.ym!(counterId, 'getClientID', (value: unknown) => {
        clearTimeout(timer);
        resolve(typeof value === 'string' && /^\d{1,32}$/.test(value) ? { clientId: value } : undefined);
      });
    } catch { clearTimeout(timer); resolve(undefined); }
  });
}
