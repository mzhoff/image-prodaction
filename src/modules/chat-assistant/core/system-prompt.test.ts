import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImageProductionSystemPrompt } from './system-prompt.ts';

test('requires semantic document names and separates variable text from stable instructions', () => {
  const prompt = buildImageProductionSystemPrompt({
    mode: 'product-copilot',
    principal: {
      productId: 'image-production',
      tenantId: 'workspace-1',
      userId: 'user-1',
    },
  });

  assert.match(prompt, /documentName/u);
  assert.match(prompt, /оцени, достаточно ли данных/u);
  assert.match(prompt, /не задавай формальных.*один короткий план/u);
  assert.match(prompt, /одно текстовое согласие/u);
  assert.match(prompt, /переиспользуемый пайплайн/u);
  assert.match(prompt, /заметки.*отдельную ноду textPrompt/u);
  assert.match(prompt, /Не встраивай изменяемые пользовательские данные в textGeneration\.instruction/u);
  assert.match(prompt, /textPrompt\.text.*textGeneration\.text/u);
  assert.match(prompt, /textConcat.*text-0.*text-1.*text-2/u);
  assert.match(prompt, /settings\.variables.*variable-0.*@Alias/u);
  assert.match(prompt, /textPrompt\.text.*потребителю/u);
  assert.match(prompt, /document_graph.*pipeline_update/u);
  assert.match(prompt, /входы слева.*результаты справа/u);
  assert.match(prompt, /не передавай originX\/originY/u);
  assert.match(prompt, /максимум один объединённый раунд/u);
  assert.match(prompt, /сразу используй pipeline_build.*pipeline_update/u);
  assert.match(prompt, /не спрашивай подтверждение текстом повторно/u);
  assert.match(prompt, /Согласие на сборку.*не является согласием на запуск/u);
  assert.match(prompt, /отдельное прямое указание пользователя/u);
  assert.match(prompt, /Не передавай documentName/u);
});
