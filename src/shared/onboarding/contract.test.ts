import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyOnboarding, normalizeAnswers, onboardingChangeSchema, ONBOARDING_STEPS, stepMissing } from './contract';

test('new account needs answers; company name is never required', () => {
  const { answers } = emptyOnboarding('qa');
  assert.deepEqual(stepMissing('about', answers), ['name', 'age', 'role']);
  assert.deepEqual(stepMissing('work', { ...answers, work: 'personal', team: 'solo' }), []);
  assert.deepEqual(stepMissing('work', { ...answers, work: 'company', team: '2_3' }), ['industry']);
});
test('other industry requires a nonblank description and clears when no longer relevant', () => {
  const { answers } = emptyOnboarding('qa');
  const custom = { ...answers, work: 'company' as const, team: '2_3' as const, industry: 'other' as const, industryOther: '   ' };
  assert.deepEqual(stepMissing('work', custom), ['industryOther']);
  assert.deepEqual(stepMissing('work', { ...custom, industryOther: 'Архитектура' }), []);
  assert.equal(normalizeAnswers({ ...custom, industryOther: ' Архитектура ' }).industryOther, 'Архитектура');
  assert.equal(normalizeAnswers({ ...custom, industry: 'it', industryOther: 'Архитектура' }).industryOther, '');
  assert.equal(normalizeAnswers({ ...custom, work: 'personal', industryOther: 'Архитектура' }).industryOther, '');
});
test('profile name is prefilled from the authenticated identity; whitespace is incomplete', () => {
  assert.equal(emptyOnboarding('telegram-user', 'Михаил').answers.name, 'Михаил');
  const { answers } = emptyOnboarding('qa', '   ');
  assert.ok(stepMissing('about', answers).includes('name'));
});
test('old drafts remain readable, but company data is discarded at the API boundary', () => {
  const state = emptyOnboarding('qa');
  const { industryOther: _unused, ...legacyAnswers } = state.answers;
  const parsed = onboardingChangeSchema.parse({ revision: 0, step: 'work', answers: { ...legacyAnswers, company: 'Private name' }, locale: 'ru', theme: 'light' });
  assert.equal(parsed.answers.company, '');
  assert.equal(parsed.answers.industryOther, '');
});
test('switching to personal work clears stale business data; none excludes selected tools', () => {
  const { answers } = emptyOnboarding('qa');
  const result = normalizeAnswers({ ...answers, work: 'personal', company: 'Old company', industry: 'it',
    tools: ['none', 'chatgpt'], toolOther: 'old tool', goals: ['blog', 'blog'] });
  assert.equal(result.company, ''); assert.equal(result.industry, '');
  assert.deepEqual(result.tools, ['none']); assert.equal(result.toolOther, '');
  assert.deepEqual(result.goals, ['blog']);
});
test('five steps accept a complete beginner without company or agents', () => {
  const { answers } = emptyOnboarding('qa', 'QA');
  const completed = { ...answers, age: '25_34' as const, role: 'student' as const, work: 'personal' as const,
    team: 'solo' as const, goals: ['learning' as const], tasks: ['slides' as const], experience: 'new' as const,
    agents: 'new' as const, tools: ['none' as const], automation: 'new' as const };
  assert.equal(ONBOARDING_STEPS.length, 5);
  assert.ok(ONBOARDING_STEPS.every((step) => !stepMissing(step, completed).length));
});
test('draft API accepts empty answers but rejects unknown values, injected fields and oversized text', () => {
  const state = emptyOnboarding('qa');
  const change = { revision: 0, step: state.step, answers: state.answers, locale: state.locale, theme: state.theme };
  assert.ok(onboardingChangeSchema.safeParse(change).success);
  assert.equal(onboardingChangeSchema.safeParse({ ...change, completedAt: new Date().toISOString() }).success, false);
  assert.equal(onboardingChangeSchema.safeParse({ ...change, answers: { ...state.answers, role: 'admin' } }).success, false);
  assert.equal(onboardingChangeSchema.safeParse({ ...change, answers: { ...state.answers, name: 'x'.repeat(161) } }).success, false);
});
