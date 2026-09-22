import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDocumentStart } from './format-document-start';

test('document age determines whether to show just time, date and time, or year too', () => {
  const now = new Date(2026, 8, 22, 12, 0);
  assert.equal(formatDocumentStart(new Date(2026, 8, 22, 0, 21).toISOString(), 'ru-RU', now), '00:21');
  assert.match(formatDocumentStart(new Date(2026, 8, 17, 0, 21).toISOString(), 'ru-RU', now), /17 сентября.*00:21/);
  assert.match(formatDocumentStart(new Date(2025, 8, 17, 0, 21).toISOString(), 'ru-RU', now), /2025/);
  assert.match(formatDocumentStart(new Date(2026, 8, 17, 0, 21).toISOString(), 'en-US', now), /September 17/);
  assert.equal(formatDocumentStart('invalid', 'en-US', now), '—');
});
