import assert from 'node:assert/strict';
import test from 'node:test';
import { readSubscriptionRoute, subscriptionHref } from './subscription-route';

test('funding defaults to the budget tab and preserves the current document and chat', () => {
  const url = new URL('https://example.test/create?type=image&chat=home%3A123#composer');
  const href = subscriptionHref(url, { workspaceId: 'workspace-1' });
  assert.equal(href, '/create?type=image&chat=home%3A123&billing=budget&billingWorkspace=workspace-1#composer');
  assert.equal(url.searchParams.has('billing'), false);
  assert.deepEqual(readSubscriptionRoute(new URL(href, url).searchParams), { tab: 'budget', workspaceId: 'workspace-1' });
});

test('a direct plans link can switch tabs and workspace without stacking billing parameters', () => {
  const url = new URL('https://example.test/usage?period=week&billing=plans&billingWorkspace=old');
  assert.deepEqual(readSubscriptionRoute(url.searchParams), { tab: 'plans', workspaceId: 'old' });
  const href = subscriptionHref(url, { tab: 'budget', workspaceId: 'new' });
  assert.equal(href, '/usage?period=week&billing=budget&billingWorkspace=new');
});

test('closing removes only billing parameters and keeps the underlying route', () => {
  const url = new URL('https://example.test/projects/flow?assistant=1&billing=budget&billingWorkspace=one#node');
  assert.equal(subscriptionHref(url, null), '/projects/flow?assistant=1#node');
});

test('missing and unknown tabs do not open a sheet; standalone budget links are valid', () => {
  for (const query of ['', 'billing=', 'billing=unknown', 'billingWorkspace=one']) {
    assert.equal(readSubscriptionRoute(new URLSearchParams(query)), null);
  }
  assert.deepEqual(readSubscriptionRoute(new URLSearchParams('billing=budget')), { tab: 'budget', workspaceId: undefined });
  assert.equal(subscriptionHref(new URL('https://example.test/?billing=budget&billingWorkspace=old'), { tab: 'plans' }), '/?billing=plans');
});
