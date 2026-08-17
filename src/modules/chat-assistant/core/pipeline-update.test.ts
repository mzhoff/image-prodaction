import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build.ts';
import { applyPipelineUpdatePatch, pipelineUpdateInputSchema, preparePipelineUpdate } from './pipeline-update.ts';

function createTelegramProject() {
  const build = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Telegram posts from notes',
    summary: 'Create the initial Telegram post graph.',
    nodes: [
      { key: 'notes', type: 'textPrompt', settings: { title: 'Заметка' } },
      { key: 'generation', type: 'textGeneration', settings: { instruction: 'All rules mixed together.' } },
      { key: 'formatter', type: 'textFormatter', settings: { presetId: 'telegram-post' } },
    ],
    edges: [
      { sourceNodeKey: 'notes', sourcePortId: 'text', targetNodeKey: 'generation', targetPortId: 'text' },
      { sourceNodeKey: 'generation', sourcePortId: 'result', targetNodeKey: 'formatter', targetPortId: 'text' },
    ],
  }), structuredClone(initialProject));
  return applyPipelineBuildPatch(structuredClone(initialProject), build.patch);
}

test('updates an existing graph with editable rules, style and a three-input text concat', () => {
  const current = createTelegramProject();
  const unrelated = createDefaultNode('textPrompt', { x: 3_100, y: 2_800 });
  current.nodes.push(unrelated);
  const notes = current.nodes.find((node) => node.type === 'textPrompt')!;
  const generation = current.nodes.find((node) => node.type === 'textGeneration')!;
  const promptEdge = current.edges.find((edge) => edge.targetNodeId === generation.id)!;
  const input = pipelineUpdateInputSchema.parse({
    summary: 'Separate notes, formatting rules and style before generation.',
    nodes: [
      { key: 'rules', type: 'textPrompt', settings: { title: 'Правила поста' } },
      { key: 'style', type: 'textPrompt', settings: { title: 'Стиль и тон' } },
      {
        key: 'concat',
        type: 'textConcat',
        settings: { rawPayload: 'must not reach preview', separator: 'double-newline', title: 'Сборка промпта' },
      },
    ],
    updates: [{ nodeId: generation.id, settings: { instruction: 'Generate a Telegram post from the connected structured prompt.' } }],
    removeEdgeIds: [promptEdge.id],
    edges: [
      { sourceNodeRef: notes.id, sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-0' },
      { sourceNodeRef: 'rules', sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-1' },
      { sourceNodeRef: 'style', sourcePortId: 'text', targetNodeRef: 'concat', targetPortId: 'text-2' },
      { sourceNodeRef: 'concat', sourcePortId: 'result', targetNodeRef: generation.id, targetPortId: 'text' },
    ],
  });
  const prepared = preparePipelineUpdate(input, current);
  const updated = applyPipelineUpdatePatch(current, prepared.patch);
  const concat = updated.nodes.find((node) => node.type === 'textConcat')!;
  const updatedGeneration = updated.nodes.find((node) => node.id === generation.id)!;
  const formatter = updated.nodes.find((node) => node.type === 'textFormatter')!;
  const inputNodes = updated.nodes.filter((node) => (
    node.type === 'textPrompt' && ['Заметка', 'Правила поста', 'Стиль и тон'].includes(node.data.title)
  ));

  assert.equal(updated.nodes.length, 7);
  assert.equal(updated.edges.length, 5);
  assert.equal('inputCount' in concat.data ? concat.data.inputCount : undefined, 3);
  assert.equal(
    'instruction' in updatedGeneration.data ? updatedGeneration.data.instruction : undefined,
    'Generate a Telegram post from the connected structured prompt.',
  );
  assert.equal(prepared.safePreview.updatedNodeCount, 1);
  assert.equal(prepared.safePreview.removedEdgeCount, 1);
  assert.equal(inputNodes.length, 3);
  assert.equal(new Set(inputNodes.map((node) => node.position.x)).size, 1);
  assert.ok(inputNodes[0].position.x < concat.position.x);
  assert.ok(concat.position.x < updatedGeneration.position.x);
  assert.ok(updatedGeneration.position.x < formatter.position.x);
  assert.ok(prepared.patch.movedNodes.some((move) => move.nodeId === generation.id));
  assert.equal(prepared.safePreview.movedNodeCount, prepared.patch.movedNodes.length);
  assert.deepEqual(updated.nodes.find((node) => node.id === unrelated.id)?.position, unrelated.position);
  const inputsCenter = (
    Math.min(...inputNodes.map((node) => node.position.y))
    + Math.max(...inputNodes.map((node) => node.position.y + node.size.height))
  ) / 2;
  assert.equal(concat.position.y + concat.size.height / 2, inputsCenter);
  const concatPreview = prepared.safePreview.nodes.find((node) => node.type === 'textConcat')!;
  assert.equal('rawPayload' in concatPreview.settings, false);
  assert.match(prepared.safePreview.warnings.join(' '), /rawPayload/);
});

test('includes an occupied input edge in the safe replacement preview', () => {
  const current = createTelegramProject();
  const generation = current.nodes.find((node) => node.type === 'textGeneration')!;
  const existingEdge = current.edges.find((edge) => edge.targetNodeId === generation.id)!;
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Replace the current generation input with a new source.',
    nodes: [{ key: 'extra', type: 'textPrompt' }],
    updates: [],
    removeEdgeIds: [],
    edges: [{ sourceNodeRef: 'extra', sourcePortId: 'text', targetNodeRef: generation.id, targetPortId: 'text' }],
  }), current);

  assert.deepEqual(prepared.patch.removeEdgeIds, [existingEdge.id]);
  assert.equal(prepared.safePreview.removedEdgeCount, 1);
  assert.match(prepared.safePreview.warnings.join(' '), /будет заменена/u);
});

test('compiles a text prompt template with variable inputs and corrects concat-style port aliases', () => {
  const current = createTelegramProject();
  const notes = current.nodes.find((node) => node.type === 'textPrompt')!;
  const generation = current.nodes.find((node) => node.type === 'textGeneration')!;
  const currentGenerationEdge = current.edges.find((edge) => edge.targetNodeId === generation.id)!;
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Replace concatenation with a template prompt.',
    nodes: [{
      key: 'template',
      type: 'textPrompt',
      settings: {
        text: '@Заметки\n\n@Правила',
        title: 'Шаблон промта',
        variables: [
          { id: 'variable-0', alias: 'Заметки' },
          { id: 'variable-1', alias: 'Правила' },
        ],
      },
    }, {
      key: 'rules',
      type: 'textPrompt',
      settings: { title: 'Правила', text: 'Сохраняй факты.' },
    }],
    edges: [
      { sourceNodeRef: notes.id, sourcePortId: 'text', targetNodeRef: 'template', targetPortId: 'text-0' },
      { sourceNodeRef: 'rules', sourcePortId: 'text', targetNodeRef: 'template', targetPortId: 'text-1' },
      { sourceNodeRef: 'template', sourcePortId: 'text', targetNodeRef: generation.id, targetPortId: 'text' },
    ],
  }), current);
  const updated = applyPipelineUpdatePatch(current, prepared.patch);
  const template = updated.nodes.find((node) => node.data.title === 'Шаблон промта')!;
  const templateEdges = updated.edges.filter((edge) => edge.targetNodeId === template.id);

  assert.deepEqual(templateEdges.map((edge) => edge.targetPortId), ['variable-0', 'variable-1']);
  assert.equal(updated.edges.some((edge) => edge.id === currentGenerationEdge.id), false);
  assert.equal(updated.edges.some((edge) => (
    edge.sourceNodeId === template.id
    && edge.targetNodeId === generation.id
    && edge.targetPortId === 'text'
  )), true);
  assert.match(prepared.safePreview.warnings.join(' '), /text-0.*variable-0/u);
  assert.equal(prepared.safePreview.nodes.find((node) => node.key === 'template')?.settings.variables, 2);
});

test('does not move the graph when an update changes settings without changing topology', () => {
  const current = createTelegramProject();
  const generation = current.nodes.find((node) => node.type === 'textGeneration')!;
  const positions = current.nodes.map((node) => ({ id: node.id, position: node.position }));
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Update stable generation rules only.',
    updates: [{ nodeId: generation.id, settings: { instruction: 'Updated stable rules.' } }],
  }), current);
  const updated = applyPipelineUpdatePatch(current, prepared.patch);

  assert.deepEqual(prepared.patch.movedNodes, []);
  assert.deepEqual(
    updated.nodes.map((node) => ({ id: node.id, position: node.position })),
    positions,
  );
});

test('defaults omitted unchanged collections so the provider schema stays concise', () => {
  const parsed = pipelineUpdateInputSchema.parse({
    summary: 'Rename one existing node.',
    updates: [{ nodeId: 'node-1', settings: { title: 'Новое название' } }],
  });

  assert.deepEqual(parsed.nodes, []);
  assert.deepEqual(parsed.removeEdgeIds, []);
  assert.deepEqual(parsed.edges, []);
});

test('prepares a new import node from the latest attached image during graph update', () => {
  const current = createTelegramProject();
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Add the attached image as a reusable reference input.',
    nodes: [{ key: 'reference', type: 'importImage', sourceAttachmentIndex: 1 }],
  }), current);
  const importNode = prepared.patch.addedNodes.find((node) => node.type === 'importImage')!;

  assert.deepEqual(prepared.patch.attachmentImports, [{ attachmentIndex: 1, nodeId: importNode.id }]);
  assert.equal('assetId' in importNode.data, false);
});
