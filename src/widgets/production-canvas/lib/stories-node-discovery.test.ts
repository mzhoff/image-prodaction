import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type { PortKind } from '@/entities/production-graph/model/types';

// The normal Node harness strips .ts; these menu modules also contain JSX icons.
// Load the actual menu implementations without replacing their registry or actions.
const jsxLoader = registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/add-node-menu.tsx') || url.endsWith('/connect-create-menu.tsx')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }, fileName: fileURLToPath(url),
      }).outputText };
    }
    return nextLoad(url, context);
  },
});
const { addNodeMenu, addNodeMenuGroups, createAddNodeContextMenuActions } = await import('./add-node-menu');
const { getConnectCreateOptions, getConnectCreateSourceOptions, createConnectMenuActions } = await import('./connect-create-menu');
jsxLoader.deregister();

const story = createDefaultNode('reverieStories', { x: 0, y: 0 });
const storyPorts = getNodePorts(story);

test('Stories is a selectable Publication item alongside the unchanged Telegram submenu', () => {
  const publication = addNodeMenuGroups.find((group) => group.id === 'publication');
  assert.ok(publication);
  const stories = publication.items.find((entry) => 'type' in entry && entry.type === 'reverieStories');
  assert.ok(stories && 'type' in stories);
  assert.equal(stories.label, getNodeDefinition('reverieStories').menuLabel);
  assert.equal(addNodeMenu.filter((item) => item.type === 'reverieStories').length, 1);
  const telegram = publication.items.find((entry) => 'id' in entry && entry.id === 'telegram');
  assert.ok(telegram && 'items' in telegram);
  assert.ok(telegram.items.some((entry) => 'type' in entry && entry.type === 'telegramPublication'));
  let created: string | undefined;
  const action = createAddNodeContextMenuActions(publication.items, (type) => { created = type; }).find((entry) => entry.id === 'add-reverieStories');
  assert.ok(action && 'onSelect' in action && !action.disabled);
  action.onSelect();
  assert.equal(created, 'reverieStories');
});

for (const [kind, expectedPort] of [['text', 'title'], ['image', 'image'], ['video', 'video'], ['json', 'document'], ['any', 'document']] as const) {
  test(`creating Stories from ${kind} chooses a real compatible ${expectedPort} input`, () => {
    const option = getConnectCreateOptions(kind).find((entry) => entry.type === 'reverieStories');
    assert.equal(option?.targetPortId, expectedPort);
    const port = storyPorts.find((entry) => entry.id === option?.targetPortId);
    assert.ok(port && port.side === 'input');
    assert.ok(kind === 'any' || port.kind === kind);
  });
}
test('Stories output is offered for JSON receivers and never for incompatible types', () => {
  for (const kind of ['json', 'any'] as const) {
    const option = getConnectCreateSourceOptions(kind).find((entry) => entry.type === 'reverieStories');
    assert.equal(option?.sourcePortId, 'story');
    assert.ok(storyPorts.some((entry) => entry.id === option?.sourcePortId && entry.kind === 'json' && entry.side === 'output'));
    let selected: unknown;
    const action = createConnectMenuActions([option!], (value) => { selected = value; })[0];
    assert.ok('onSelect' in action); action.onSelect(); assert.equal(selected, option);
  }
  for (const kind of ['audio', 'boolean', 'number', 'text', 'image', 'video', 'subject', 'location'] as PortKind[]) {
    assert.ok(!getConnectCreateSourceOptions(kind).some((entry) => entry.type === 'reverieStories'));
  }
  assert.ok(!getConnectCreateOptions('audio').some((entry) => entry.type === 'reverieStories'));
});

test('Crop is offered from video and image wires with separate real ports', () => {
  for (const [kind, input, output] of [['video', 'video', 'videoResult'], ['image', 'image', 'result']] as const) {
    const crop = createDefaultNode('cropImage', { x: 0, y: 0 });
    const ports = getNodePorts(crop);
    assert.equal(getConnectCreateOptions(kind).find((entry) => entry.type === 'cropImage')?.targetPortId, input);
    assert.equal(getConnectCreateSourceOptions(kind).find((entry) => entry.type === 'cropImage')?.sourcePortId, output);
    assert.ok(ports.some((port) => port.id === input && port.kind === kind && port.side === 'input'));
    assert.ok(ports.some((port) => port.id === output && port.kind === kind && port.side === 'output'));
  }
  assert.equal(getConnectCreateOptions('audio').some((entry) => entry.type === 'cropImage'), false);
});

test('Timeline typed outputs are discoverable without changing its legacy JSON output choice', () => {
  for (const [kind, port] of [['video', 'videoResult'], ['image', 'frames'], ['text', 'descriptions'], ['json', 'timeline']] as const) {
    assert.equal(getConnectCreateSourceOptions(kind).find((entry) => entry.type === 'timelineHandoff')?.sourcePortId, port);
  }
});
