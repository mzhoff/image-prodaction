import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceAiApiError } from '../api/workspace-ai-api';
import {
  formatDateTime,
  formatInteger,
  formatKeyTier,
  formatLimitReset,
  formatOperation,
  formatUsd,
  isAbortError,
  isNotFoundError,
  readErrorMessage,
  roleLabel,
} from './provider-settings-values';

test('provider settings values format roles, operations and numeric usage', () => {
  assert.equal(roleLabel('owner'), 'Owner');
  assert.equal(roleLabel('admin'), 'Admin');
  assert.equal(roleLabel('member'), 'Только просмотр');
  assert.equal(formatOperation('generate_image'), 'Generate image');
  assert.equal(formatInteger('1234.4').replace(/\D/g, ''), '1234');
  assert.equal(formatUsd(null), 'Не предоставлено');
  assert.match(formatUsd('12.5'), /12\.50/);
  assert.equal(formatUsd('not-a-number'), 'Не предоставлено');
});

test('provider settings values describe key tier and reset policy safely', () => {
  assert.equal(formatKeyTier(true), 'Free tier key');
  assert.equal(formatKeyTier(false), 'Paid key');
  assert.equal(formatKeyTier(null), 'Тариф key не предоставлен');
  assert.equal(formatLimitReset(null), 'Reset policy не предоставлена');
  assert.equal(formatLimitReset('daily'), 'Reset: daily');
  assert.notEqual(formatDateTime('2026-08-10T10:00:00.000Z'), 'Нет данных');
  assert.equal(formatDateTime('invalid'), 'Нет данных');
});

test('provider settings values classify request failures', () => {
  assert.equal(isAbortError(new DOMException('Aborted', 'AbortError')), true);
  assert.equal(isAbortError(new Error('Aborted')), false);
  assert.equal(isNotFoundError(new WorkspaceAiApiError(404)), true);
  assert.equal(isNotFoundError(new WorkspaceAiApiError(403)), false);
  assert.equal(readErrorMessage(new Error('Failed')), 'Failed');
  assert.equal(readErrorMessage('Failed'), 'Не удалось выполнить запрос.');
});
