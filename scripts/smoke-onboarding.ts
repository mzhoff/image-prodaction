import assert from 'node:assert/strict';
import { emptyOnboarding, type OnboardingState } from '../src/shared/onboarding/contract.ts';

/** Complete the real first-run contract instead of bypassing it in a fixture account. */
export async function completeSmokeOnboarding(baseUrl: URL, cookie: string, name: string) {
  const headers = { Cookie: cookie, Origin: baseUrl.origin };
  const initial = await fetch(new URL('/api/account/onboarding', baseUrl), { headers });
  assert.equal(initial.status, 200, 'New account onboarding can be read.');
  const state = await initial.json() as OnboardingState;
  assert.equal(state.completedAt, null);
  assert.equal(state.legacyExempt, false);
  assert.ok(state.userId);
  const blocked = await fetch(new URL('/', baseUrl), { headers, redirect: 'manual' });
  assert.equal(blocked.status, 307, 'First workspace entry must require onboarding.');
  assert.equal(new URL(blocked.headers.get('location')!, baseUrl).pathname, '/onboarding');

  const answers = {
    ...emptyOnboarding(state.userId, name).answers,
    age: '25_34', role: 'design', work: 'personal', team: 'solo',
    goals: ['learning'], tasks: ['image'], experience: 'regular',
    agents: 'use', tools: ['chatgpt'], automation: 'templates',
  };
  const completed = await fetch(new URL('/api/account/onboarding', baseUrl), {
    method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', 'x-account-id': state.userId },
    body: JSON.stringify({ revision: state.revision, step: 'experience', answers,
      locale: 'en', theme: 'system', complete: true, returnTo: '/' }),
  });
  assert.equal(completed.status, 200, 'Valid smoke onboarding answers must be persisted.');
  const finished = await completed.json() as OnboardingState;
  assert.ok(finished.completedAt);
  assert.equal(finished.userId, state.userId);
  assert.equal(finished.revision, state.revision + 1);
  const allowed = await fetch(new URL('/', baseUrl), { headers, redirect: 'manual' });
  assert.equal(allowed.status, 200, 'Completed onboarding allows entering Home.');
}
