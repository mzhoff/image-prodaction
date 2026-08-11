import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallRecord } from '@prodactionpro/chat-domain';
import { getVisibleChatToolCalls } from './chat-tool-call-presentation.ts';

test('chat hides technical tool progress and keeps actionable or failed calls', () => {
  const completedRead = createToolCall('completed', 'read');
  const runningRead = createToolCall('running', 'read');
  const confirmation = createToolCall('needs-confirmation', 'write');
  const failed = createToolCall('failed', 'read');

  assert.deepEqual(
    getVisibleChatToolCalls([completedRead, runningRead, confirmation, failed]),
    [confirmation, failed],
  );
});

function createToolCall(
  status: ToolCallRecord['status'],
  riskLevel: ToolCallRecord['riskLevel'],
): ToolCallRecord {
  return {
    conversationId: 'conversation-1',
    createdAt: '2026-08-11T09:00:00.000Z',
    id: `${status}-${riskLevel}`,
    riskLevel,
    status,
    toolName: 'knowledge_search',
    updatedAt: '2026-08-11T09:00:00.000Z',
  };
}
