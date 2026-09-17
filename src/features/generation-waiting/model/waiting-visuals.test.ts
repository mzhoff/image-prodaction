import assert from 'node:assert/strict';
import test from 'node:test';
import { generationWaitingLabel, selectGenerationWaitingVisual } from './waiting-visuals.ts';

test('selects one stable visual from the requested media family', () => {
  const first = selectGenerationWaitingVisual('image', 'job-42');
  assert.equal(first?.id, selectGenerationWaitingVisual('image', 'job-42')?.id);
  assert.equal(first?.kind, 'image');
  assert.equal(selectGenerationWaitingVisual('video', 'job-42')?.kind, 'video');
});

test('waiting copy describes an actual known job stage without inventing a percentage', () => {
  assert.equal(generationWaitingLabel('queued', 'image'), 'Задача в очереди…');
  assert.equal(generationWaitingLabel('running', 'video'), 'Собираем видео…');
});
