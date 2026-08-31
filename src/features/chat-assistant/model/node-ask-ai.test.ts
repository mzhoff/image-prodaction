import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatLauncher } from '@prodactionpro/chat-runtime-core';
import {
  getNodeDefinition,
  PRODUCTION_NODE_TYPES,
} from '@/entities/production-graph/model/node-registry';
import {
  createNodeAskAiLaunchCoordinator,
  createNodeAskAiLaunchRequest,
  type NodeAskAiLaunchCoordinator,
} from './node-ask-ai.ts';

test('every registered node creates a safe Ask AI draft without auto-submit', () => {
  for (const type of PRODUCTION_NODE_TYPES) {
    const nodeId = `node-${type}`;
    const request = createNodeAskAiLaunchRequest({ id: nodeId, type });
    const text = request.message.text;

    assert.equal(request.message.delivery, 'draft');
    assert.equal(request.sourceId, `production-canvas.node.ask-ai:${nodeId}`);
    assert.match(text, new RegExp(escapeRegex(getNodeDefinition(type).menuLabel), 'u'));
    assert.match(text, new RegExp(`тип ${escapeRegex(type)}`, 'u'));
    assert.match(text, /что такое|для чего/u);
    assert.match(text, /когда.+использовать/u);
    assert.match(text, /входы, выходы.+настройки/u);
    assert.match(text, /возможности и ограничения/u);
    assert.match(text, /Ничего не изменяй/u);
    assert.doesNotMatch(text, new RegExp(escapeRegex(nodeId), 'u'));
  }
});

test('coordinator opens a cold surface and consumes one pending draft once', async () => {
  let surfaceOpenCount = 0;
  const launched: string[] = [];
  const coordinator = createNodeAskAiLaunchCoordinator(() => { surfaceOpenCount += 1; });
  const request = createNodeAskAiLaunchRequest({ id: 'node-1', type: 'textPrompt' });

  assert.deepEqual(await coordinator.open(request), {
    sourceId: request.sourceId,
    status: 'queued',
  });
  assert.equal(surfaceOpenCount, 1);

  const cleanup = coordinator.register(createLauncher(launched));
  await Promise.resolve();
  assert.deepEqual(launched, [request.sourceId]);

  cleanup();
  const secondCleanup = coordinator.register(createLauncher(launched));
  await Promise.resolve();
  assert.deepEqual(launched, [request.sourceId]);
  secondCleanup();
});

test('coordinator uses a launcher registered while the cold surface opens', async () => {
  const launched: string[] = [];
  const coordinator: NodeAskAiLaunchCoordinator = createNodeAskAiLaunchCoordinator(async () => {
    coordinator.register(createLauncher(launched));
    await Promise.resolve();
  });
  const request = createNodeAskAiLaunchRequest({ id: 'node-cold', type: 'imageToText' });

  assert.deepEqual(await coordinator.open(request), {
    sourceId: request.sourceId,
    status: 'drafted',
  });
  assert.deepEqual(launched, [request.sourceId]);
});

test('stale launcher cleanup cannot unregister a newer launcher', async () => {
  const first: string[] = [];
  const second: string[] = [];
  const coordinator = createNodeAskAiLaunchCoordinator(() => undefined);
  const cleanupFirst = coordinator.register(createLauncher(first));
  const cleanupSecond = coordinator.register(createLauncher(second));

  cleanupFirst();
  await coordinator.open(createNodeAskAiLaunchRequest({ id: 'node-2', type: 'banner' }));
  assert.deepEqual(first, []);
  assert.deepEqual(second, ['production-canvas.node.ask-ai:node-2']);
  cleanupSecond();
});

test('cold coordinator preserves the first of two different pending drafts', async () => {
  const coordinator = createNodeAskAiLaunchCoordinator(() => undefined);
  const first = createNodeAskAiLaunchRequest({ id: 'node-1', type: 'textPrompt' });
  const second = createNodeAskAiLaunchRequest({ id: 'node-2', type: 'banner' });

  assert.equal((await coordinator.open(first)).status, 'queued');
  assert.deepEqual(await coordinator.open(second), {
    reason: 'draft-conflict',
    sourceId: second.sourceId,
    status: 'blocked',
  });
});

test('cold coordinator retries a pending draft after conversation loading becomes idle', async () => {
  const coordinator = createNodeAskAiLaunchCoordinator(() => undefined);
  const request = createNodeAskAiLaunchRequest({ id: 'node-loading', type: 'textPrompt' });
  let busyAttempts = 0;
  const drafted: string[] = [];

  assert.equal((await coordinator.open(request)).status, 'queued');
  const cleanupBusy = coordinator.register({
    open: async (launchRequest) => {
      busyAttempts += 1;
      return {
        reason: 'busy',
        sourceId: launchRequest.sourceId,
        status: 'blocked',
      };
    },
  });
  await settlePendingDelivery();
  cleanupBusy();

  const cleanupIdle = coordinator.register(createLauncher(drafted));
  await settlePendingDelivery();
  assert.equal(busyAttempts, 1);
  assert.deepEqual(drafted, [request.sourceId]);
  cleanupIdle();
});

test('closing the assistant cancels a pending cold draft', async () => {
  const coordinator = createNodeAskAiLaunchCoordinator(() => undefined);
  const request = createNodeAskAiLaunchRequest({ id: 'node-cancelled', type: 'banner' });
  const drafted: string[] = [];

  assert.equal((await coordinator.open(request)).status, 'queued');
  coordinator.cancelPending();
  const cleanup = coordinator.register(createLauncher(drafted));
  await settlePendingDelivery();
  assert.deepEqual(drafted, []);
  cleanup();
});

function createLauncher(calls: string[]): ChatLauncher {
  return {
    open: async (request) => {
      calls.push(request.sourceId);
      return { sourceId: request.sourceId, status: 'drafted' };
    },
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function settlePendingDelivery() {
  await Promise.resolve();
  await Promise.resolve();
}
