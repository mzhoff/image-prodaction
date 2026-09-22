import type { SubscriptionRequest } from '@/shared/billing/catalog';

export function readSubscriptionRoute(params: Pick<URLSearchParams, 'get'>): SubscriptionRequest | null {
  const tab = params.get('billing');
  if (tab !== 'budget' && tab !== 'plans') return null;
  return { tab, workspaceId: params.get('billingWorkspace') || undefined };
}

/** Keep the underlying document, filters, chat and fragment when opening or closing the sheet. */
export function subscriptionHref(current: URL, request: SubscriptionRequest | null) {
  const url = new URL(current);
  url.searchParams.delete('billing');
  url.searchParams.delete('billingWorkspace');
  if (request) {
    url.searchParams.set('billing', request.tab ?? 'budget');
    if (request.workspaceId) url.searchParams.set('billingWorkspace', request.workspaceId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
