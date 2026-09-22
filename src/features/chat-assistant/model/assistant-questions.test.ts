import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextMessage, type ChatMessage, type ToolCallRecord } from '@prodactionpro/chat-domain';
import { presentAssistantQuestions, presentAssistantQuestionTools } from './assistant-questions';
import { ASSISTANT_QUESTION_TOOL, readLegacyExtractQuestion } from '@/modules/chat-assistant/contracts/assistant-question';
import { questionProgress, questionReplies } from '@/shared/assistant/model/assistant-question';

const user = createTextMessage({ role: 'user', content: 'Создай ноду, которая извлечет все сценические описания из изображения.' });
const reply = createTextMessage({ role: 'assistant', content: 'Для этого подойдет imageToText. Уточни одно: одним блоком текста или по разделам? Ответьте «одним блоком» или «по разделам».' });
const messages = [user, reply];

test('the existing Extract reply receives exactly two native ChatModule quick replies without mutating history', () => {
  const projected = presentAssistantQuestions(messages, []);
  const choices = projected[1].blocks.at(-1);
  assert.equal(choices?.type, 'quick-replies');
  if (choices?.type !== 'quick-replies') return;
  assert.deepEqual(choices.actions.map((action) => action.label), ['Одним блоком', 'По разделам']);
  assert.match(String(choices.actions[1].payload?.intentSummary), /сценические описания/);
  assert.equal(reply.blocks.length, 1);
  assert.deepEqual(presentAssistantQuestions(projected, []), projected);
});

test('selection survives rehydration and a subsequent free-text reply closes stale buttons', () => {
  const question = readLegacyExtractQuestion(reply, messages)!;
  const action = questionReplies(question).actions[1];
  const answer: ChatMessage = { ...createTextMessage({ role: 'user', content: action.label }),
    metadata: { selectedAction: { ...action, source: { messageId: reply.id, blockType: 'quick-replies' } } } };
  assert.deepEqual(questionProgress(question, [...messages, answer], reply.id), { answer: 'По разделам', closed: true });
  assert.deepEqual(presentAssistantQuestions([...messages, answer], [])[1].blocks.at(-1), { type: 'text', content: 'Выбрано: По разделам' });
  const freeText = createTextMessage({ role: 'user', content: 'Пока отменим' });
  assert.equal(presentAssistantQuestions([...messages, freeText], [])[1].blocks.length, 1);
});

test('unrelated prose and structured questions never acquire a second legacy choice', () => {
  const unrelated = createTextMessage({ role: 'assistant', content: 'Extract умеет описывать сцену одним блоком и по разделам.' });
  assert.equal(readLegacyExtractQuestion(unrelated, [user, unrelated]), undefined);
  const tool: ToolCallRecord = { id: 'q', toolName: ASSISTANT_QUESTION_TOOL, messageId: user.id,
    riskLevel: 'read', status: 'completed', conversationId: 'c', createdAt: '', updatedAt: '' };
  assert.equal(presentAssistantQuestions(messages, [tool])[1].blocks.length, 1);
  const nextUser = createTextMessage({ role: 'user', content: 'По разделам' });
  const nextReply = createTextMessage({ role: 'assistant', content: 'Готовлю' });
  assert.equal(presentAssistantQuestionTools([...messages, nextUser, nextReply], [tool])[0].messageId, reply.id);
  assert.equal(tool.messageId, user.id);
});
