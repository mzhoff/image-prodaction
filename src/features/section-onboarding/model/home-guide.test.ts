import assert from 'node:assert/strict';
import test from 'node:test';
import { translateMessage } from '@/shared/i18n/translate';
import { homeGuideScenario, skipHintScenario } from '../ui/home-guide-scenario';

test('welcome and five targeted steps form one skippable six-step tour', () => {
  const guide = homeGuideScenario({ id: 'home', version: 1, skippable: true,
    labels: { back: 'Назад', next: 'Далее', complete: 'Готово', skip: 'Пропустить', formatProgress: (a, b) => `${a}/${b}` },
    steps: [{ id: 'welcome', eyebrow: 'REVERIE · PRODUCTION', title: '', text: '', placement: { kind: 'center' } }],
  });
  assert.deepEqual(guide.steps.map((step) => step.eyebrow), ['REVERIE · PRODUCTION', 'Боковое меню', 'Меню экосистемы', 'Главные действия', 'AI-ассистент', 'Подсказки всегда рядом']);
  assert.equal(guide.steps.length, 6);
  assert.equal(guide.labels.formatProgress?.(1, 6), '1 / 6');
  assert.equal(guide.steps[0].placement.kind, 'center');
  assert.equal(guide.steps[5].title, 'Возвращайтесь, когда забыли');
  assert.ok(guide.steps.slice(1).every((step) => step.supplementaryAction === false));
  assert.equal(guide.labels.skip, 'Пропустить онбординг');
  assert.ok(guide.skippable, 'close and Escape remain available');
});

test('changing tour language preserves step IDs, targets and completion identity', () => {
  const ru = homeGuideScenario(skipHintScenario());
  const en = homeGuideScenario(skipHintScenario((source) => translateMessage('en', source)), (source) => translateMessage('en', source));
  assert.deepEqual(en.steps.map((step) => step.eyebrow), [undefined, 'Sidebar', 'Ecosystem menu', 'Main actions', 'AI assistant', 'Help is always here']);
  assert.equal(en.labels.skip, 'Skip tour');
  assert.equal(en.id, ru.id);
  assert.equal(en.version, ru.version);
  assert.deepEqual(en.steps.map(({ id, placement }) => ({ id, placement })), ru.steps.map(({ id, placement }) => ({ id, placement })));
  for (const step of en.steps) {
    assert.doesNotMatch(String(step.title), /[А-Яа-яЁё]/);
    assert.doesNotMatch(String(step.text), /[А-Яа-яЁё]/);
  }
  const hint = skipHintScenario((source) => translateMessage('en', source));
  assert.equal(hint.steps[0].title, 'Continue the tour here');
  assert.equal(hint.labels.complete, 'Got it');
  assert.equal(hint.labels.skip, 'Close');
  assert.deepEqual(hint.steps[0].placement, skipHintScenario().steps[0].placement);
});
