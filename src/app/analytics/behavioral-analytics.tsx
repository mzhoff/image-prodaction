'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import type { AnalyticsConfig } from '@/shared/analytics/contracts';
import { analyticsModeForOrigin } from '@/shared/analytics/config';
import { analyticsPage } from '@/shared/analytics/routes';
import {
  configureBehavior, setBehaviorContext, markBehaviorReady, failBehavior,
  setBehaviorAudience,
} from '@/shared/analytics/client';

export function BehavioralAnalyticsClient({ config }: { config: AnalyticsConfig }) {
  const pathname = usePathname() ?? '';

  useEffect(() => {
    configureBehavior(config, window.location.origin);
    // Protected pages are already authorized on the server. This anonymous counter
    // must not depend on a second session request (which can be delayed or throttled).
    const anonymous = pathname === '/login' || pathname === '/register';
    setBehaviorContext(anonymous ? null : 'product-page', pathname,
      pathname === '/onboarding' && !window.location.search && !window.location.hash);
  }, [config, pathname]);

  useEffect(() => {
    const page = analyticsPage(pathname);
    if (!page || ['login', 'register'].includes(page.screen)
      || analyticsModeForOrigin(config, window.location.origin) === 'off') return;
    const controller = new AbortController();
    // Optional profile enrichment never delays events, login or onboarding. The backend
    // projects a small allowlist, so personal answers never enter the analytics runtime.
    void fetch('/api/account/analytics-profile', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.ok && !controller.signal.aborted) {
          const value: unknown = await response.json();
          if (!controller.signal.aborted) setBehaviorAudience(value);
        }
      }).catch(() => { /* Analytics is optional. */ });
    return () => controller.abort();
  }, [config, pathname]);

  const live = typeof window !== 'undefined'
    && analyticsModeForOrigin(config, window.location.origin) === 'live';
  if (!live || !analyticsPage(pathname)) return null;
  return (
    <Script
      id="reverie-metrica"
      src="https://mc.yandex.ru/metrika/tag.js"
      strategy="afterInteractive"
      referrerPolicy="no-referrer"
      onReady={markBehaviorReady}
      onError={failBehavior}
    />
  );
}
