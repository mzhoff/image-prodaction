import assert from 'node:assert/strict';
import test from 'node:test';
import { getVideoGenerationUserMessage } from './video-generation-user-message';

test('video generation errors are explained without HTTP or provider details', () => {
  const cases = [
    ['OpenRouter Video: HTTP 400 invalid request', 'Не удалось начать генерацию. Проверьте модель, режим и подключённые материалы.'],
    ['HTTP 429 Too Many Requests', 'Сервис генерации сейчас перегружен. Подождите немного и проверьте результат снова.'],
    ['provider status code 403', 'Нет доступа к генерации видео. Проверьте подключение сервиса в настройках.'],
    ['insufficient credits', 'Недостаточно средств для генерации видео. Пополните баланс и попробуйте снова.'],
    ['OpenRouter Video: HTTP 400. Проверьте доступ модели, баланс и параметры.', 'Не удалось начать генерацию. Проверьте модель, режим и подключённые материалы.'],
  ] as const;
  for (const [input, expected] of cases) {
    const message = getVideoGenerationUserMessage(input);
    assert.equal(message, expected);
    assert.doesNotMatch(message, /HTTP|OpenRouter|\b\d{3}\b/i);
  }
});
test('real-person restriction wins over generic HTTP and survives repeated UI formatting', () => {
  const raw = 'HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The input image may contain real person."}}';
  const message = getVideoGenerationUserMessage(raw);
  assert.match(message, /распознан реальный человек/);
  assert.equal(getVideoGenerationUserMessage(message), message);
  assert.doesNotMatch(message, /HTTP|PrivacyInformation|баланс/);
});

test('already friendly video guidance is preserved', () => {
  assert.equal(
    getVideoGenerationUserMessage('Сначала подключите первый кадр.'),
    'Сначала подключите первый кадр.',
  );
  assert.equal(getVideoGenerationUserMessage(), '');
});
