import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentUsageService } from './document-usage-service';
const createdAt = '2026-09-17T10:00:00.000Z';
const now = () => new Date('2026-09-21T11:00:00.000Z');

test('document usage derives Workspace from an authorized document without a session or user ledger filter', async () => {
  let allowed = true;
  const events: unknown[] = [];
  const get = createDocumentUsageService({ now,
    document: async (user, document) => { events.push([user, document]); if (!allowed) throw new Error('forbidden'); return { workspaceId: 'actual-workspace', status: 'active', createdAt }; },
    read: async (scope) => { events.push(scope); return [{ category: null, requests: 1, costUsd: '0.00671685', unknownCostRequests: 0 }, { category: 'assistant', requests: 1, costUsd: '0.00671685', unknownCostRequests: 0 }]; },
  });
  const result = await get('user', 'document');
  assert.deepEqual(events, [['user', 'document'], { documentId: 'document', workspaceId: 'actual-workspace', updatedAt: now().toISOString() }]);
  assert.equal(result.total.costUsd, '0.00671685');
  assert.equal(result.createdAt, createdAt);
  assert.equal(result.categories[0].category, 'assistant');
  assert.deepEqual(await get('user', 'document'), result, 'reopening does not reset the total or the start date');
  allowed = false;
  await assert.rejects(get('other-user', 'document'), /forbidden/);
  assert.equal(events.length, 5, 'authorization failure cannot reach the ledger');
});

test('trashed documents never reach the ledger', async () => {
  let reads = 0;
  const get = createDocumentUsageService({ now,
    document: async () => ({ workspaceId: 'workspace', status: 'trash', createdAt }),
    read: async () => { reads++; return []; },
  });
  await assert.rejects(get('user', 'document'));
  assert.equal(reads, 0);
});
