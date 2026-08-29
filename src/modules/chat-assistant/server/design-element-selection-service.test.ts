import assert from 'node:assert/strict';
import test from 'node:test';
import { createDesignElementSelection } from './design-element-selection-service';

const detectedElements = [
  { id: 'headline', kind: 'text', label: 'Заголовок', role: 'headline' },
  { id: 'hero', kind: 'image', label: 'Главный герой', role: 'hero' },
  { id: 'qr', kind: 'image', label: 'QR-код', role: 'qr' },
];

test('uses the simplest product defaults and always recommends QR separately', () => {
  const result = createDesignElementSelection({
    elements: detectedElements,
    intentSummary: 'Регулярно делать похожие рекламные макеты',
  }, 'tool-call-1');

  assert.equal(result.baseImageStrategy, 'single-image');
  assert.equal(result.textStrategy, 'embedded');
  assert.deepEqual(result.recommendedElementIds, ['qr']);
  assert.equal(result.interactionId, 'tool-call-1');
});

test('honors explicit layered and separate-text intent', () => {
  const result = createDesignElementSelection({
    baseImageStrategy: 'layered',
    elements: detectedElements,
    intentSummary: 'Хочу двигать и перегенерировать каждый элемент отдельно',
    textStrategy: 'separate',
  }, 'tool-call-2');

  assert.deepEqual(result.recommendedElementIds, ['headline', 'hero', 'qr']);
});

test('filters duplicate or malformed model candidates without leaking arbitrary data', () => {
  const result = createDesignElementSelection({
    elements: [
      ...detectedElements,
      { id: 'hero', kind: 'image', label: 'Дубликат', role: 'hero' },
      { id: '../bad', kind: 'image', label: 'Плохой id', role: 'other' },
      { id: 'unknown-kind', kind: 'qr', label: 'Неизвестный тип', role: 'qr' },
    ],
    intentSummary: 'Собрать повторяемый макет',
  }, 'tool-call-3');

  assert.equal(result.elements.length, 3);
});

test('preserves valid normalized reference bounds and drops invalid bounds only', () => {
  const result = createDesignElementSelection({
    elements: [
      {
        ...detectedElements[0],
        referenceFrame: { x: 0.08, y: 0.12, width: 0.72, height: 0.18 },
      },
      {
        ...detectedElements[1],
        referenceFrame: { x: 0.8, y: 0.1, width: 0.4, height: 0.5 },
      },
    ],
    intentSummary: 'Собрать повторяемый макет',
  }, 'tool-call-frame');

  assert.deepEqual(result.elements[0]?.referenceFrame, {
    height: 0.18,
    width: 0.72,
    x: 0.08,
    y: 0.12,
  });
  assert.equal(result.elements[1]?.referenceFrame, undefined);
});

test('normalizes a QR candidate to image even when the model classified it as text', () => {
  const result = createDesignElementSelection({
    elements: [{ id: 'qr', kind: 'text', label: 'QR-код', role: 'qr' }],
    intentSummary: 'Собрать повторяемый макет с QR-кодом',
  }, 'tool-call-qr');

  assert.equal(result.elements[0]?.kind, 'image');
  assert.deepEqual(result.recommendedElementIds, ['qr']);
});

test('rejects an empty intent or an empty detected element set', () => {
  assert.throws(() => createDesignElementSelection({
    elements: detectedElements,
    intentSummary: '',
  }, 'tool-call-4'), /clear user intent/u);
  assert.throws(() => createDesignElementSelection({
    elements: [],
    intentSummary: 'Повторяемый макет',
  }, 'tool-call-5'), /at least one detected element/u);
});
