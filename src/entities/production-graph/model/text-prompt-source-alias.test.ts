import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionNode, TextPromptNodeData } from './types';
import {
  ensurePipelineInputPromptMentions,
  getTextPromptSourceAlias,
} from './text-prompt-source-alias.ts';

test('uses a Pipeline Input field key as the effective prompt variable alias', () => {
  const source = {
    id: 'pipeline-input',
    type: 'pipelineInput',
    data: {
      title: 'Pipeline Input',
      fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
    },
  } as ProductionNode;

  assert.equal(getTextPromptSourceAlias(source, 'field:article-field'), 'articleSummary');
});

test('falls back to a custom source title and ignores a default node title', () => {
  const customSource = {
    id: 'custom-source',
    type: 'textPrompt',
    data: { title: 'Article brief', text: '' },
  } as ProductionNode;
  const defaultSource = {
    id: 'default-source',
    type: 'textPrompt',
    data: { title: 'Prompt', text: '' },
  } as ProductionNode;

  assert.equal(getTextPromptSourceAlias(customSource, 'text'), 'Article brief');
  assert.equal(getTextPromptSourceAlias(defaultSource, 'text'), undefined);
});

test('adds a missing runtime mention to an existing Pipeline Input connection only once', () => {
  const source = {
    id: 'pipeline-input',
    type: 'pipelineInput',
    data: {
      title: 'Pipeline Input',
      fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
    },
  } as ProductionNode;
  const prompt = {
    id: 'prompt',
    type: 'textPrompt',
    data: {
      title: 'Article text',
      text: 'Use the article below.',
      variables: [{ id: 'variable-0', alias: 'Variable 1' }],
    },
  } as ProductionNode;
  const edge = {
    id: 'edge',
    sourceNodeId: source.id,
    sourcePortId: 'field:article-field',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  };

  const first = ensurePipelineInputPromptMentions([source, prompt], [edge]);
  const second = ensurePipelineInputPromptMentions(first, [edge]);
  const migrated = second.find((node) => node.id === prompt.id);

  assert.equal((migrated?.data as TextPromptNodeData | undefined)?.text, 'Use the article below.\n\n@Variable 1');
  assert.equal(second, first);
});

test('keeps an existing effective Pipeline Input alias without adding a legacy mention', () => {
  const source = {
    id: 'pipeline-input',
    type: 'pipelineInput',
    data: {
      title: 'Pipeline Input',
      fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
    },
  } as ProductionNode;
  const prompt = {
    id: 'prompt',
    type: 'textPrompt',
    data: {
      title: 'Article text',
      text: 'Use this: @articleSummary',
      variables: [{ id: 'variable-0', alias: 'Variable 1' }],
    },
  } as ProductionNode;
  const edge = {
    id: 'edge',
    sourceNodeId: source.id,
    sourcePortId: 'field:article-field',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  };

  const result = ensurePipelineInputPromptMentions([source, prompt], [edge]);

  assert.equal(result[1], prompt);
});

test('migrates a Pipeline Input connected through transparent Router nodes', () => {
  const source = {
    id: 'pipeline-input',
    type: 'pipelineInput',
    data: {
      title: 'Pipeline Input',
      fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
    },
  } as ProductionNode;
  const router = {
    id: 'router',
    type: 'router',
    data: { title: 'Router' },
  } as ProductionNode;
  const prompt = {
    id: 'prompt',
    type: 'textPrompt',
    data: {
      title: 'Article text',
      text: 'Use the routed article below.',
      variables: [{ id: 'variable-0', alias: 'Variable 1' }],
    },
  } as ProductionNode;
  const edges = [{
    id: 'input-router',
    sourceNodeId: source.id,
    sourcePortId: 'field:article-field',
    targetNodeId: router.id,
    targetPortId: 'input',
  }, {
    id: 'router-prompt',
    sourceNodeId: router.id,
    sourcePortId: 'output',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  }];

  const result = ensurePipelineInputPromptMentions([source, router, prompt], edges);

  assert.equal((result[2]?.data as TextPromptNodeData).text, 'Use the routed article below.\n\n@Variable 1');
});

test('does not recurse forever when a Router chain contains a cycle', () => {
  const firstRouter = {
    id: 'router-a',
    type: 'router',
    data: { title: 'Router A' },
  } as ProductionNode;
  const secondRouter = {
    id: 'router-b',
    type: 'router',
    data: { title: 'Router B' },
  } as ProductionNode;
  const prompt = {
    id: 'prompt',
    type: 'textPrompt',
    data: {
      title: 'Article text',
      text: 'Keep unchanged.',
      variables: [{ id: 'variable-0', alias: 'Variable 1' }],
    },
  } as ProductionNode;
  const edges = [{
    id: 'a-b',
    sourceNodeId: firstRouter.id,
    sourcePortId: 'output',
    targetNodeId: secondRouter.id,
    targetPortId: 'input',
  }, {
    id: 'b-a',
    sourceNodeId: secondRouter.id,
    sourcePortId: 'output',
    targetNodeId: firstRouter.id,
    targetPortId: 'input',
  }, {
    id: 'a-prompt',
    sourceNodeId: firstRouter.id,
    sourcePortId: 'output',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  }];

  const result = ensurePipelineInputPromptMentions([firstRouter, secondRouter, prompt], edges);

  assert.equal(result[2], prompt);
});
