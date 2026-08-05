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

test('compiles Export Image as a server operation and image output boundary', () => {
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
    node('image-export', 'exportImage', 900, {
      title: 'Cover',
      background: 'white',
      format: 'webp',
      quality: '90',
      scale: '1',
    }),
  ];
  project.edges = [
    edge('image-input', 'image', 'image-generation', 'reference'),
    edge('image-generation', 'image', 'image-export', 'image-0'),
  ];

  const compiled = compileStudioSection(project, 'section-main');
  assert.deepEqual(compiled.compiledPlan.definition.nodes.map((item) => item.handlerType), [
    'ai.image.generate',
    'image.export',
  ]);
  assert.deepEqual(compiled.compiledPlan.definition.nodes[1]?.config, {
    background: 'white',
    format: 'webp',
    quality: '90',
    scale: '1',
  });
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    cover: { nodeId: 'image-export', outputKey: 'image' },
  });
  assert.deepEqual(compiled.sourceMetadata.outputs[0], {
    kind: 'image',
    name: 'cover',
    nodeId: 'image-export',
    nodeTitle: 'Cover',
    portId: 'image',
  });
});

test('Export Image exposes an image collection when several sources are connected', () => {
  const project = createTextProject();
  project.nodes = [
    node('image-a', 'importImage', 100, { title: 'First image' }),
    node('image-b', 'importImage', 200, { title: 'Second image' }),
    node('image-export', 'exportImage', 900, {
      title: 'Batch',
      background: 'transparent',
      format: 'png',
      quality: '90',
      scale: '1',
    }),
  ];
  project.edges = [
    edge('image-a', 'image', 'image-export', 'image-0'),
    edge('image-b', 'image', 'image-export', 'image-1'),
  ];

  const compiled = compileStudioSection(project, 'section-main');
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    batch: { nodeId: 'image-export', outputKey: 'images' },
  });
  assert.equal(compiled.sourceMetadata.outputs[0]?.kind, 'image_collection');
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

test('compiles Router away and binds its consumer directly to the real source', () => {
  const project = createTextProject();
  project.nodes.splice(1, 0, node('router-node', 'router', 350, { title: 'Router' }));
  project.edges = [
    edge('input-node', 'text', 'router-node', 'input'),
    edge('router-node', 'output', 'generation-node', 'text'),
    edge('generation-node', 'result', 'result-node', 'variable-0'),
  ];

  const compiled = compileStudioSection(project, 'section-main');
  assert.equal(compiled.compiledPlan.definition.nodes.some((item) => item.id === 'router-node'), false);
  assert.deepEqual(compiled.compiledPlan.definition.nodes[0]?.inputs.text, {
    inputKey: 'input',
    source: 'pipeline-input',
  });
});

test('compiles Text Splitter and Text Formatter into production handlers', () => {
  const project = createTextProject();
  project.nodes = [
    node('input-node', 'textPrompt', 100, { title: 'Input', text: 'Draft' }),
    node('split-node', 'textSplitter', 500, {
      title: 'Parts',
      mode: 'delimiter',
      delimiter: '*',
      items: ['one', 'two'],
    }),
    node('format-node', 'textFormatter', 900, {
      title: 'Formatted',
      presetId: 'telegram-post',
      plainText: '',
      richText: '',
    }),
  ];
  project.edges = [
    edge('input-node', 'text', 'split-node', 'text'),
    edge('split-node', 'item-0', 'format-node', 'text'),
  ];

  const compiled = compileStudioSection(project, 'section-main');
  assert.deepEqual(compiled.compiledPlan.definition.nodes.map((item) => item.handlerType), [
    'text.split',
    'text.format',
  ]);
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    formatted: { nodeId: 'format-node', outputKey: 'text' },
  });
});

test('rejects publication when a compiled handler is absent in production', () => {
  assert.throws(
    () => compileStudioSection(createTextProject(), 'section-main', {
      isHandlerSupported: (handlerType) => handlerType !== 'ai.text.generate',
    }),
    /is not supported/,
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
