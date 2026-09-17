import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { readAccountModelPreferences, writeModelPreferenceInTransaction } from './model-preference-repository';
import { ModelPreferenceConflict } from '@/shared/model-preferences/contracts';

test('PostgreSQL: favorites and popularity isolate accounts, aggregate workspaces and count each successful job once', {
  skip: !process.env.MODEL_PREFERENCES_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.MODEL_PREFERENCES_TEST_DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  const pool = new Pool({ connectionString: url.href, max: 1 });
  const db = await pool.connect();
  const alice = `model-qa-${randomUUID()}`, bob = `model-qa-${randomUUID()}`;
  const first = randomUUID(), second = randomUUID();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL statement_timeout = '10s'");
    for (const id of [alice, bob]) await db.query(`INSERT INTO "user" (id,name,email,terms_accepted_at,terms_version) VALUES ($1,'Model QA',$2,now(),'qa')`, [id, `${id}@example.test`]);
    for (const id of [first, second]) await db.query(`INSERT INTO workspace (id,name,kind,created_by_user_id) VALUES ($1,'Model QA','team',$2)`, [id, alice]);
    async function job(user: string, space: string, operation: string, status = 'succeeded', model = 'p/model', service: string | null = null) {
      const id = randomUUID();
      await db.query(`INSERT INTO generation_job (id,workspace_id,created_by_user_id,provider,model_id,operation,idempotency_key,status,attempt_count,service_client_id)
        VALUES ($1::uuid,$2,$3,'openrouter',$4,$5,$1::text,$6,3,$7)`, [id, space, user, model, operation, status, service]);
      return id;
    }
    const id = await job(alice, first, 'generate_image');
    // Several ledger entries, including failed attempts, must not multiply the job count.
    for (let attempt = 1; attempt <= 3; attempt++) await db.query(`INSERT INTO usage_event
      (id,workspace_id,generation_job_id,created_by_user_id,provider,model_id,operation,attempt_count,call_index,succeeded)
      VALUES ($1,$2,$3,$4,'openrouter','p/model','generate_image',$5,0,$6)`, [randomUUID(), first, id, alice, attempt, attempt === 3]);
    await job(alice, second, 'edit_image');
    await job(alice, first, 'generate_image', 'failed');
    await job(alice, first, 'generate_image', 'queued');
    await job(bob, first, 'generate_image');
    await job(alice, first, 'generate_video');
    await job(alice, first, 'generate_speech_long');
    await job(alice, first, 'transcribe_audio');
    await job(alice, first, 'generate_text');
    await job(alice, first, 'analyze_image');
    await job(alice, first, 'generate_image', 'succeeded', 'openrouter/auto');
    const service = randomUUID();
    await db.query(`INSERT INTO runtime_service_client (id,workspace_id,source_application,external_workspace_ref,display_name,scopes,created_by_user_id) VALUES ($1,$2,'model-qa','qa','Model QA','[]'::jsonb,$3)`, [service, first, alice]);
    await job(alice, first, 'generate_image', 'succeeded', 'p/model', service);
    let p = await writeModelPreferenceInTransaction(db, alice, { modality: 'image', action: 'favorite', modelId: 'p/first', favorite: true });
    p = await writeModelPreferenceInTransaction(db, alice, { modality: 'image', action: 'favorite', modelId: 'p/second', favorite: true });
    await writeModelPreferenceInTransaction(db, alice, { modality: 'video', action: 'tab', tab: 'popular' });
    await writeModelPreferenceInTransaction(db, alice, { modality: 'image', action: 'reorder', favorites: ['p/second', 'p/first'], expectedRevision: p.revision });
    await assert.rejects(writeModelPreferenceInTransaction(db, alice, { modality: 'image', action: 'reorder', favorites: ['p/first', 'p/second'], expectedRevision: p.revision }), ModelPreferenceConflict);
    const own = await readAccountModelPreferences(alice, db), other = await readAccountModelPreferences(bob, db);
    assert.deepEqual(own.preferences.image.favorites, ['p/second', 'p/first']);
    assert.equal(own.preferences.image.tab, 'all'); assert.equal(own.preferences.video.tab, 'popular');
    assert.deepEqual(other.preferences.image.favorites, []);
    assert.deepEqual(own.popularity, { image: { 'p/model': 2 }, video: { 'p/model': 1 }, audio: { 'p/model': 2 }, text: { 'p/model': 2 } });
    assert.deepEqual(other.popularity.image, { 'p/model': 1 });
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
});
