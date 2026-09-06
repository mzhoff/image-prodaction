import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';
import { compileStudioSection } from './studio-pipeline-compiler.ts';

test('compiles a Pipeline Input field as a named Text Prompt variable with a legacy alias', () => {
  const compiled = compileStudioSection(createProject(), 'section-main');
  const prompt = compiled.compiledPlan.definition.nodes[0];

  assert.deepEqual(prompt, {
    id: 'prompt',
    handlerType: 'text.template.render',
    handlerVersion: '1',
    config: {
      template: 'Create a cover based on this article:\n\n@Variable 1',
      variables: [{
        id: 'variable-0',
        alias: 'articleSummary',
        mentionAliases: ['Variable 1'],
      }],
    },
    inputs: {
      'variable-0': { source: 'pipeline-input', inputKey: 'articleSummary' },
    },
  });
  assert.deepEqual(compiled.compiledPlan.definition.outputs, {
    prompt: { nodeId: 'prompt', outputKey: 'text' },
  });
});

function createProject(): GraphProject {
  return {
    version: 1,
    nodes: [
      node('pipeline-input', 'pipelineInput', 100, {
        title: 'Pipeline Input',
        fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
      }),
      node('prompt', 'textPrompt', 500, {
        title: 'Cover instruction',
        text: 'Create a cover based on this article:\n\n@Variable 1',
        variables: [{ id: 'variable-0', alias: 'Variable 1' }],
      }),
      node('pipeline-output', 'pipelineOutput', 900, {
        title: 'Pipeline Output',
        fields: [{ id: 'prompt-field', key: 'prompt', kind: 'text', required: true }],
      }),
    ],
    sections: [{
      id: 'section-main',
      title: 'Text prompt contract',
      position: { x: 0, y: 0 },
      size: { width: 1500, height: 1000 },
    }],
    edges: [
      edge('pipeline-input', 'field:article-field', 'prompt', 'variable-0'),
      edge('prompt', 'text', 'pipeline-output', 'field:prompt-field'),
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
