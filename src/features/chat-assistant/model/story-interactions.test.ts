import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, ToolCallRecord } from '@prodactionpro/chat-domain';
import { canAutoSaveStory, isStoryQuestionAnswered, presentStoryTools, readStoryQuestion } from './story-interactions';
import { STORY_BLUEPRINT_PRESENTATION, STORY_BLUEPRINT_TOOL, STORY_QUESTION_TOOL } from '@/modules/chat-assistant/contracts/story-authoring';

const message = (id: string, role: ChatMessage['role']): ChatMessage => ({ id, role, createdAt: '', blocks: [] });
const tool: ToolCallRecord = { id: 'tool', conversationId: 'story:chat', messageId: 'u1', toolName: STORY_BLUEPRINT_TOOL, presentationType: STORY_BLUEPRINT_PRESENTATION, riskLevel: 'write', status: 'needs-confirmation', createdAt: '', updatedAt: '', safePreview: { submitAuthorized: true, storyId: 'story', expectedRevision: 0 } };
test('only a prepared write for this story and its current revision is auto-saved', () => {
  assert.equal(canAutoSaveStory(tool, 'story', 0), true);
  assert.equal(canAutoSaveStory(tool, 'other', 0), false);
  assert.equal(canAutoSaveStory(tool, 'story', 1), false);
  assert.equal(canAutoSaveStory({ ...tool, safePreview: { ...tool.safePreview, submitAuthorized: false } }, 'story', 0), false);
  assert.equal(canAutoSaveStory({ ...tool, status: 'completed' }, 'story', 0), false);
});
test('questions appear under the coauthor reply in their own turn, never under a later reply', () => {
  const messages = [message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user'), message('a2', 'assistant')];
  const projected = presentStoryTools(messages, [{ ...tool, toolName: STORY_QUESTION_TOOL }]);
  assert.equal(projected[0].messageId, 'a1'); assert.equal(tool.messageId, 'u1');
  assert.equal(presentStoryTools([messages[0]], [tool])[0].messageId, undefined);
});
test('submitted custom and suggested answers resolve only their originating question after rehydration', () => {
  for (const choice of [0, 1, 'custom']) {
    const answer = { ...message('u2', 'user'), metadata: { selectedAction: { payload: { kind: 'story-answer', interactionId: 'q1', choice, answer: 'Наш финал' } } } };
    assert.equal(isStoryQuestionAnswered([answer], 'q1'), true);
    assert.equal(isStoryQuestionAnswered([answer], 'q2'), false);
    assert.equal(isStoryQuestionAnswered([{ ...answer, role: 'assistant' }], 'q1'), false);
  }
});
test('malformed or oversized question payloads do not become interactive forms', () => {
  const question = { action: 'story-question', interactionId: 'q', question: 'Какой финал?', options: [{ label: 'Первый', description: '' }, { label: 'Второй', description: '' }] };
  assert.ok(readStoryQuestion(question));
  assert.equal(readStoryQuestion({ ...question, options: [] }), undefined);
  assert.equal(readStoryQuestion({ ...question, question: 'x'.repeat(601) }), undefined);
});
