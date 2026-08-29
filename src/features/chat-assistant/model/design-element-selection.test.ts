import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import type { DesignElementSelectionResult } from '@/modules/chat-assistant/contracts/design-element-selection';
import {
  createAllDesignElementSelection,
  createDesignElementSelectionSubmission,
  createRecommendedDesignElementSelection,
  normalizeDesignElementSelection,
  readSubmittedDesignElementSelection,
} from './design-element-selection';

const result: DesignElementSelectionResult = {
  action: 'select-design-elements',
  baseImageStrategy: 'single-image',
  elements: [
    {
      id: 'headline',
      kind: 'text',
      label: 'Заголовок',
      referenceFrame: { x: 0.08, y: 0.12, width: 0.72, height: 0.18 },
      role: 'headline',
    },
    { id: 'hero', kind: 'image', label: 'Главный герой', role: 'hero' },
    { id: 'qr', kind: 'image', label: 'QR-код', role: 'qr' },
  ],
  interactionId: 'tool-call-1',
  intentSummary: 'Повторяемый рекламный макет',
  nextStep: 'Wait',
  recommendedElementIds: ['qr'],
  recommendationReason: 'Простой вариант',
  summary: 'Выбери элементы',
  textStrategy: 'embedded',
  version: 1,
};

test('recommended selection keeps the simple default and a separate QR', () => {
  assert.deepEqual(createRecommendedDesignElementSelection(result), {
    baseImageStrategy: 'single-image',
    customElements: [],
    selectedElementIds: ['qr'],
    textStrategy: 'embedded',
  });
});

test('selecting text or an image part promotes the matching editable strategy', () => {
  assert.deepEqual(normalizeDesignElementSelection(result, {
    baseImageStrategy: 'single-image',
    customElements: [],
    selectedElementIds: ['headline', 'hero'],
    textStrategy: 'embedded',
  }), {
    baseImageStrategy: 'layered',
    customElements: [],
    selectedElementIds: ['headline', 'hero', 'qr'],
    textStrategy: 'separate',
  });
});

test('all selection enables separate text and image layers', () => {
  assert.deepEqual(createAllDesignElementSelection(result), {
    baseImageStrategy: 'layered',
    customElements: [],
    selectedElementIds: ['headline', 'hero', 'qr'],
    textStrategy: 'separate',
  });
});

test('canonical submission is readable and carries a stable structured payload', () => {
  const submission = createDesignElementSelectionSubmission(result, {
    baseImageStrategy: 'layered',
    customElements: ['Плашка партнёра'],
    selectedElementIds: ['headline', 'hero'],
    textStrategy: 'separate',
  });
  assert.match(submission.message, /Заголовок, Главный герой, QR-код, Плашка партнёра/u);
  assert.deepEqual(submission.payload, {
    baseImageStrategy: 'layered',
    customElements: ['Плашка партнёра'],
    interactionId: 'tool-call-1',
    kind: 'design-element-selection',
    selectedElementIds: ['headline', 'hero', 'qr'],
    selectedElements: [
      {
        id: 'headline',
        kind: 'text',
        label: 'Заголовок',
        referenceFrame: { x: 0.08, y: 0.12, width: 0.72, height: 0.18 },
        role: 'headline',
      },
      { id: 'hero', kind: 'image', label: 'Главный герой', role: 'hero' },
      { id: 'qr', kind: 'image', label: 'QR-код', role: 'qr' },
    ],
    textStrategy: 'separate',
    version: 1,
  });
});

test('submitted interaction can be restored from persisted message metadata', () => {
  const messages = [{
    id: 'message-1',
    conversationId: 'conversation-1',
    role: 'user',
    createdAt: new Date().toISOString(),
    blocks: [{ type: 'text', content: 'Выбор' }],
    metadata: {
      selectedAction: {
        payload: {
          baseImageStrategy: 'single-image',
          customElements: [],
          interactionId: 'tool-call-1',
          kind: 'design-element-selection',
          selectedElementIds: ['qr'],
          selectedElements: [{
            id: 'qr',
            kind: 'text',
            label: 'QR-код',
            referenceFrame: { x: 0.74, y: 0.68, width: 0.18, height: 0.18 },
            role: 'qr',
          }],
          textStrategy: 'embedded',
          version: 1,
        },
      },
    },
  }] as ChatMessage[];
  assert.equal(readSubmittedDesignElementSelection(messages, 'tool-call-1')?.selectedElementIds[0], 'qr');
  assert.deepEqual(readSubmittedDesignElementSelection(messages, 'tool-call-1')?.selectedElements, [{
    id: 'qr',
    kind: 'image',
    label: 'QR-код',
    referenceFrame: { height: 0.18, width: 0.18, x: 0.74, y: 0.68 },
    role: 'qr',
  }]);
});
