import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { DOCUMENT_USAGE_SQL } from './document-usage-repository';

/** Temporary copies of the live schema; no user records or persisted fixtures are changed. */
test('document ledger: all sessions and members, document/tenant isolation, revisions, retries and assistant costs', {
  skip: !process.env.USAGE_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.USAGE_TEST_DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const pool = new Pool({ connectionString: url.href, max: 1 });
  const db = await pool.connect();
  const workspace = randomUUID(), otherWorkspace = randomUUID(), document = randomUUID(), otherDocument = randomUUID();
  const startedAt = '2026-09-21T10:00:00Z', end = '2026-09-21T11:00:00Z';
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout = '10s'");
    for (const table of ['usage_event', 'generation_job', 'chat_llm_calls', 'chat_conversations', 'chat_document_conversation']) {
      await db.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    async function call(operation: string, cost: string | null, options: {
      workspace?: string; document?: string; user?: string; at?: string; job?: string; attempt?: number; revision?: number;
    } = {}) {
      const job = options.job ?? randomUUID();
      await db.query(`INSERT INTO usage_event (id,workspace_id,document_id,generation_job_id,created_by_user_id,provider,model_id,operation,
        attempt_count,call_index,succeeded,occurred_at,provider_cost_usd)
        VALUES ($1,$2,$3,$4,$5,'test','test',$6,$7,$8,true,$9,$10)`,
      [randomUUID(), options.workspace ?? workspace, options.document ?? document, job, options.user ?? 'own', operation,
        options.attempt ?? 1, options.revision ?? 0, options.at ?? startedAt, cost]);
      return job;
    }
    async function chat(cost: string, options: { workspace?: string; document?: string; user?: string; product?: string; bound?: boolean; at?: string } = {}) {
      const id = randomUUID(), tenant = options.workspace ?? workspace, user = options.user ?? 'own';
      await db.query(`INSERT INTO chat_conversations(id,tenant_id,product_id,user_id,mode) VALUES($1,$2,$3,$4,'assistant')`,
        [id, tenant, options.product ?? 'image-production', user]);
      await db.query(`INSERT INTO chat_llm_calls(id,conversation_id,provider,model,status,total_tokens,cost_usd,created_at)
        VALUES($1,$2,'test','test','success',10,$3,$4)`, [randomUUID(), id, cost, options.at ?? startedAt]);
      if (options.bound !== false) await db.query(`INSERT INTO chat_document_conversation(id,workspace_id,document_id,user_id,conversation_id)
        VALUES($1,$2,$3,$4,$5)`, [randomUUID(), tenant, options.document ?? document, user, id]);
    }
    const image = await call('generate_image', '0.10');
    await call('generate_image', '0.25', { job: image, revision: 1, at: '2026-09-22T12:00:00Z' }); // Later reconciliation.
    await call('generate_image', '0.15', { job: image, attempt: 2 }); // Separate physical retry.
    const old = await call('generate_image', '0.08', { at: '2026-09-21T09:00:00Z' });
    await call('generate_image', '0.12', { job: old, revision: 1 }); // Latest reconciliation replaces the earlier cost, including prior sessions.
    await call('generate_text', '0.02');
    await call('generate_speech', '0.10');
    await call('generate_video', null);
    await call('generate_text', '99', { document: otherDocument });
    await call('generate_text', '0.04', { user: 'other' });
    await call('generate_text', '99', { workspace: otherWorkspace });
    await call('generate_text', '99', { at: end }); // Exclusive upper bound.
    const unobserved = randomUUID();
    await db.query(`INSERT INTO generation_job(id,workspace_id,document_id,created_by_user_id,provider,model_id,operation,idempotency_key,
      status,attempt_count,provider_dispatched_attempt,provider_dispatched_at) VALUES($1::uuid,$2,$3,'own','test','test','generate_video',$1::text,'running',1,1,$4)`,
      [unobserved, workspace, document, startedAt]);
    // A call started in an earlier browser session still belongs to this document.
    const priorSession = randomUUID();
    await db.query(`INSERT INTO generation_job(id,workspace_id,document_id,created_by_user_id,provider,model_id,operation,idempotency_key,
      status,attempt_count,provider_dispatched_attempt,provider_dispatched_at) VALUES($1::uuid,$2,$3,'own','test','test','generate_video',$1::text,'succeeded',1,1,'2026-09-21T09:00:00Z')`,
      [priorSession, workspace, document]);
    await call('generate_video', '0.30', { job: priorSession });
    await chat('0.03');
    await chat('0.05', { user: 'other' });
    await chat('99', { workspace: otherWorkspace });
    await chat('99', { document: otherDocument });
    await chat('99', { product: 'other' });
    await chat('99', { bound: false });
    await chat('0.06', { at: '2026-09-21T09:00:00Z' });
    const read = (doc = document) => db.query(DOCUMENT_USAGE_SQL, [workspace, end, doc]);
    const rows = (await read()).rows;
    assert.deepEqual(rows.find((r) => r.category === null), { category: null, requests: 12, costUsd: '1.12000000', unknownCostRequests: 2 });
    assert.deepEqual(rows.find((r) => r.category === 'text'), { category: 'text', requests: 2, costUsd: '0.06000000', unknownCostRequests: 0 });
    assert.equal(rows.find((r) => r.category === 'video').costUsd, '0.30000000');
    assert.deepEqual(rows.find((r) => r.category === 'assistant'), { category: 'assistant', requests: 3, costUsd: '0.14000000', unknownCostRequests: 0 });
    assert.equal(rows.find((r) => r.category === 'image').requests, 3);
    assert.deepEqual((await read(randomUUID())).rows, [{ category: null, requests: 0, costUsd: '0', unknownCostRequests: 0 }]);
    assert.deepEqual((await read()).rows, rows, 'reopening preserves all document costs');
    // A completed observation replaces the unpriced dispatch placeholder, never doubles the request count.
    await call('generate_video', '1.50', { job: unobserved });
    const final = (await read()).rows.find((r) => r.category === null);
    assert.equal(final.requests, 12);
    assert.equal(final.costUsd, '2.62000000');
    assert.equal(final.unknownCostRequests, 1);
  } finally {
    await db.query('ROLLBACK'); db.release(); await pool.end();
  }
});
