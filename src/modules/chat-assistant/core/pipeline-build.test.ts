import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import {
  applyPipelineBuildPatch,
  parsePipelineBuildInput,
  preparePipelineBuild,
  resolvePipelineDocumentName,
} from './pipeline-build.ts';

test('prepares a deterministic connected image pipeline with safe settings and coordinates', () => {
  const input = parsePipelineBuildInput({
    documentName: 'Editorial portrait generator',
    summary: 'Generate an image from a reusable prompt and show a preview.',
    nodes: [
      { key: 'prompt', type: 'textPrompt', settings: { text: 'Editorial portrait', title: 'Prompt' } },
      { key: 'generate', type: 'generateImage', settings: { aspectRatio: '1:1', title: 'Generate' } },
      { key: 'preview', type: 'preview', settings: { title: 'Preview' } },
    ],
    edges: [
      { sourceNodeKey: 'prompt', sourcePortId: 'text', targetNodeKey: 'generate', targetPortId: 'prompt' },
      { sourceNodeKey: 'generate', sourcePortId: 'image', targetNodeKey: 'preview', targetPortId: 'image' },
    ],
    layout: { direction: 'horizontal' },
  });

  const prepared = preparePipelineBuild(input, structuredClone(initialProject));
  const project = applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch);

  assert.equal(project.nodes.length, 3);
  assert.equal(project.edges.length, 2);
  assert.equal(project.nodes[0].data.title, 'Prompt');
  assert.equal('text' in project.nodes[0].data ? project.nodes[0].data.text : undefined, 'Editorial portrait');
  assert.ok(project.nodes[0].position.x < project.nodes[1].position.x);
  assert.ok(project.nodes[1].position.x < project.nodes[2].position.x);
  assert.equal(prepared.safePreview.addedNodeCount, 3);
  assert.equal(prepared.safePreview.addedEdgeCount, 2);
  assert.equal(prepared.patch.documentName, 'Editorial portrait generator');
  assert.equal(prepared.safePreview.documentName, 'Editorial portrait generator');
});

test('rejects cycles and incompatible ports while safely omitting misplaced settings', () => {
  assert.throws(() => preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Rejected cyclic graph',
    summary: 'A cyclic graph that must be rejected.',
    nodes: [
      { key: 'one', type: 'textGeneration' },
      { key: 'two', type: 'textGeneration' },
    ],
    edges: [
      { sourceNodeKey: 'one', sourcePortId: 'result', targetNodeKey: 'two', targetPortId: 'text' },
      { sourceNodeKey: 'two', sourcePortId: 'result', targetNodeKey: 'one', targetPortId: 'text' },
    ],
  }), structuredClone(initialProject)), /must not contain cycles/);

  assert.throws(() => preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Rejected incompatible graph',
    summary: 'An incompatible graph that must be rejected.',
    nodes: [
      { key: 'prompt', type: 'textPrompt' },
      { key: 'preview', type: 'preview' },
    ],
    edges: [
      { sourceNodeKey: 'prompt', sourcePortId: 'text', targetNodeKey: 'preview', targetPortId: 'image' },
    ],
  }), structuredClone(initialProject)), /are incompatible/);

  const sanitized = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Safe settings check',
    summary: 'A node with an unsupported setting.',
    nodes: [{ key: 'preview', type: 'preview', settings: { prompt: 'Not supported' } }],
    edges: [],
  }), structuredClone(initialProject));
  assert.equal('prompt' in sanitized.patch.nodes[0].data, false);
  assert.deepEqual(sanitized.safePreview.nodes[0].settings, {});
  assert.match(sanitized.safePreview.warnings[0], /prompt.*пропущена/u);
});

test('keeps supported formatter configuration and reports invalid model settings in preview', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Telegram post formatter',
    summary: 'Format a generated Telegram post.',
    nodes: [
      {
        key: 'formatter',
        type: 'textFormatter',
        settings: { presetId: 'telegram-post', temperature: 'friendly', tone: 'ironic' },
      },
    ],
    edges: [],
  }), structuredClone(initialProject));

  assert.equal(
    'presetId' in prepared.patch.nodes[0].data ? prepared.patch.nodes[0].data.presetId : undefined,
    'telegram-post',
  );
  assert.deepEqual(prepared.safePreview.nodes[0].settings, { presetId: 'telegram-post' });
  assert.equal(prepared.safePreview.warnings.length, 2);
  assert.match(prepared.safePreview.warnings.join('\n'), /temperature.*пропущена/u);
  assert.match(prepared.safePreview.warnings.join('\n'), /tone.*пропущена/u);
});

test('keeps every connected input on the left and aligns result sinks on the right', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Parallel text processing',
    summary: 'Process one short and one longer text branch.',
    nodes: [
      { key: 'short-input', type: 'textPrompt' },
      { key: 'long-input', type: 'textPrompt' },
      { key: 'short-result', type: 'textFormatter' },
      { key: 'generation', type: 'textGeneration' },
      { key: 'long-result', type: 'textFormatter' },
    ],
    edges: [
      { sourceNodeKey: 'short-input', sourcePortId: 'text', targetNodeKey: 'short-result', targetPortId: 'text' },
      { sourceNodeKey: 'long-input', sourcePortId: 'text', targetNodeKey: 'generation', targetPortId: 'text' },
      { sourceNodeKey: 'generation', sourcePortId: 'result', targetNodeKey: 'long-result', targetPortId: 'text' },
    ],
  }), structuredClone(initialProject));
  const positions = new Map(prepared.safePreview.nodes.map((node) => [node.key, node.position]));

  assert.equal(positions.get('short-input')?.x, positions.get('long-input')?.x);
  assert.ok(positions.get('short-input')!.x < positions.get('generation')!.x);
  assert.equal(positions.get('short-result')?.x, positions.get('long-result')?.x);
  assert.ok(positions.get('generation')!.x < positions.get('short-result')!.x);
});

test('moves explicitly positioned nodes into a free area when they overlap the current graph', () => {
  const base = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Current image pipeline',
    summary: 'Create the current graph.',
    nodes: [
      { key: 'prompt', type: 'textPrompt' },
      { key: 'generate', type: 'generateImage' },
      { key: 'preview', type: 'preview' },
    ],
    edges: [
      { sourceNodeKey: 'prompt', sourcePortId: 'text', targetNodeKey: 'generate', targetPortId: 'prompt' },
      { sourceNodeKey: 'generate', sourcePortId: 'image', targetNodeKey: 'preview', targetPortId: 'image' },
    ],
  }), structuredClone(initialProject));
  const currentProject = applyPipelineBuildPatch(structuredClone(initialProject), base.patch);

  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Current image pipeline',
    summary: 'Add a router without covering the current graph.',
    nodes: [{ key: 'router', type: 'router' }],
    edges: [],
    layout: { originX: 900, originY: 240 },
  }), currentProject);
  const router = prepared.patch.nodes[0];

  assert.match(prepared.safePreview.warnings[0], /координаты.*свободную область/u);
  assert.ok(currentProject.nodes.every((node) => (
    router.position.x >= node.position.x + node.size.width + 32
    || router.position.x + router.size.width + 32 <= node.position.x
    || router.position.y >= node.position.y + node.size.height + 32
    || router.position.y + router.size.height + 32 <= node.position.y
  )));
});

test('renames only an untitled document and preserves an explicit user name', () => {
  const patch = {
    documentName: 'Telegram posts from notes',
    summary: 'Generate Telegram posts from editable notes.',
  };

  assert.equal(resolvePipelineDocumentName('Untitled Pipeline', patch), 'Telegram posts from notes');
  assert.equal(resolvePipelineDocumentName('My editorial workflow', patch), 'My editorial workflow');
});

test('expands text concat dynamic inputs when a recipe has more than two text parts', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Controlled prompt',
    summary: 'Join three editable prompt parts before generation.',
    nodes: [
      { key: 'notes', type: 'textPrompt' },
      { key: 'rules', type: 'textPrompt' },
      { key: 'style', type: 'textPrompt' },
      { key: 'concat', type: 'textConcat' },
      { key: 'generation', type: 'textGeneration' },
    ],
    edges: [
      { sourceNodeKey: 'notes', sourcePortId: 'text', targetNodeKey: 'concat', targetPortId: 'text-0' },
      { sourceNodeKey: 'rules', sourcePortId: 'text', targetNodeKey: 'concat', targetPortId: 'text-1' },
      { sourceNodeKey: 'style', sourcePortId: 'text', targetNodeKey: 'concat', targetPortId: 'text-2' },
      { sourceNodeKey: 'concat', sourcePortId: 'result', targetNodeKey: 'generation', targetPortId: 'text' },
    ],
  }), structuredClone(initialProject));
  const concat = prepared.patch.nodes.find((node) => node.type === 'textConcat');
  const generation = prepared.patch.nodes.find((node) => node.type === 'textGeneration')!;
  const inputs = prepared.patch.nodes.filter((node) => node.type === 'textPrompt');

  assert.equal(concat && 'inputCount' in concat.data ? concat.data.inputCount : undefined, 3);
  assert.equal(prepared.patch.edges.length, 4);
  assert.equal(new Set(inputs.map((node) => node.position.x)).size, 1);
  assert.ok(inputs[0].position.x < concat!.position.x);
  assert.ok(concat!.position.x < generation.position.x);
  const inputsCenter = (
    Math.min(...inputs.map((node) => node.position.y))
    + Math.max(...inputs.map((node) => node.position.y + node.size.height))
  ) / 2;
  assert.equal(concat!.position.y + concat!.size.height / 2, inputsCenter);
});

test('creates a text prompt template with bounded typed variables', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Prompt template',
    summary: 'Assemble editable inputs inside a named text template.',
    nodes: [
      { key: 'notes', type: 'textPrompt' },
      { key: 'rules', type: 'textPrompt' },
      {
        key: 'template',
        type: 'textPrompt',
        settings: {
          text: '@Notes\n\n@Rules',
          variables: [
            { id: 'variable-0', alias: 'Notes' },
            { id: 'variable-1', alias: 'Rules' },
          ],
        },
      },
      { key: 'generation', type: 'textGeneration' },
    ],
    edges: [
      { sourceNodeKey: 'notes', sourcePortId: 'text', targetNodeKey: 'template', targetPortId: 'variable-0' },
      { sourceNodeKey: 'rules', sourcePortId: 'text', targetNodeKey: 'template', targetPortId: 'variable-1' },
      { sourceNodeKey: 'template', sourcePortId: 'text', targetNodeKey: 'generation', targetPortId: 'text' },
    ],
  }), structuredClone(initialProject));
  const template = prepared.patch.nodes.find((node) => (
    node.type === 'textPrompt' && 'text' in node.data && node.data.text === '@Notes\n\n@Rules'
  ))!;

  assert.deepEqual('variables' in template.data ? template.data.variables : undefined, [
    { id: 'variable-0', alias: 'Notes' },
    { id: 'variable-1', alias: 'Rules' },
  ]);
  assert.deepEqual(
    prepared.patch.edges.filter((edge) => edge.targetNodeId === template.id).map((edge) => edge.targetPortId),
    ['variable-0', 'variable-1'],
  );
  assert.equal(prepared.safePreview.nodes.find((node) => node.key === 'template')?.settings.variables, 2);
});
