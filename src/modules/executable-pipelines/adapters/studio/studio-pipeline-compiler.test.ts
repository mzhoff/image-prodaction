import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';
import { compileStudioSection } from './studio-pipeline-compiler.ts';

test('infers a text prompt root as input and a text result leaf as output', () => {
  const compiled = compileStudioSection(createTextProject(), 'section-main');

  assert.deepEqual(Object.keys(compiled.compiledPlan.definition.inputs), ['input']);
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    result: { nodeId: 'result-node', outputKey: 'text' },
  });
  assert.deepEqual(compiled.compiledPlan.executionLevels, [
    ['generation-node'],
    ['result-node'],
  ]);
  assert.deepEqual(compiled.sourceMetadata.inputs[0], {
    kind: 'text',
    name: 'input',
    nodeId: 'input-node',
    nodeTitle: 'Input',
    portId: 'text',
  });
  assert.equal(compiled.sourceMetadata.outputs[0]?.nodeTitle, 'Result');
});

test('uses Preview as an explicit image output boundary', () => {
  const project = createTextProject();
  project.nodes = [
    node('image-input', 'importImage', 100, { title: 'Reference' }),
    node('image-generation', 'generateImage', 500, {
      title: 'Generate Image',
      model: 'openai/gpt-image-1',
      prompt: 'Product photo',
      aspectRatio: '1:1',
      size: '1K',
    }),
    node('preview-node', 'preview', 900, { title: 'Preview' }),
  ];
  project.edges = [
    edge('image-input', 'image', 'image-generation', 'reference'),
    edge('image-generation', 'image', 'preview-node', 'image'),
  ];

  const compiled = compileStudioSection(project, 'section-main');
  assert.equal(compiled.sourceMetadata.inputs[0]?.kind, 'image');
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    preview: { nodeId: 'image-generation', outputKey: 'image' },
  });
  assert.equal(compiled.sourceMetadata.outputs[0]?.nodeId, 'preview-node');
});

test('rejects a section connected to a node outside its boundary', () => {
  const project = createTextProject();
  project.nodes.push(node('outside-node', 'textPrompt', 2400, { title: 'Outside', text: 'x' }));
  project.edges.push(edge('result-node', 'text', 'outside-node', 'variable-0'));

  assert.throws(
    () => compileStudioSection(project, 'section-main'),
    /за её пределами/,
  );
});

function createTextProject(): GraphProject {
  return {
    version: 1,
    nodes: [
      node('input-node', 'textPrompt', 100, { title: 'Input', text: 'Draft' }),
      node('generation-node', 'textGeneration', 500, {
        title: 'Text Gen',
        model: 'google/gemini-2.5-flash',
        instruction: 'Rewrite',
        outputStyle: 'plain',
      }),
      node('result-node', 'textPrompt', 900, {
        title: 'Result',
        text: '@Generated text',
        variables: [{ id: 'variable-0', alias: 'Generated text' }],
      }),
    ],
    sections: [{
      id: 'section-main',
      title: 'Test Pipeline',
      position: { x: 0, y: 0 },
      size: { width: 1800, height: 1200 },
    }],
    edges: [
      edge('input-node', 'text', 'generation-node', 'text'),
      edge('generation-node', 'result', 'result-node', 'variable-0'),
    ],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
  };
}

function node(id: string, type: ProductionNode['type'], x: number, data: Record<string, unknown>) {
  return {
    id,
    type,
    position: { x, y: 200 },
    size: { width: 280, height: 360 },
    status: 'idle',
    data,
  } as unknown as ProductionNode;
}

function edge(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
  };
}
