import assert from 'node:assert/strict';
import test from 'node:test';
import { createUsageDashboardService } from './usage-dashboard-service';
import { usagePeriod } from '../core/usage-dashboard';

test('membership is checked before any data read, including after access is revoked', async () => {
  const events: string[] = [];
  let allowed = true;
  const period = usagePeriod('2026-09-11', '2026-09-12');
  const periods: typeof period[] = [];
  const get = createUsageDashboardService({
    now: () => new Date('2026-09-12T09:34:00.000Z'),
    authorize: async (user, workspace) => { events.push(`auth:${user}:${workspace}`); if (!allowed) throw new Error('Forbidden'); },
    read: async (workspace, actualPeriod) => { events.push(`read:${workspace}`); periods.push(actualPeriod); return []; },
  });
  const result = await get('user-a', 'workspace-a', period);
  assert.equal(result.workspaceId, 'workspace-a');
  assert.deepEqual(events, ['auth:user-a:workspace-a', 'read:workspace-a', 'read:workspace-a']);
  assert.deepEqual(periods, [{ ...period, end: '2026-09-12T09:34:00.000Z' },
    { ...usagePeriod('2026-09-09', '2026-09-10'), end: '2026-09-10T09:34:00.000Z' }]);
  assert.equal(result.comparison.partial, true);
  assert.equal(result.comparison.available, true);
  assert.deepEqual(result.comparison.rows, []);
  allowed = false;
  await assert.rejects(get('user-a', 'workspace-a', period), /Forbidden/);
  await assert.rejects(get('user-a', 'workspace-b', period), /Forbidden/);
  assert.equal(events.filter((e) => e.startsWith('read')).length, 2);
});

test('the dashboard fails closed when either scoped window cannot be read', async () => {
  const get = createUsageDashboardService({ authorize: async () => {},
    now: () => new Date('2026-09-12T12:00:00Z'),
    read: async (_workspace, window) => { if (window.from === '2026-09-10') throw new Error('Read failed'); return []; },
  });
  await assert.rejects(get('user-a', 'workspace-a', usagePeriod('2026-09-11', '2026-09-11')), /Read failed/);
});
