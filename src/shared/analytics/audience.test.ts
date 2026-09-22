import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectAnalyticsAudience, sanitizeAnalyticsAudience } from './audience';
import { BehavioralAnalytics, type AnalyticsCommand } from './engine';

const source = { completedAt: '2026-09-22T00:00:00Z', answers: {
  name: 'Private name', company: 'Private company', goalOther: 'Private free text',
  age: '25_34', role: 'design', work: 'solo', team: 'solo', industry: 'creative',
  experience: 'regular', agents: 'use', automation: 'templates',
  goals: ['design', 'other'], tasks: ['image', 'video'], tools: ['chatgpt'],
} };
test('audience exports only bounded categorical values and internal ID', () => {
  const profile = projectAnalyticsAudience('account-a', source)!;
  assert.equal(profile.userId, 'ip_account-a');
  assert.equal(profile.params.role, 'design');
  assert.equal(profile.params.age_group, '25_34');
  assert.equal(profile.params.tasks_video, 'yes');
  assert.equal(profile.params.tasks_audio, 'no');
  assert.doesNotMatch(JSON.stringify(profile), /Private|name|company|goalOther/);
  assert.deepEqual(sanitizeAnalyticsAudience({ ...profile, email:'private', params:{...profile.params, name:'Private name'} }), profile);
  assert.equal(projectAnalyticsAudience('person@example.test',source),null);
  assert.equal(sanitizeAnalyticsAudience({ userId:'person@example.test',params:profile.params }),null);
});
test('draft, invalid and legacy values do not fabricate questionnaire segments', () => {
  assert.equal(projectAnalyticsAudience('a',{...source,completedAt:null})?.params.role,'unknown');
  assert.equal(projectAnalyticsAudience('a',{legacyExempt:true})?.params.onboarding_status,'legacy');
  assert.equal(projectAnalyticsAudience('a',{...source,answers:{role:'Private answer'}})?.params.role,'unknown');
});
test('profile enrichment waits for SDK, deduplicates, clears on logout and ignores anonymous profile', () => {
  const commands:AnalyticsCommand[]=[];
  const engine=new BehavioralAnalytics({mode:'live',counterId:112833712,allowedHosts:['production.apption.space']},
    'https://production.apption.space', c=>commands.push(c));
  const profile=projectAnalyticsAudience('a',source)!;
  engine.setContext(null,'/login'); engine.setAudience(profile); engine.markReady();
  assert.equal(commands.some(c=>c[0]==='setUserID'),false);
  engine.setContext('product-page','/onboarding'); engine.setAudience(profile); engine.setAudience(profile);
  assert.equal(commands.filter(c=>c[0]==='setUserID').length,1);
  assert.equal(commands.filter(c=>c[0]==='userParams').length,1);
  assert.ok(commands.some(c=>c[0]==='params'));
  engine.setContext(null,'/login');
  assert.equal(commands.at(-2)?.[0],'init');
  engine.setAudience(profile);
  assert.equal(commands.filter(c=>c[0]==='setUserID').length,1);
});
test('profile cannot cross queued account switch, and off mode never sends it', () => {
  const commands:AnalyticsCommand[]=[];
  const engine=new BehavioralAnalytics({mode:'live',counterId:112833712,allowedHosts:['production.apption.space']},
    'https://production.apption.space',c=>commands.push(c));
  engine.setContext('product-page','/'); engine.setAudience(projectAnalyticsAudience('a',source));
  engine.track('ip_document_created'); engine.setAudience(projectAnalyticsAudience('b',source)); engine.markReady();
  assert.equal(commands.some(c=>c[1]==='ip_document_created'),false);
  assert.equal(commands.find(c=>c[0]==='setUserID')?.[1],'ip_b');
  const off=new BehavioralAnalytics({mode:'off',counterId:null,allowedHosts:[]},'https://production.apption.space',c=>commands.push(c));
  const length=commands.length; off.setContext('product-page','/'); off.setAudience(projectAnalyticsAudience('c',source)); off.markReady();
  assert.equal(commands.length,length);
});

test('replay is restricted to the explicitly allowed questionnaire and stops before other pages', () => {
  const commands:AnalyticsCommand[]=[];
  const engine=new BehavioralAnalytics({mode:'live',counterId:112833712,allowedHosts:['production.apption.space']},
    'https://production.apption.space',c=>commands.push(c));
  engine.markReady(); engine.setContext(null,'/login',{},true);
  assert.equal((commands.find(c=>c[0]==='init')![1] as {webvisor:boolean}).webvisor,false);
  engine.setContext('product-page','/onboarding',{},true);
  assert.equal((commands.filter(c=>c[0]==='init').at(-1)![1] as {webvisor:boolean}).webvisor,true);
  engine.setContext('product-page','/projects/private',{},true);
  assert.equal((commands.filter(c=>c[0]==='init').at(-1)![1] as {webvisor:boolean}).webvisor,false);
  engine.setContext('product-page','/onboarding?preview=1',{},true);
  assert.equal((commands.filter(c=>c[0]==='init').at(-1)![1] as {webvisor:boolean}).webvisor,false);
});

test('replay masks the document by default and every questionnaire free-text field', () => {
  const layout = readFileSync(new URL('../../../app/layout.tsx', import.meta.url), 'utf8');
  const form = readFileSync(new URL('../../pages/onboarding/ui/onboarding-page.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<body className="ym-hide-content"/);
  assert.match(form, /<main className="welcome-page ym-show-content"/);
  const inputs = form.match(/<(?:input|textarea)\b[^>]*>/g) ?? [];
  assert.ok(inputs.length > 0);
  for (const input of inputs) {
    assert.match(input, /ym-hide-content/);
    assert.match(input, /ym-disable-keys/);
  }
});
