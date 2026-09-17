import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { USAGE_DASHBOARD_SQL } from './usage-dashboard-repository';
import { sumUsage, usagePeriod } from '../core/usage-dashboard';
import type { UsageDashboardRow } from '../contracts/usage-dashboard';

/** Explicit opt-in; all synthetic rows remain uncommitted and are rolled back. No generation is submitted. */
test('PostgreSQL: tenant isolation, revisions, retries, missing usage, outputs and calendar boundaries', {
  skip: !process.env.USAGE_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.USAGE_TEST_DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Usage QA must target a loopback database.');
  const pool = new Pool({ connectionString: url.href, max: 1 });
  const db = await pool.connect();
  const user = `usage-qa-${randomUUID()}`, own = randomUUID(), foreign = randomUUID();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout = '10s'");
    await db.query(`INSERT INTO "user" (id,name,email,terms_accepted_at,terms_version) VALUES ($1,'Usage QA',$2,now(),'qa')`, [user, `${user}@example.test`]);
    for (const id of [own, foreign]) await db.query(`INSERT INTO workspace (id,name,kind,created_by_user_id) VALUES ($1,'Usage QA','team',$2)`, [id, user]);
    async function job(workspace: string, operation: string, status = 'succeeded', finished = '2026-09-11T10:00:00Z', dispatched: string | null = null) {
      const id = randomUUID();
      await db.query(`INSERT INTO generation_job (id,workspace_id,created_by_user_id,provider,model_id,operation,idempotency_key,status,attempt_count,
        created_at,finished_at,provider_dispatched_at,provider_dispatched_attempt) VALUES ($1::uuid,$2,$3,'qa-provider',$4,$4,$1::text,$5,2,'2026-09-10T20:00:00Z',$6,$7,2)`,
      [id, workspace, user, operation, status, finished, dispatched]);
      return id;
    }
    async function event(id: string, workspace: string, operation: string, attempt: number, revision: number, at: string, cost: string | null, total: number | null, succeeded = true) {
      await db.query(`INSERT INTO usage_event (id,workspace_id,generation_job_id,created_by_user_id,provider,model_id,operation,attempt_count,call_index,
        succeeded,occurred_at,provider_cost_usd,input_tokens,output_tokens,total_tokens)
        VALUES ($1,$2,$3,$4,'qa-provider',$5,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $11::numeric IS NULL THEN NULL ELSE 0 END,$11)`,
      [randomUUID(), workspace, id, user, operation, attempt, revision, succeeded, at, cost, total]);
    }
    async function chat(workspace: string | null, product: string, cost: string, tokens: number, status = 'success') {
      const conversation = randomUUID();
      await db.query(`INSERT INTO chat_conversations (id,tenant_id,product_id,user_id,mode) VALUES ($1,$2,$3,$4,'assistant')`, [conversation, workspace, product, user]);
      await db.query(`INSERT INTO chat_llm_calls (id,conversation_id,provider,model,status,prompt_tokens,total_tokens,cost_usd,created_at)
        VALUES ($1,$2,'qa-chat','chat-model',$3,$4,$4,$5,'2026-09-11T10:00:00Z')`, [randomUUID(), conversation, status, tokens, cost]);
    }
    const image = await job(own, 'generate_image', 'succeeded', '2026-09-11T21:00:00Z', '2026-09-10T21:00:00Z');
    await event(image, own, 'generate_image', 1, 0, '2026-09-10T21:00:00Z', '0.10', 3, false);
    await event(image, own, 'generate_image', 2, 0, '2026-09-10T21:00:00Z', null, null);
    // Reconciliation outside the selected period replaces the old value, but does not move the call's day.
    await event(image, own, 'generate_image', 2, 1, '2026-09-15T10:00:00Z', '0.30', 12);
    await job(own, 'generate_speech', 'succeeded', '2026-09-11T10:00:00Z', '2026-09-11T09:00:00Z');
    await job(own, 'generate_video', 'failed', '2026-09-11T10:00:00Z', '2026-09-11T09:00:00Z');
    // Queued local work is not a provider call.
    await job(own, 'generate_video', 'queued');
    const text = await job(own, 'generate_text');
    await event(text, own, 'generate_text', 2, 0, '2026-09-11T10:00:00Z', '0.20', 5);
    const other = await job(foreign, 'generate_video');
    await event(other, foreign, 'generate_video', 2, 0, '2026-09-11T10:00:00Z', '99', 999);
    await chat(own, 'image-production', '0.05', 30);
    await chat(own, 'image-production', '0', 0, 'failed');
    await chat(own, 'other-product', '99', 999);
    await chat(foreign, 'image-production', '50', 500);
    await chat(null, 'image-production', '99', 999);
    async function read(workspace: string, from: string, to = from, timezone = 'Europe/Moscow') {
      const p = usagePeriod(from, to, timezone);
      return (await db.query<UsageDashboardRow>(USAGE_DASHBOARD_SQL, [workspace, p.start, p.end, p.timezone])).rows;
    }
    const rows = await read(own, '2026-09-11');
    const total = sumUsage(rows);
    assert.equal(total.requests, 7);
    assert.equal(total.succeeded, 3);
    assert.equal(total.failed, 2);
    assert.equal(total.unconfirmed, 2);
    assert.equal(total.costUsd, '0.65000000');
    assert.equal(total.totalTokens, '50');
    assert.equal(total.unknownCostRequests, 3);
    assert.equal(total.unknownTokenRequests, 3);
    assert.deepEqual([total.images, total.texts, total.audio, total.video], [0, 1, 1, 0]);
    assert.ok(rows.every((r) => r.day === '2026-09-11'));
    const nextDay = sumUsage(await read(own, '2026-09-12'));
    assert.equal(nextDay.images, 1);
    assert.equal(nextDay.requests, 0);
    assert.equal(sumUsage(await read(own, '2026-09-15')).requests, 0);
    assert.equal(sumUsage(await read(own, '2026-09-10', '2026-09-10', 'UTC')).requests, 2);
    const foreignTotal = sumUsage(await read(foreign, '2026-09-11'));
    assert.equal(foreignTotal.requests, 2);
    assert.equal(foreignTotal.costUsd, '149.00000000');
    assert.equal(foreignTotal.video, 1);
    assert.deepEqual(await read(randomUUID(), '2026-09-11'), []);
    // The half-open elapsed cutoff applies equally to events, fallback dispatches, chat and outputs.
    const bounds = usagePeriod('2026-09-11', '2026-09-11');
    const beforeTen = sumUsage((await db.query<UsageDashboardRow>(USAGE_DASHBOARD_SQL, [own, bounds.start, '2026-09-11T10:00:00Z', bounds.timezone])).rows);
    assert.equal(beforeTen.requests, 4); // Two midnight attempts and two 09:00 dispatches, no 10:00 text/chat calls.
    assert.equal(beforeTen.costUsd, '0.40000000');
    assert.deepEqual([beforeTen.images, beforeTen.texts, beforeTen.audio, beforeTen.video], [0, 0, 0, 0]);
    const noElapsedTime = (await db.query<UsageDashboardRow>(USAGE_DASHBOARD_SQL, [own, bounds.start, bounds.start, bounds.timezone])).rows;
    assert.deepEqual(noElapsedTime, []);
  } finally {
    await db.query('ROLLBACK');
    db.release();
    await pool.end();
  }
});
