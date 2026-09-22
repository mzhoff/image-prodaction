import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallRecord } from '@prodactionpro/chat-domain';
import type { ChatRuntimeState } from '@prodactionpro/chat-runtime-core';
import { HomeSubmitAuthorizationController, isSubmitAuthorizedHomeTool } from './home-submit-authorization';

function fixture() {
  const tool: ToolCallRecord = { id: 'tool1', conversationId: 'home:test', toolName: 'home_generate_image',
    presentationType: 'image-production.home-generation', riskLevel: 'write', safePreview: { submitAuthorized: true },
    status: 'needs-confirmation', approvalToken: 'signed', approvalExpiresAt: 'future', createdAt: '', updatedAt: '' };
  const state: ChatRuntimeState = { conversationId: 'home:test', phase: 'idle', pendingToolCalls: [tool],
    messages: [], attachments: [], inputValue: '', selectedMode: 'image-generation', selectedModel: 'model', selectedImageFormat: '1:1' };
  const confirmations: string[] = [];
  const rejections: string[] = [];
  let reloads = 0;
  const runtime = {
    getSnapshot: () => state,
    async confirmToolCall(id: string) {
      confirmations.push(id);
      tool.status = 'completed';
      return tool;
    },
    async rejectToolCall(id: string) { rejections.push(id); tool.status = 'rejected'; return tool; },
    async loadConversation() { reloads += 1; },
    setMode(mode: ChatRuntimeState['selectedMode']) { state.selectedMode = mode; },
  };
  return { tool, state, runtime, confirmations, rejections, reloads: () => reloads,
    controller: new HomeSubmitAuthorizationController(runtime) };
}

test('Only explicitly authorized Home write tools qualify; legacy and canvas tools keep confirmation', async () => {
  const f = fixture();
  assert.equal(isSubmitAuthorizedHomeTool(f.tool), true);
  for (const altered of [{ safePreview: {} }, { toolName: 'pipeline_build' }, { riskLevel: 'read' as const },
    { presentationType: 'canvas' }, { safePreview: { submitAuthorized: 'true' } }]) {
    assert.equal(isSubmitAuthorizedHomeTool({ ...f.tool, ...altered }), false);
  }
  f.tool.safePreview = {};
  await f.controller.runPending();
  assert.equal(f.confirmations.length, 0);
});

test('Streaming and loading settle before consuming authorization; duplicate renders confirm once', async () => {
  const f = fixture();
  for (const phase of ['loading', 'submitting', 'streaming'] as const) {
    f.state.phase = phase;
    await f.controller.runPending();
  }
  assert.equal(f.confirmations.length, 0);
  f.state.phase = 'idle';
  await Promise.all([f.controller.runPending(), f.controller.runPending()]);
  await f.controller.runPending();
  assert.deepEqual(f.confirmations, ['tool1']);
  assert.equal(f.tool.status, 'completed');
});

test('Lost confirmation response exposes a retry and reconciles completed tool without another execution', async () => {
  const f = fixture();
  f.runtime.confirmToolCall = async (id) => {
    f.confirmations.push(id);
    throw new Error('Network response lost');
  };
  await f.controller.runPending();
  assert.equal(f.controller.getSnapshot().retryToolId, 'tool1');
  assert.match(f.controller.getSnapshot().error ?? '', /новое изображение не создастся/);
  await f.controller.runPending();
  assert.equal(f.confirmations.length, 1);
  f.runtime.loadConversation = async () => { f.tool.status = 'completed'; };
  await f.controller.retry();
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.controller.getSnapshot().error, undefined);
});

test('Visible retry refreshes approval and confirms the same unresolved tool only', async () => {
  const f = fixture();
  const success = f.runtime.confirmToolCall;
  f.runtime.confirmToolCall = async (id) => { f.confirmations.push(id); throw new Error('Offline'); };
  await f.controller.runPending();
  f.runtime.confirmToolCall = success;
  await f.controller.retry();
  assert.equal(f.reloads(), 1);
  assert.deepEqual(f.confirmations, ['tool1', 'tool1']);
  assert.equal(f.tool.status, 'completed');
});

test('Restored completed tools never auto-confirm; restored authorized pending tools retain the same identity', async () => {
  const f = fixture();
  f.tool.status = 'completed';
  await new HomeSubmitAuthorizationController(f.runtime).runPending();
  assert.equal(f.confirmations.length, 0);
  f.tool.status = 'needs-confirmation';
  await new HomeSubmitAuthorizationController(f.runtime).runPending();
  assert.deepEqual(f.confirmations, ['tool1']);
});

test('Stop before auto-confirm rejects the pending action before streaming settles and survives reload', async () => {
  const f = fixture();
  f.state.phase = 'streaming';
  const stopping = f.controller.cancelPending();
  f.state.phase = 'idle';
  await f.controller.runPending();
  await stopping;
  await new HomeSubmitAuthorizationController(f.runtime).runPending();
  assert.equal(f.confirmations.length, 0);
  assert.deepEqual(f.rejections, ['tool1']);
  assert.equal(f.tool.status, 'rejected');
});

test('A failed Stop exposes retry of rejection, never confirmation', async () => {
  const f = fixture();
  const success = f.runtime.rejectToolCall;
  f.runtime.rejectToolCall = async () => { throw new Error('Offline'); };
  await f.controller.cancelPending();
  await f.controller.runPending();
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.controller.getSnapshot().retryToolId, 'tool1');
  f.runtime.rejectToolCall = success;
  await f.controller.retry();
  assert.deepEqual(f.rejections, ['tool1']);
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.controller.getSnapshot().error, undefined);
});

test('A late proposal from the stopped turn is rejected instead of starting an image', async () => {
  const f = fixture();
  f.tool.turnId = 'stopped-turn';
  f.state.activity = { turnId: 'stopped-turn' } as ChatRuntimeState['activity'];
  f.state.pendingToolCalls = [];
  f.state.phase = 'streaming';
  await f.controller.cancelPending();
  f.state.phase = 'idle';
  f.state.pendingToolCalls = [f.tool];
  await f.controller.runPending();
  assert.equal(f.confirmations.length, 0);
  assert.deepEqual(f.rejections, ['tool1']);
});

test('Confirmed callback fires after actual signed execution, never for loading a completed tool', async () => {
  const f = fixture();
  const analytics: string[] = [];
  const controller = new HomeSubmitAuthorizationController(f.runtime, (tool) => { analytics.push(tool.id); });
  await controller.runPending();
  await controller.runPending();
  await new HomeSubmitAuthorizationController(f.runtime, (tool) => { analytics.push(tool.id); }).runPending();
  assert.deepEqual(analytics, ['tool1']);
});

test('Analytics callback failure cannot turn a completed image action into a retry', async () => {
  const f = fixture();
  const controller = new HomeSubmitAuthorizationController(f.runtime, () => { throw new Error('Analytics unavailable'); });
  await controller.runPending();
  assert.equal(f.tool.status, 'completed');
  assert.equal(controller.getSnapshot().retryToolId, undefined);
  assert.equal(controller.getSnapshot().error, undefined);
});
