'use client';

import { trackBehavior } from '@/shared/analytics/client';
import { createContext, Suspense, useCallback, useContext, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PublicBillingConfig, SubscriptionRequest } from '@/shared/billing/catalog';
import { readSubscriptionRoute, subscriptionHref } from '../model/subscription-route';

// The native dialog portal needs document.body, including when opened from a direct URL.
const SubscriptionSheet = dynamic(() => import('./subscription-sheet').then((module) => module.SubscriptionSheet), { ssr: false });

const Context = createContext<((request?: SubscriptionRequest) => void) | null>(null);
export function useSubscriptions() {
  const open = useContext(Context);
  if (!open) throw new Error('SubscriptionProvider is required');
  return open;
}

export function SubscriptionProvider({ children, config }: { children: ReactNode; config: PublicBillingConfig }) {
  const open = useCallback((request: SubscriptionRequest = {}) => {
    trackBehavior('ip_topup_clicked', { source: request.source ?? 'direct' });
    const current = new URL(window.location.href);
    if (readSubscriptionRoute(current.searchParams)) replaceSubscriptionRoute(request);
    else window.history.pushState({ reverieBillingReturn: subscriptionHref(current, null) }, '', subscriptionHref(current, request));
  }, []);
  return <Context.Provider value={open}>{children}<Suspense fallback={null}><SubscriptionRoute config={config} /></Suspense></Context.Provider>;
}

function replaceSubscriptionRoute(request: SubscriptionRequest) {
  window.history.replaceState({ reverieBillingReturn: window.history.state?.reverieBillingReturn }, '', subscriptionHref(new URL(window.location.href), request));
}

function closeSubscriptionRoute() {
  const destination = subscriptionHref(new URL(window.location.href), null);
  if (window.history.state?.reverieBillingReturn === destination && window.history.length > 1) window.history.back();
  else window.history.replaceState(null, '', destination);
}

function SubscriptionRoute({ config }: { config: PublicBillingConfig }) {
  const params = useSearchParams(), pathname = usePathname();
  const request = params ? readSubscriptionRoute(params) : null;
  return request ? <SubscriptionSheet key={pathname} request={request} config={config}
    onRequestChange={replaceSubscriptionRoute} onClose={closeSubscriptionRoute} /> : null;
}
