import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import type { GraphEdge, ProductionNode } from './types';
import { createEmptyProjectUiState } from './project-schema.ts';
import { useProductionGraphStore } from './use-production-graph-store.ts';

const BASE_GRAPH_STATE = {
  version: 1 as const,
  nodes: [] as ProductionNode[],
  sections: [],
  edges: [] as GraphEdge[],
  assets: [],
  presets: [],
  subjects: [],
  locations: [],
  publications: [],
  runs: [],
  selectedNodeIds: [],
  selectedSectionIds: [],
};

const textSourceA: ProductionNode = {
  id: 'text-source-a',
  type: 'textPrompt',
  position: { x: 0, y: 0 },
  size: { width: 220, height: 370 },
  status: 'idle',
  data: {
    title: 'Source A',
    text: 'A',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
} as ProductionNode;

const textSourceB: ProductionNode = {
  id: 'text-source-b',
  type: 'textPrompt',
  position: { x: 0, y: 0 },
  size: { width: 220, height: 370 },
  status: 'idle',
  data: {
    title: 'Source B',
    text: 'B',
    result: '',
    textareaHeight: 120,
    variableDisplayMode: 'source-value',
    variables: [],
  },
} as ProductionNode;

const imageSourceA: ProductionNode = {
  id: 'image-source-a',
  type: 'importImage',
  position: { x: 0, y: 0 },
  size: { width: 280, height: 180 },
  status: 'idle',
  data: {
    title: 'Image Source A',
    assetId: 'asset-a',
  },
} as ProductionNode;

const imageSourceB: ProductionNode = {
  id: 'image-source-b',
  type: 'importImage',
  position: { x: 0, y: 0 },
  size: { width: 280, height: 180 },
  status: 'idle',
  data: {
    title: 'Image Source B',
    assetId: 'asset-b',
  },
} as ProductionNode;

const textGenerationTarget: ProductionNode = {
  id: 'text-target',
  type: 'textGeneration',
  position: { x: 80, y: 0 },
  size: { width: 280, height: 420 },
  status: 'idle',
  data: {
    title: 'Text Target',
    model: 'google/gemini-2.5-flash',
    instruction: 'Use this input.',
    outputStyle: 'plain',
    reasoning: 'low',
    result: '',
    resultTexts: [],
    activeResultIndex: -1,
  },
} as ProductionNode;

const textConcatTarget: ProductionNode = {
  id: 'concat-target',
  type: 'textConcat',
  position: { x: 0, y: 0 },
  size: { width: 280, height: 420 },
  status: 'idle',
  data: {
    title: 'Concat Target',
    separator: 'newline',
    customSeparator: '',
    inputCount: 2,
    prefix: '',
    suffix: '',
    result: '',
  },
} as ProductionNode;

const textPromptTargetWithVariables: ProductionNode = {
  id: 'prompt-target',
  type: 'textPrompt',
  position: { x: 100, y: 0 },
  size: { width: 300, height: 330 },
  status: 'idle',
  data: {
    title: 'Prompt Target',
    text: '',
    result: '',
    textareaHeight: 120,
    variables: [
      { id: 'variable-0', alias: 'Variable 1' },
      { id: 'variable-1', alias: 'Variable 2' },
    ],
  },
} as ProductionNode;

const exportImageTarget: ProductionNode = {
  id: 'export-target',
  type: 'exportImage',
  position: { x: 120, y: 0 },
  size: { width: 260, height: 330 },
  status: 'idle',
  data: {
    title: 'Export target',
    imageInputCount: 1,
    format: 'png',
    quality: '90',
    scale: '1',
    background: 'transparent',
  },
} as ProductionNode;

const generateImageTarget: ProductionNode = {
  id: 'generate-target',
  type: 'generateImage',
  position: { x: 120, y: 0 },
  size: { width: 320, height: 720 },
  status: 'idle',
  data: {
    title: 'Generate Image',
    model: 'google/gemini-2.5-flash-image',
    aspectRatio: '1:1',
    size: '1K',
    prompt: '',
    activeResultIndex: -1,
    resultAssetIds: [],
  },
} as ProductionNode;

const compositionTarget: ProductionNode = {
  id: 'composition-target',
  type: 'composition',
  position: { x: 180, y: 0 },
  size: { width: 320, height: 430 },
  status: 'success',
  data: {
    title: 'Composition target',
    aspectRatio: '1:1',
    canvasHeight: 1080,
    canvasWidth: 1080,
    layerInputCount: 2,
    layers: [],
    resultAssetId: 'composition-result',
    resultSignature: 'old-signature',
    size: '1K',
  },
} as ProductionNode;

const telegramTarget: ProductionNode = {
  id: 'telegram-target',
  type: 'telegramPublication',
  position: { x: 180, y: 0 },
  size: { width: 320, height: 640 },
  status: 'idle',
  data: {
    title: 'Telegram target',
    artifactId: '',
    contentUnitId: 'telegram-post',
    mediaInputCount: 10,
    mediaOrder: [],
    messageText: '',
    platformId: 'telegram',
    messageRichText: '',
    messageRichTextSource: '',
    messageSourceText: '',
    result: '',
    sourceImageCount: 0,
    sourceTextCount: 0,
  },
} as ProductionNode;

function resetState(graph: { nodes: ProductionNode[]; edges?: GraphEdge[] }) {
  useProductionGraphStore.setState({
    ...BASE_GRAPH_STATE,
    ...graph,
    historyPast: [],
    historyFuture: [],
    uiState: createEmptyProjectUiState(),
  });
}

beforeEach(() => {
  resetState({ nodes: [textSourceA, textSourceB, textGenerationTarget] });
});

test('single fixed target input rejects an additional edge', () => {
  const store = useProductionGraphStore.getState();
  const first = store.connect('text-source-a', 'text', 'text-target', 'text');
  assert.equal(first.ok, true);
  assert.equal(useProductionGraphStore.getState().edges.length, 1);

  const second = useProductionGraphStore.getState().connect('text-source-b', 'text', 'text-target', 'text');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'This input is already connected.');
  assert.equal(useProductionGraphStore.getState().edges.length, 1);
});

test('Generate Image accepts multiple text inputs for the same production layer', () => {
  resetState({ nodes: [textSourceA, textSourceB, generateImageTarget] });

  const first = useProductionGraphStore.getState().connect(
    textSourceA.id,
    'text',
    generateImageTarget.id,
    'style',
  );
  const second = useProductionGraphStore.getState().connect(
    textSourceB.id,
    'text',
    generateImageTarget.id,
    'style',
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(useProductionGraphStore.getState().edges.length, 2);
});

test('text concat keeps one edge per text input port and allows swap while dragging', () => {
  const stateNodes = [
    textSourceA,
    textSourceB,
    {
      ...textConcatTarget,
      data: {
        ...textConcatTarget.data,
        inputCount: 2,
      },
    } as ProductionNode,
  ];
  resetState({ nodes: stateNodes });

  const state = useProductionGraphStore.getState();
  state.connect('text-source-a', 'text', 'concat-target', 'text-0');
  state.connect('text-source-b', 'text', 'concat-target', 'text-1');

  const sourceAtoText0 = useProductionGraphStore.getState().edges.find((edge) => edge.sourceNodeId === 'text-source-a');
  const sourceBtoText1 = useProductionGraphStore.getState().edges.find((edge) => edge.sourceNodeId === 'text-source-b');
  assert.ok(sourceAtoText0);
  assert.ok(sourceBtoText1);

  useProductionGraphStore.getState().deleteEdge(sourceAtoText0.id, { preserveDynamicInputSlots: true });

  const detached = {
    ...sourceAtoText0,
    targetNodeId: 'concat-target',
    targetPortId: 'text-0',
  };
  const swapped = useProductionGraphStore.getState().connect(
    detached.sourceNodeId,
    detached.sourcePortId,
    detached.targetNodeId,
    'text-1',
    { detachedEdge: detached },
  );

  assert.equal(swapped.ok, true);
  const reconnectedEdges = useProductionGraphStore.getState().edges;
  assert.equal(reconnectedEdges.length, 2);
  const sourceAMap = new Map(reconnectedEdges.map((edge) => [edge.sourceNodeId, edge.targetPortId]));

  assert.equal(sourceAMap.get('text-source-a'), 'text-1');
  assert.equal(sourceAMap.get('text-source-b'), 'text-0');
});

test('text prompt variables keep one edge per variable slot and allow moving within prompt inputs', () => {
  resetState({
    nodes: [
      textSourceA,
      textSourceB,
      textPromptTargetWithVariables,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('text-source-a', 'text', 'prompt-target', 'variable-0');
  state.connect('text-source-b', 'text', 'prompt-target', 'variable-1');

  const sourceAEdge = useProductionGraphStore.getState().edges.find((edge) => edge.sourceNodeId === 'text-source-a');
  assert.ok(sourceAEdge);
  useProductionGraphStore.getState().deleteEdge(sourceAEdge.id, { preserveDynamicInputSlots: true });

  const detached = {
    ...sourceAEdge,
    targetNodeId: 'prompt-target',
    targetPortId: 'variable-0',
  };
  const moved = useProductionGraphStore.getState().connect(
    detached.sourceNodeId,
    detached.sourcePortId,
    detached.targetNodeId,
    'variable-1',
    { detachedEdge: detached },
  );

  assert.equal(moved.ok, true);
  const edges = useProductionGraphStore.getState().edges;
  const sourceAResult = edges.find((edge) => edge.sourceNodeId === 'text-source-a');
  const sourceBResult = edges.find((edge) => edge.sourceNodeId === 'text-source-b');

  assert.ok(sourceAResult);
  assert.ok(sourceBResult);
  assert.equal(sourceAResult.targetPortId, 'variable-1');
  assert.equal(sourceBResult.targetPortId, 'variable-0');
});

test('export image node allows multiple image edges each on its own dynamic port', () => {
  resetState({
    nodes: [
      imageSourceA,
      imageSourceB,
      exportImageTarget,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('image-source-a', 'image', 'export-target', 'image-0');
  state.connect('image-source-b', 'image', 'export-target', 'image-1');

  const edges = useProductionGraphStore.getState().edges;
  assert.equal(edges.length, 2);
  const first = edges.find((edge) => edge.sourceNodeId === 'image-source-a');
  const second = edges.find((edge) => edge.sourceNodeId === 'image-source-b');
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.targetPortId, 'image-0');
  assert.equal(second.targetPortId, 'image-1');
});

test('export image delete edge compacts dynamic ports and keeps image inputs aligned', () => {
  resetState({
    nodes: [
      imageSourceA,
      imageSourceB,
      {
        ...exportImageTarget,
        data: {
          ...exportImageTarget.data,
          imageInputCount: 3,
        },
      },
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('image-source-a', 'image', 'export-target', 'image-0');
  state.connect('image-source-b', 'image', 'export-target', 'image-1');

  const firstEdge = useProductionGraphStore.getState().edges.find(
    (edge) => edge.sourceNodeId === 'image-source-a',
  );
  const secondEdge = useProductionGraphStore.getState().edges.find(
    (edge) => edge.sourceNodeId === 'image-source-b',
  );
  assert.ok(firstEdge);
  assert.ok(secondEdge);

  assert.equal(firstEdge.targetPortId, 'image-0');
  assert.equal(secondEdge.targetPortId, 'image-1');

  state.deleteEdge(secondEdge.id, { preserveDynamicInputSlots: false });

  const rest = useProductionGraphStore.getState().edges;
  assert.equal(rest.length, 1);
  assert.equal(rest[0].sourceNodeId, 'image-source-a');
  assert.equal(rest[0].targetPortId, 'image-0');

  const updatedExportImage = useProductionGraphStore.getState().nodes.find((item) => item.id === 'export-target');
  assert.ok(updatedExportImage);
  assert.equal((updatedExportImage.data as { imageInputCount?: number }).imageInputCount, 2);
});

test('composition invalidates rendered result when image input edge changes', () => {
  resetState({
    nodes: [
      imageSourceA,
      imageSourceB,
      compositionTarget,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('image-source-a', 'image', 'composition-target', 'layer-0');

  const afterConnect = useProductionGraphStore.getState().nodes.find((item) => item.id === 'composition-target');
  assert.ok(afterConnect);
  assert.equal((afterConnect.data as { resultAssetId?: string; resultSignature?: string }).resultAssetId, undefined);
  assert.equal((afterConnect.data as { resultAssetId?: string; resultSignature?: string }).resultSignature, undefined);

  useProductionGraphStore.setState((current) => ({
    nodes: current.nodes.map((node) => (
      node.id === 'composition-target'
        ? {
          ...node,
          data: {
            ...node.data,
            resultAssetId: 'composition-result',
            resultSignature: 'old-signature',
          },
        } as ProductionNode
        : node
    )),
  }));

  const edge = useProductionGraphStore.getState().edges.find((item) => item.targetNodeId === 'composition-target');
  assert.ok(edge);
  useProductionGraphStore.getState().deleteEdge(edge.id, { preserveDynamicInputSlots: true });

  const afterDelete = useProductionGraphStore.getState().nodes.find((item) => item.id === 'composition-target');
  assert.ok(afterDelete);
  assert.equal((afterDelete.data as { resultAssetId?: string; resultSignature?: string }).resultAssetId, undefined);
  assert.equal((afterDelete.data as { resultAssetId?: string; resultSignature?: string }).resultSignature, undefined);
});

test('composition clears linked layer content on external edge delete', () => {
  resetState({
    nodes: [
      textSourceA,
      {
        ...compositionTarget,
        data: {
          ...compositionTarget.data,
          layers: [
            {
              id: 'layer-0',
              text: 'Stale linked text',
            },
          ],
        },
      } as ProductionNode,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('text-source-a', 'text', 'composition-target', 'layer-0');
  const edge = useProductionGraphStore.getState().edges.find((item) => item.targetNodeId === 'composition-target');
  assert.ok(edge);

  useProductionGraphStore.getState().deleteEdge(edge.id, { preserveDynamicInputSlots: true });

  const afterDelete = useProductionGraphStore.getState().nodes.find((item) => item.id === 'composition-target');
  assert.ok(afterDelete);
  const layer = (afterDelete.data as { layers?: Array<{ id: string; text?: string; assetId?: string }> }).layers?.find((item) => item.id === 'layer-0');
  assert.equal(layer?.text, undefined);
  assert.equal(layer?.assetId, undefined);
});

test('composition keeps layer content when local detach requests preservation', () => {
  resetState({
    nodes: [
      textSourceA,
      {
        ...compositionTarget,
        data: {
          ...compositionTarget.data,
          layers: [
            {
              id: 'layer-0',
              text: 'Local copy',
            },
          ],
        },
      } as ProductionNode,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('text-source-a', 'text', 'composition-target', 'layer-0');
  const edge = useProductionGraphStore.getState().edges.find((item) => item.targetNodeId === 'composition-target');
  assert.ok(edge);

  useProductionGraphStore.getState().deleteEdge(edge.id, {
    preserveCompositionLayerContent: true,
    preserveDynamicInputSlots: true,
  });

  const afterDelete = useProductionGraphStore.getState().nodes.find((item) => item.id === 'composition-target');
  assert.ok(afterDelete);
  const layer = (afterDelete.data as { layers?: Array<{ id: string; text?: string }> }).layers?.find((item) => item.id === 'layer-0');
  assert.equal(layer?.text, 'Local copy');
});

test('composition reconnect keeps layer identity with source instead of port', () => {
  resetState({
    nodes: [
      imageSourceA,
      imageSourceB,
      {
        ...compositionTarget,
        data: {
          ...compositionTarget.data,
          layerOrder: ['layer-0', 'layer-1'],
          layers: [
            {
              id: 'layer-0',
              name: 'Source A layer',
              x: 120,
              y: 240,
            },
            {
              id: 'layer-1',
              name: 'Source B layer',
              x: 640,
              y: 720,
            },
          ],
          selectedLayerId: 'layer-0',
          selectedLayerIds: ['layer-0'],
        },
      } as ProductionNode,
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('image-source-a', 'image', 'composition-target', 'layer-0');
  state.connect('image-source-b', 'image', 'composition-target', 'layer-1');
  useProductionGraphStore.setState((current) => ({
    nodes: current.nodes.map((node) => (
      node.id === 'composition-target'
        ? {
          ...node,
          data: {
            ...node.data,
            resultAssetId: 'composition-result',
            resultSignature: 'old-signature',
          },
        } as ProductionNode
        : node
    )),
  }));
  const edgeA = useProductionGraphStore.getState().edges.find((item) => item.sourceNodeId === 'image-source-a');
  assert.ok(edgeA);

  useProductionGraphStore.getState().connect('image-source-a', 'image', 'composition-target', 'layer-1', {
    detachedEdge: edgeA,
  });

  const nextState = useProductionGraphStore.getState();
  const nextEdgeA = nextState.edges.find((item) => item.sourceNodeId === 'image-source-a');
  const nextEdgeB = nextState.edges.find((item) => item.sourceNodeId === 'image-source-b');
  assert.equal(nextEdgeA?.targetPortId, 'layer-1');
  assert.equal(nextEdgeB?.targetPortId, 'layer-0');

  const composition = nextState.nodes.find((item) => item.id === 'composition-target');
  assert.ok(composition);
  const data = composition.data as {
    layerOrder?: string[];
    layers?: Array<{ id: string; name?: string; x?: number; y?: number }>;
    resultAssetId?: string;
    resultSignature?: string;
    selectedLayerId?: string;
    selectedLayerIds?: string[];
  };
  assert.equal(data.resultAssetId, 'composition-result');
  assert.equal(data.resultSignature, 'old-signature');
  assert.deepEqual(data.layerOrder, ['layer-1', 'layer-0']);
  assert.deepEqual(data.selectedLayerIds, ['layer-1']);
  assert.equal(data.selectedLayerId, 'layer-1');
  assert.deepEqual(data.layers?.find((item) => item.id === 'layer-1'), {
    id: 'layer-1',
    name: 'Source A layer',
    x: 120,
    y: 240,
  });
  assert.deepEqual(data.layers?.find((item) => item.id === 'layer-0'), {
    id: 'layer-0',
    name: 'Source B layer',
    x: 640,
    y: 720,
  });
});

test('telegram publication keeps distinct media ports and does not remap IDs on drag reconnect', () => {
  const telegramSourceA: ProductionNode = {
    ...imageSourceA,
    id: 'telegram-source-a',
  } as ProductionNode;
  const telegramSourceB: ProductionNode = {
    ...imageSourceB,
    id: 'telegram-source-b',
  } as ProductionNode;

  resetState({
    nodes: [
      telegramSourceA,
      telegramSourceB,
      {
        ...telegramTarget,
        data: {
          ...telegramTarget.data,
          mediaInputCount: 10,
        },
      },
    ],
  });

  const state = useProductionGraphStore.getState();
  state.connect('telegram-source-a', 'image', 'telegram-target', 'media-4');
  state.connect('telegram-source-b', 'image', 'telegram-target', 'media-8');

  const sourceAEdge = useProductionGraphStore.getState().edges.find(
    (edge) => edge.sourceNodeId === 'telegram-source-a',
  );
  const sourceBEdge = useProductionGraphStore.getState().edges.find(
    (edge) => edge.sourceNodeId === 'telegram-source-b',
  );
  assert.ok(sourceAEdge);
  assert.ok(sourceBEdge);
  assert.equal(sourceAEdge.targetPortId, 'media-4');
  assert.equal(sourceBEdge.targetPortId, 'media-8');

  useProductionGraphStore.getState().deleteEdge(sourceAEdge.id, { preserveDynamicInputSlots: true });
  const detached = {
    ...sourceAEdge,
    targetNodeId: 'telegram-target',
    targetPortId: 'media-4',
  };
  const moved = useProductionGraphStore.getState().connect(
    detached.sourceNodeId,
    detached.sourcePortId,
    detached.targetNodeId,
    'media-5',
    { detachedEdge: detached },
  );

  assert.equal(moved.ok, true);

  const edges = useProductionGraphStore.getState().edges;
  const movedEdge = edges.find((edge) => edge.sourceNodeId === 'telegram-source-a');
  const untouchedEdge = edges.find((edge) => edge.sourceNodeId === 'telegram-source-b');
  assert.ok(movedEdge);
  assert.ok(untouchedEdge);
  assert.equal(movedEdge.targetPortId, 'media-5');
  assert.equal(untouchedEdge.targetPortId, 'media-8');

  const telegramNode = useProductionGraphStore.getState().nodes.find((item) => item.id === 'telegram-target');
  assert.ok(telegramNode);
  assert.equal((telegramNode.data as { mediaInputCount?: number }).mediaInputCount, 10);
});
