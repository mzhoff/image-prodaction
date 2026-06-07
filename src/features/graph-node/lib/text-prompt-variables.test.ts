import { strict as assert } from 'node:assert';
import test from 'node:test';
import { composeTextPromptResult, splitTextPromptMentionTokens } from './text-prompt-variables.ts';

test('composeTextPromptResult replaces explicit variable aliases with values only', () => {
  const result = composeTextPromptResult(
    'Create a poster with @Variable 1.',
    [{ alias: 'Variable 1', value: '80s neon style' }],
  );

  assert.equal(result, 'Create a poster with 80s neon style.');
});

test('composeTextPromptResult does not use display mode in output composition', () => {
  const result = composeTextPromptResult(
    'Create a poster with @Variable 1.',
    [{ alias: 'Variable 1', value: '80s neon style' }],
  );

  assert.equal(result, 'Create a poster with 80s neon style.');
});

test('composeTextPromptResult ignores connected variables that are not referenced in text', () => {
  const result = composeTextPromptResult(
    'Create a poster.',
    [{ alias: 'Variable 1', value: '80s neon style' }],
  );

  assert.equal(result, 'Create a poster.');
});

test('composeTextPromptResult supports source node aliases and legacy variable aliases', () => {
  const result = composeTextPromptResult(
    'Audience: @Целевая аудитория\nProblem: @Variable 2',
    [
      { alias: 'Целевая аудитория', mentionAliases: ['Variable 1'], value: 'remote startup moms' },
      { alias: 'Проблема', mentionAliases: ['Variable 2'], value: 'no childcare during work meetings' },
    ],
  );

  assert.equal(result, 'Audience: remote startup moms\nProblem: no childcare during work meetings');
});

test('splitTextPromptMentionTokens exposes source and value parts separately', () => {
  const tokens = splitTextPromptMentionTokens(
    'Write for @Variable 1.',
    [{ alias: 'Целевая аудитория', mentionAliases: ['Variable 1'], value: 'remote startup moms' }],
    'source-value',
  );
  const mention = tokens.find((token) => token.type === 'mention');

  assert.deepEqual(mention, {
    type: 'mention',
    alias: 'Целевая аудитория',
    sourceText: 'Целевая аудитория',
    text: 'Целевая аудитория: remote startup moms',
    value: 'remote startup moms',
    valueText: 'remote startup moms',
  });
});
