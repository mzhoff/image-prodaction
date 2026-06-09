import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  canKeepSingleIncomingEdge,
  INPUT_ALREADY_CONNECTED_REASON,
  isTextPromptVariablePortId,
  PROMPT_VARIABLE_CONNECTED_REASON,
  resolveTargetPortConnectionConflict,
} from './port-contract.ts';
import type { GraphEdge, ProductionNode } from './types.ts';

const sourceNodeA = {
  id: 'source-a',
  type: 'textPrompt',
  position: { x: 0, y: 0 },
  size: { width: 220, height: 360 },
  status: 'idle',
  data: {
    title: 'Source A',
    text: 'a',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
} as ProductionNode;

const sourceNodeB = {
  id: 'source-b',
  type: 'textPrompt',
  position: { x: 0, y: 0 },
  size: { width: 220, height: 360 },
  status: 'idle',
  data: {
    title: 'Source B',
    text: 'b',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
} as ProductionNode;

const textGenerationTarget = {
  id: 'text-generation',
  type: 'textGeneration',
  position: { x: 120, y: 0 },
  size: { width: 280, height: 420 },
  status: 'idle',
  data: {
    title: 'Generation target',
    model: 'google/gemini-2.5-flash',
    instruction: 'Use this input.',
    outputStyle: 'plain',
    reasoning: 'low',
    result: '',
    resultTexts: [],
    activeResultIndex: -1,
  },
} as ProductionNode;

const textConcatTarget = {
  id: 'text-concat',
  type: 'textConcat',
  position: { x: 160, y: 0 },
  size: { width: 280, height: 420 },
  status: 'idle',
  data: {
    title: 'Concat',
    separator: 'newline',
    customSeparator: '',
    inputCount: 3,
    prefix: '',
    suffix: '',
    result: '',
  },
} as ProductionNode;

const exportImageTarget = {
  id: 'export-image',
  type: 'exportImage',
  position: { x: 250, y: 0 },
  size: { width: 260, height: 330 },
  status: 'idle',
  data: {
    title: 'Export',
    imageInputCount: 1,
    format: 'png',
    quality: '90',
    scale: '1',
    background: 'transparent',
  },
} as ProductionNode;

const textPromptTarget = {
  id: 'text-prompt',
  type: 'textPrompt',
  position: { x: 220, y: 0 },
  size: { width: 300, height: 360 },
  status: 'idle',
  data: {
    title: 'Prompt target',
    text: '',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [
      { id: 'variable-0', alias: 'Variable 1' },
      { id: 'variable-1', alias: 'Variable 2' },
    ],
  },
} as ProductionNode;

beforeEach(() => {
  // normalization helper is pure and does not require mutable state.
});

test('resolveTargetPortConnectionConflict blocks a fixed input port when already occupied', () => {
  const occupiedEdge: GraphEdge = {
    id: 'occupied',
    sourceNodeId: sourceNodeA.id,
    sourcePortId: 'text',
    targetNodeId: textGenerationTarget.id,
    targetPortId: 'text',
  };
  const newEdge: GraphEdge = {
    ...occupiedEdge,
    id: 'new',
    sourceNodeId: sourceNodeB.id,
  };

  const conflict = resolveTargetPortConnectionConflict({
    edges: [occupiedEdge, newEdge],
    targetNode: textGenerationTarget,
    targetPortId: 'text',
  });

  assert.equal(conflict.isBlocked, true);
  assert.equal(conflict.reason, INPUT_ALREADY_CONNECTED_REASON);
  assert.equal(conflict.blockedEdge?.id, occupiedEdge.id);
});

test('resolveTargetPortConnectionConflict allows swap on dynamic input ports when dragging a detached edge', () => {
  const occupiedByTextZero: GraphEdge = {
    id: 'occupied-zero',
    sourceNodeId: sourceNodeA.id,
    sourcePortId: 'text',
    targetNodeId: textConcatTarget.id,
    targetPortId: 'text-0',
  };
  const occupiedByTextOne: GraphEdge = {
    id: 'occupied-one',
    sourceNodeId: sourceNodeB.id,
    sourcePortId: 'text',
    targetNodeId: textConcatTarget.id,
    targetPortId: 'text-1',
  };
  const detachedEdge: GraphEdge = {
    ...occupiedByTextOne,
    targetPortId: 'text-1',
  };

  const conflict = resolveTargetPortConnectionConflict({
    edges: [occupiedByTextZero, occupiedByTextOne],
    targetNode: textConcatTarget,
    targetPortId: 'text-0',
    detachedEdge,
  });

  assert.equal(conflict.isBlocked, false);
  assert.equal(conflict.isSwapAllowed, true);
  assert.equal(conflict.blockedEdge?.id, occupiedByTextZero.id);
});

test('resolveTargetPortConnectionConflict allows swap on export image dynamic input ports when dragging a detached edge', () => {
  const occupiedByImageZero: GraphEdge = {
    id: 'occupied-zero',
    sourceNodeId: sourceNodeA.id,
    sourcePortId: 'text',
    targetNodeId: exportImageTarget.id,
    targetPortId: 'image-0',
  };
  const occupiedByImageOne: GraphEdge = {
    id: 'occupied-one',
    sourceNodeId: sourceNodeB.id,
    sourcePortId: 'text',
    targetNodeId: exportImageTarget.id,
    targetPortId: 'image-1',
  };
  const detachedEdge: GraphEdge = {
    ...occupiedByImageOne,
    targetPortId: 'image-1',
  };

  const conflict = resolveTargetPortConnectionConflict({
    edges: [occupiedByImageZero, occupiedByImageOne],
    targetNode: exportImageTarget,
    targetPortId: 'image-0',
    detachedEdge,
  });

  assert.equal(conflict.isBlocked, false);
  assert.equal(conflict.isSwapAllowed, true);
  assert.equal(conflict.blockedEdge?.id, occupiedByImageZero.id);
});

test('resolveTargetPortConnectionConflict blocks prompt variable port if already occupied by another edge', () => {
  const occupiedVariable: GraphEdge = {
    id: 'occupied-variable',
    sourceNodeId: sourceNodeA.id,
    sourcePortId: 'text',
    targetNodeId: textPromptTarget.id,
    targetPortId: 'variable-0',
  };
  const conflictingVariable: GraphEdge = {
    id: 'conflicting-variable',
    sourceNodeId: sourceNodeB.id,
    sourcePortId: 'text',
    targetNodeId: textPromptTarget.id,
    targetPortId: 'variable-0',
  };

  const conflict = resolveTargetPortConnectionConflict({
    edges: [occupiedVariable, conflictingVariable],
    targetNode: textPromptTarget,
    targetPortId: 'variable-0',
  });

  assert.equal(conflict.isBlocked, true);
  assert.equal(conflict.reason, PROMPT_VARIABLE_CONNECTED_REASON);
});

test('resolveTargetPortConnectionConflict identifies prompt variable ports', () => {
  assert.equal(isTextPromptVariablePortId('variable-0'), true);
  assert.equal(isTextPromptVariablePortId('text-0'), false);
});

test('canKeepSingleIncomingEdge keeps only one edge for each fixed port and one per prompt variable slot', () => {
  const duplicateEdges: GraphEdge[] = [
    {
      id: 'fixed-1',
      sourceNodeId: sourceNodeA.id,
      sourcePortId: 'text',
      targetNodeId: textGenerationTarget.id,
      targetPortId: 'text',
    },
    {
      id: 'fixed-2',
      sourceNodeId: sourceNodeB.id,
      sourcePortId: 'text',
      targetNodeId: textGenerationTarget.id,
      targetPortId: 'text',
    },
    {
      id: 'variable-1',
      sourceNodeId: sourceNodeA.id,
      sourcePortId: 'text',
      targetNodeId: textPromptTarget.id,
      targetPortId: 'variable-0',
    },
    {
      id: 'variable-2',
      sourceNodeId: sourceNodeB.id,
      sourcePortId: 'text',
      targetNodeId: textPromptTarget.id,
      targetPortId: 'variable-0',
    },
    {
      id: 'variable-3',
      sourceNodeId: sourceNodeA.id,
      sourcePortId: 'text',
      targetNodeId: textPromptTarget.id,
      targetPortId: 'variable-1',
    },
  ];

  const keep = canKeepSingleIncomingEdge({
    edges: duplicateEdges,
    nodes: [sourceNodeA, sourceNodeB, textGenerationTarget, textPromptTarget],
  });

  assert.equal(keep.length, 3);
  const fixedPorts = keep.filter((edge) => edge.targetNodeId === textGenerationTarget.id);
  const promptPorts = keep.filter((edge) => edge.targetNodeId === textPromptTarget.id);
  assert.equal(fixedPorts.length, 1);
  assert.equal(fixedPorts[0].id, 'fixed-1');
  assert.equal(promptPorts.length, 2);
});
