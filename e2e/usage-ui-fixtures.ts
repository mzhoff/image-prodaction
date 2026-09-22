import type { Page } from '@playwright/test';
import { Pool } from 'pg';
import { emptyUsage, usagePeriod } from '../src/modules/usage/core/usage-dashboard';
import { usageComparisonWindow } from '../src/modules/usage/core/usage-periods';
import { createFallbackCatalog } from '../src/shared/api/openrouter-models';
import type { UsageDashboardRow } from '../src/modules/usage/contracts/usage-dashboard';

export async function usageUiFixtures(page: Page, ownId: string, otherId: string) {
  const state = { remaining: 42.5 as number | null, balanceError: false, usageError: false, disconnected: false, delayA: false,
    releaseA: undefined as (() => void) | undefined, startedA: undefined as (() => void) | undefined };
  await page.route('**/api/workspaces', (route) => route.fulfill({ json: { workspaces: [
    { id: ownId, name: 'Usage QA · Studio A' }, { id: otherId, name: 'Usage QA · Studio B' },
  ] } }));
  await page.route('**/api/workspaces/*/folders', (route) => route.fulfill({ json: { folders: [] } }));
  await page.route('**/api/ai/models', (route) => route.fulfill({ json: createFallbackCatalog() }));
  await page.route('**/api/ai/video-models', (route) => route.fulfill({ json: { models: [{ key: 'google/veo-3.1', label: 'Google: Veo 3.1' }] } }));
  await page.route('**/api/ai/balance?*', (route) => route.fulfill(state.balanceError
    ? { status: 503, json: { error: { code: 'unavailable' } } }
    : state.disconnected ? { status: 409, json: { error: { code: 'provider_not_configured' } } }
    : { json: { remaining: new URL(route.request().url()).searchParams.get('workspaceId') === ownId ? state.remaining : 7,
      limit: 100, spentFromLimit: 57.5, limitReset: null, updatedAt: new Date().toISOString() } }));
  await page.route('**/api/workspaces/*/usage?*', async (route) => {
    if (state.usageError) { await route.fulfill({ status: 503, json: { error: { message: 'Статистика временно недоступна' } } }); return; }
    const url = new URL(route.request().url()), workspaceId = url.pathname.split('/')[3]!;
    const period = usagePeriod(url.searchParams.get('from'), url.searchParams.get('to'), url.searchParams.get('timezone')!);
    const rows: UsageDashboardRow[] = workspaceId === ownId ? [
      { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'google/gemini-2.5-flash-image', category: 'image', requests: 6, succeeded: 5, failed: 1, images: 5, inputTokens: '1000', outputTokens: '200', totalTokens: '1200', costUsd: '1.50000000' },
      { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'openai/gpt-5-mini', category: 'text', requests: 4, succeeded: 4, texts: 4, inputTokens: '2000', outputTokens: '500', totalTokens: '2500', costUsd: '0.25000000' },
      { ...emptyUsage(), day: period.from, provider: 'openrouter', modelId: 'x-ai/grok-voice-tts-1.0', category: 'audio', requests: 2, succeeded: 2, audio: 2, inputTokens: '100', outputTokens: '200', totalTokens: '300', costUsd: '0.25000000' },
      { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'google/veo-3.1', category: 'video', requests: 3, succeeded: 2, unconfirmed: 1, video: 2, unknownCostRequests: 1, unknownTokenRequests: 3, costUsd: '3.00000000' },
      { ...emptyUsage(), day: period.to, provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4.5', category: 'assistant', requests: 5, succeeded: 5, inputTokens: '900', outputTokens: '100', totalTokens: '1000', costUsd: '0.10000000' },
    ] : [];
    if (state.delayA && workspaceId === ownId) await new Promise<void>((resolve) => { state.releaseA = resolve; state.startedA?.(); });
    const comparison = usageComparisonWindow(period);
    const previousRows = rows.map((r) => ({ ...r, day: comparison.period.to, requests: 2, succeeded: 2, failed: 0,
      costUsd: r.modelId === 'openai/gpt-5-mini' ? '0.12500000' : r.costUsd }));
    await route.fulfill({ json: { workspaceId, period, generatedAt: new Date().toISOString(), rows, comparison: { ...comparison, rows: previousRows } } }).catch(() => { /* Superseded Workspace request was aborted. */ });
  });
  return state;
}

export async function removeUsageQaOwner(workspaceId: string, label: string) {
  const connectionString = process.env.USAGE_TEST_DATABASE_URL;
  if (!connectionString || !['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname)) throw new Error('Local QA database required for fixture cleanup');
  const pool = new Pool({ connectionString });
  try {
    const owner = (await pool.query('select u.id from "user" u join workspace w on w.created_by_user_id=u.id where w.id=$1 and u.name=$2', [workspaceId, `Audio Runtime QA ${label}`])).rows[0];
    if (owner) { await pool.query('delete from workspace where id=$1 and created_by_user_id=$2', [workspaceId, owner.id]); await pool.query('delete from "user" where id=$1 and name=$2', [owner.id, `Audio Runtime QA ${label}`]); }
  } finally { await pool.end(); }
}
