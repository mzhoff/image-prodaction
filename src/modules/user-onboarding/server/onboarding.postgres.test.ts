import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';
import { emptyOnboarding } from '@/shared/onboarding/contract';

test('local HTTP flow: authenticated gate, autosave, revision conflict, completion and account isolation', {
  skip: process.env.RUN_ONBOARDING_POSTGRES !== '1',
}, async () => {
  const connectionString = process.env.DATABASE_URL!;
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(connectionString).hostname), 'Use a local test database only');
  const pool = new Pool({ connectionString });
  const id = `onboarding-qa-${randomUUID()}`, password = randomUUID();
  const target = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3004');
  assert.ok(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname), 'Use a local test server only');
  const origin = target.origin;
  try {
    await pool.query(`INSERT INTO "user" (id,name,email,email_verified,terms_accepted_at,terms_version)
      VALUES ($1,'Onboarding QA',$2,true,now(),'test')`, [id, `${id}@example.invalid`]);
    await pool.query(`INSERT INTO account (id,account_id,provider_id,user_id,password) VALUES ($1,$1,'credential',$1,$2)`, [id, await hashPassword(password)]);
    const signedIn = await fetch(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: `${id}@example.invalid`, password }) });
    assert.equal(signedIn.status, 200, 'Synthetic local account signs in through the real auth endpoint');
    const cookie = signedIn.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
    assert.ok(cookie);
    const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'x-account-id': id };
    const initialResponse = await fetch(`${origin}/api/account/onboarding`, { headers });
    assert.equal(initialResponse.status, 200);
    const initialState = await initialResponse.json();
    assert.equal(initialState.userId, id);
    assert.equal(initialState.legacyExempt, false);
    assert.equal(initialState.completedAt, null);
    const blocked = await fetch(`${origin}/library`, { headers, redirect: 'manual' });
    assert.equal(blocked.status, 307, `New profile redirects before workspace render (location: ${blocked.headers.get('location')}, request id: ${Boolean(blocked.headers.get('x-request-id'))})`);
    assert.equal(new URL(blocked.headers.get('location')!, origin).pathname, '/onboarding');
    const state = emptyOnboarding(id, 'Onboarding QA');
    const change = { revision: 0, step: state.step, answers: state.answers, locale: 'ru', theme: 'light', returnTo: '/library' };
    const patch = (value: object, account = id) => fetch(`${origin}/api/account/onboarding`, { method: 'PATCH', headers: { ...headers, 'x-account-id': account }, body: JSON.stringify(value) });
    assert.equal((await patch(change, 'another-account')).status, 409);
    const incomplete = await patch({ ...change, complete: true });
    assert.equal(incomplete.status, 422, JSON.stringify((await incomplete.json()).error));
    const saved = await patch({ ...change, step: 'work', answers: { ...state.answers, age: '25_34', role: 'design',
      work: 'company', team: '2_3', industry: 'other', industryOther: 'Архитектура' } });
    assert.equal(saved.status, 200);
    const draft = await saved.json();
    assert.equal(draft.revision, 1);
    assert.equal((await patch(change)).status, 409);
    assert.equal((await fetch(`${origin}/api/auth/sign-out`, { method: 'POST', headers, body: '{}' })).status, 200);
    const resumed = await fetch(`${origin}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ email: `${id}@example.invalid`, password }) });
    assert.equal(resumed.status, 200);
    headers.Cookie = resumed.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
    const restored = await (await fetch(`${origin}/api/account/onboarding`, { headers })).json();
    assert.equal(restored.step, 'work'); assert.equal(restored.answers.role, 'design');
    assert.equal(restored.answers.industryOther, 'Архитектура');
    assert.equal(restored.answers.company, '');
    const complete = await patch({ ...change, revision: 1, step: 'experience', complete: true,
      answers: { ...draft.answers, work: 'personal', team: 'solo', goals: ['learning'], tasks: ['slides'],
        experience: 'new', agents: 'heard', tools: ['chatgpt', 'antigravity'], automation: 'new' } });
    assert.equal(complete.status, 200);
    const finished = await complete.json();
    assert.ok(finished.completedAt);
    assert.equal(finished.returnTo, '/library');
    assert.equal(finished.answers.industryOther, '');
    const allowed = await fetch(`${origin}/library`, { headers, redirect: 'manual' });
    assert.equal(allowed.status, 200);
    const count = await pool.query('SELECT count(*)::int AS n FROM workspace WHERE created_by_user_id=$1', [id]);
    assert.equal(count.rows[0].n, 1, 'Retries create only one personal workspace');
  } finally {
    await pool.query('DELETE FROM workspace WHERE created_by_user_id=$1', [id]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
    await pool.end();
  }
});
