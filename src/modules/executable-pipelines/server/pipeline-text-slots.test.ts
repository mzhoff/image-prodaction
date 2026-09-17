import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { reconcileTextSplitterSlots } from '@/entities/production-graph/model/text-splitter-slots';
import { getRuntimeDescriptor } from '../adapters/studio/studio-runtime-descriptor';
import { createDeterministicTextHandlers } from './pipeline-text-handlers';

const handler = createDeterministicTextHandlers().find((item) => item.handlerType === 'text.split')!;
const context = { pipelineId: 'p', pipelineVersion: 1, runId: 'r', sourceApplication: 'test', workspaceId: 'w' };

test('published Splitter config pins named outputs and runtime never shifts Color into Light', async () => {
  const node = createDefaultNode('textSplitter', { x: 0, y: 0 });
  Object.assign(node.data, { delimiter: '[', mode: 'delimiter',
    ...reconcileTextSplitterSlots(['LIGHT]\nsun', 'COLOR / GRADE]\nred', 'STYLE]\nphoto'], {}) });
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map() });
  assert.deepEqual(descriptor.config.itemKeys, ['section:light', 'section:color', 'section:style']);
  const output = await handler.execute({ config: descriptor.config, context, inputs: {
    text: '[STYLE]\nupdated photo\n\n[COLOR / GRADE]\nblue',
  }, nodeId: node.id, signal: new AbortController().signal });
  assert.deepEqual(output, {
    items: ['COLOR / GRADE]\nblue', 'STYLE]\nupdated photo'],
    'item-0': '', 'item-1': 'COLOR / GRADE]\nblue', 'item-2': 'STYLE]\nupdated photo',
  });
  const empty = await handler.execute({ config: descriptor.config, context, inputs: { text: '' },
    nodeId: node.id, signal: new AbortController().signal });
  assert.deepEqual(empty, { items: [], 'item-0': '', 'item-1': '', 'item-2': '' });
});

test('previously published text.split configs remain positional without new opt-in keys', async () => {
  const output = await handler.execute({ config: { delimiter: '[', mode: 'delimiter' }, context,
    inputs: { text: '[COLOR / GRADE]\nred' }, nodeId: 'legacy', signal: new AbortController().signal });
  assert.deepEqual(output, { items: ['COLOR / GRADE]\nred'], 'item-0': 'COLOR / GRADE]\nred' });
});

test('compiler seeds semantic keys for saved legacy Studio nodes, not just mounted ones', () => {
  const node = createDefaultNode('textSplitter', { x: 0, y: 0 });
  Object.assign(node.data, { items: ['LIGHT]\nsun', 'COLOR / GRADE]\nred'] });
  const descriptor = getRuntimeDescriptor(node, { edges: [], incomingByNode: new Map(), nodeById: new Map() });
  assert.deepEqual(descriptor.config.itemKeys, ['section:light', 'section:color']);
});
