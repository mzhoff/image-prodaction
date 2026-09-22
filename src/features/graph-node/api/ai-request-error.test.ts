import assert from 'node:assert/strict';
import test from 'node:test';
import { AiRequestError, formatApiError } from './ai-request-error';

test('generation access failures use safe instructions and preserve machine-readable codes', () => {
  const error = new AiRequestError(409, { code: 'provider_not_configured', message: 'OpenRouter is not connected for this Workspace.' });
  assert.equal(error.code, 'provider_not_configured');
  assert.equal(error.status, 409);
  assert.match(error.message, /ещё не активирован/);
  assert.match(error.message, /Владелец.*Telegram/);
  assert.match(formatApiError({ code: 'payment_required', message: 'secret provider body' }), /общий резерв/);
  assert.match(formatApiError({ code: 'member_budget_exhausted' }), /личный лимит/);
  assert.match(formatApiError({ code: 'provider_connection_unavailable' }), /не означает.*нулю/);
  assert.equal(formatApiError({ code: 'validation_error', message: 'Укажите текст' }), 'Укажите текст');
});
