import assert from 'node:assert/strict';
import test from 'node:test';
import { readAnalyticsConfig, analyticsModeForOrigin } from './config';
import { analyticsUserId, sanitizeBehaviorParams } from './contracts';
import type { BehaviorParams } from './contracts';
import { BehavioralAnalytics } from './engine';
import type { AnalyticsCommand } from './engine';
import { analyticsPage } from './routes';

const live = readAnalyticsConfig({ METRICA_MODE: 'live', METRICA_COUNTER_ID: '12345678' });
const origin = 'https://production.apption.space';
function setup() {
  const commands: AnalyticsCommand[] = [];
  const engine = new BehavioralAnalytics(live, origin, (command) => { commands.push(command); });
  return { engine, commands };
}

test('live collection requires explicit valid config, HTTPS and exact nonlocal host', () => {
  assert.equal(readAnalyticsConfig({ NODE_ENV: 'production' }).mode, 'off');
  assert.equal(readAnalyticsConfig({ METRICA_MODE: 'live' }).mode, 'off');
  for (const id of ['0', '-1', '1e8', '123bad', '99999999999999999']) {
    assert.equal(readAnalyticsConfig({ METRICA_MODE: 'live', METRICA_COUNTER_ID: id }).mode, 'off');
  }
  assert.equal(analyticsModeForOrigin(live, origin), 'live');
  for (const url of ['http://production.apption.space', 'https://id.apption.space',
    'https://production.apption.space.evil.test', 'http://localhost:7310', 'http://127.0.0.1:3004']) {
    assert.equal(analyticsModeForOrigin(live, url), 'off');
  }
  const debug = readAnalyticsConfig({ NODE_ENV: 'development' });
  assert.equal(analyticsModeForOrigin(debug, 'http://localhost:7310'), 'debug');
  assert.equal(analyticsModeForOrigin(debug, origin), 'off');
});

test('paths and parameters cannot forward OAuth, personal data or document contents', () => {
  for (const path of ['/reset-password?token=secret', '/api/auth/callback', '/check-email?email=secret', '/unknown/private']) {
    assert.equal(analyticsPage(path), null);
  }
  const page = analyticsPage('/projects/secret-document?email=private#token');
  assert.equal(page?.path, '/projects/:document');
  assert.equal(analyticsPage('/library/private-asset')?.path, '/library/:asset');
  assert.deepEqual(analyticsPage('/flows?folderId=private&q=private-name'), {
    path: '/flows', title: 'Image Production · flows', screen: 'flows',
  });
  const params = sanitizeBehaviorParams({
    source: 'editor', node_type: 'generateImage', operation: 'generate_image',
    prompt: 'private prompt', email: 'user@private.test', app_user_id: 'impersonation',
  } as BehaviorParams);
  assert.deepEqual(params, { source: 'editor', node_type: 'generateImage', operation: 'generate_image' });
  assert.deepEqual(sanitizeBehaviorParams({ source: 'private name', operation: 'secret', node_type: 'secret' }), { node_type: 'other' });
  assert.equal(analyticsUserId('user@private.test'), null);
});

test('authenticated events wait for SDK, identity precedes delivery, duplicate render is silent', () => {
  const { engine, commands } = setup();
  engine.track('ip_document_created'); // No user context: cannot attach to the next account.
  engine.setContext('account-a', '/projects/private-id?token=private');
  engine.setContext('account-a', '/projects/private-id?token=other');
  engine.track('ip_node_added', { node_type: 'generateImage', source: 'editor' });
  assert.equal(commands.length, 0);
  engine.markReady();
  assert.deepEqual(commands.map((command) => command[0]), ['init', 'hit', 'reachGoal', 'reachGoal']);
  assert.equal(JSON.stringify(commands).includes('account-a'), false);
  assert.equal(commands[1][1], origin + '/projects/:document');
  assert.equal(commands[2][1], 'ip_app_opened');
  assert.equal(JSON.stringify(commands).includes('private'), false);
  engine.markReady();
  engine.setContext('account-a', '/projects/private-id');
  assert.equal(commands.length, 4);
  engine.setContext('account-a', '/projects/different-id');
  assert.equal(commands.filter((command) => command[0] === 'hit').length, 2);
});

test('logout and account switching drop pending events instead of relabelling them', () => {
  const { engine, commands } = setup();
  engine.setContext('account-a', '/');
  engine.track('ip_document_created');
  engine.setContext('account-b', '/usage');
  engine.markReady();
  assert.equal(JSON.stringify(commands).includes('account-a'), false);
  assert.equal(commands.some((command) => command[1] === 'ip_document_created'), false);
  engine.stop();
  assert.equal(commands.at(-1)?.[0], 'destruct');
  const length = commands.length;
  engine.track('ip_assistant_message_sent');
  engine.setContext(null, '/');
  assert.equal(commands.length, length);
  engine.setContext('account-c', '/');
  assert.deepEqual(commands.slice(length, length + 2).map((command) => command.slice(0, 2)), [
    ['init', commands[length][1]], ['hit', origin + '/'],
  ]);
});

test('auth or unknown routes stop collection even if a cached session is present', () => {
  const { engine, commands } = setup();
  engine.markReady();
  engine.setContext('account-a', '/');
  engine.setContext('account-a', '/api/auth/callback?state=private');
  const length = commands.length;
  engine.track('ip_document_created');
  assert.equal(commands.at(-1)?.[0], 'destruct');
  assert.equal(commands.length, length);
});

test('blocked SDK and broken transport do not throw or retain an unbounded queue', () => {
  const { engine, commands } = setup();
  engine.setContext('account-a', '/');
  for (let index = 0; index < 500; index++) engine.track('ip_node_added');
  engine.markReady();
  assert.equal(commands.length, 101); // At most 100 pending records plus init.
  const broken = new BehavioralAnalytics(live, origin, () => { throw new Error('blocked'); });
  assert.doesNotThrow(() => {
    broken.setContext('account-a', '/');
    broken.markReady();
    broken.track('ip_document_created');
    broken.stop();
  });
  const failed = setup();
  failed.engine.setContext('account-a', '/');
  failed.engine.fail();
  failed.engine.markReady();
  assert.equal(failed.commands.length, 0);
});


test('anonymous entry joins authenticated visit without exporting account identifiers', () => {
  const { engine, commands } = setup();
  engine.setContext(null, '/login?email=private&code=secret');
  engine.track('ip_login_method_clicked', { method: 'telegram' });
  engine.markReady();
  engine.setContext('private-account', '/onboarding');
  assert.equal(commands.filter(c => c[1] === 'ip_app_opened').length, 0);
  engine.setContext('private-account', '/');
  assert.equal(commands.filter(c => c[0] === 'init').length, 1);
  assert.equal(commands.filter(c => c[1] === 'ip_app_opened').length, 1);
  assert.ok(commands.some(c => c[1] === 'ip_login_method_clicked'));
  assert.doesNotMatch(JSON.stringify(commands), /private|secret|setUserID|app_user_id/);
});
test('timing/placement allowlist rejects form contents, nonfinite values and arbitrary strings', () => {
  assert.deepEqual(sanitizeBehaviorParams({ source:'profile_menu', step:2, elapsed_ms:1234, active_ms:500,
    amount_usd:NaN, section:'personal answer', method:'telegram', selection:'custom',
    answers:{name:'private'}, token:'private' } as BehaviorParams),
  { source:'profile_menu', step:2, elapsed_ms:1234, active_ms:500, method:'telegram', selection:'custom' });
});
