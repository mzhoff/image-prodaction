import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { account, rateLimit, session, user, verification } from './auth';

test('Better Auth schema keeps the required tables and ownership indexes', () => {
  assert.equal(getTableConfig(user).name, 'user');
  assert.equal(getTableConfig(session).name, 'session');
  assert.equal(getTableConfig(account).name, 'account');
  assert.equal(getTableConfig(verification).name, 'verification');
  assert.equal(getTableConfig(rateLimit).name, 'rate_limit');

  assert.ok(getTableConfig(session).indexes.some((item) => item.config.name === 'session_user_id_idx'));
  assert.ok(getTableConfig(account).indexes.some((item) => item.config.name === 'account_user_id_idx'));
  assert.ok(getTableConfig(verification).indexes.some((item) => item.config.name === 'verification_identifier_idx'));
  assert.ok(getTableConfig(rateLimit).indexes.some((item) => item.config.name === 'rate_limit_key_idx'));
  assert.ok(getTableConfig(rateLimit).indexes.some((item) => item.config.name === 'rate_limit_last_request_idx'));
});
