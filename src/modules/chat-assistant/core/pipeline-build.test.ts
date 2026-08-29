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

test('prepares the canonical six-node Stories canvas recipe without executable inputs or QR', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Stories 9:16',
    summary: 'Create a vertical Stories image with an editable prompt and headline.',
    nodes: [
      {
        key: 'backgroundPrompt',
        type: 'textPrompt',
        settings: { text: 'Describe a scene for Stories 9:16', title: 'Background prompt' },
      },
      {
        key: 'promptBuilder',
        type: 'textGeneration',
        settings: {
          instruction: 'Build a production-ready 9:16 image prompt without embedded text.',
          title: 'Prompt builder',
        },
      },
      { key: 'background', type: 'generateImage', settings: { aspectRatio: '9:16', title: 'Stories art' } },
      { key: 'headline', type: 'textPrompt', settings: { text: 'Headline', title: 'Headline' } },
      { key: 'composition', type: 'composition', settings: { aspectRatio: '9:16', title: 'Stories composition' } },
      { key: 'export', type: 'exportImage', settings: { format: 'png', title: 'Stories export' } },
    ],
    edges: [
      { sourceNodeKey: 'backgroundPrompt', sourcePortId: 'text', targetNodeKey: 'promptBuilder', targetPortId: 'text' },
      { sourceNodeKey: 'promptBuilder', sourcePortId: 'result', targetNodeKey: 'background', targetPortId: 'prompt' },
      { sourceNodeKey: 'composition', sourcePortId: 'image', targetNodeKey: 'export', targetPortId: 'image-0' },
    ],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_920 },
      layers: [
        {
          key: 'background',
          name: 'Background',
          role: 'background',
          kind: 'image',
          source: { nodeRef: 'background', portId: 'image' },
          frame: { x: 0, y: 0, width: 1, height: 1 },
          zIndex: 0,
          image: { fit: 'fill', preserveAspectRatio: false },
        },
        {
          key: 'headline',
          name: 'Headline',
          role: 'headline',
          kind: 'text',
          source: { nodeRef: 'headline', portId: 'text' },
          frame: { x: 0.08, y: 0.1, width: 0.84, height: 0.16 },
          zIndex: 1,
        },
      ],
    }],
  }), structuredClone(initialProject));

  assert.equal(prepared.patch.nodes.length, 6);
  assert.equal(prepared.patch.edges.length, 5);
  assert.equal(prepared.patch.nodes.some((node) => node.type === 'pipelineInput'), false);
  assert.equal(prepared.patch.nodes.some((node) => node.type === 'pipelineOutput'), false);
  assert.equal(prepared.patch.nodes.some((node) => node.type === 'qrCode'), false);
  assert.equal(prepared.safePreview.compositionBlueprints[0]?.layerCount, 2);
  assert.deepEqual(prepared.safePreview.warnings, []);
});

test('accepts exactly 24 proposal nodes and rejects the twenty-fifth', () => {
  const nodes = Array.from({ length: 24 }, (_, index) => ({
    key: `node-${index}`,
    type: 'textPrompt' as const,
  }));
  const base = {
    documentName: 'Maximum bounded proposal',
    summary: 'Verify the shared proposal node limit.',
    edges: [],
  };

  const accepted = parsePipelineBuildInput({ ...base, nodes });
  assert.equal(accepted.nodes.length, 24);
  assert.throws(
    () => parsePipelineBuildInput({
      ...base,
      nodes: [...nodes, { key: 'node-24', type: 'textPrompt' }],
    }),
    /Too big|maximum|24/iu,
  );
});

test('builds explicit typed endpoint boundaries and a structured JSON result', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Structured topic analysis',
    summary: 'Analyze a topic and return a typed JSON object.',
    nodes: [
      {
        key: 'publicInput',
        type: 'pipelineInput',
        settings: {
          fields: [{ id: 'topic', key: 'topic', kind: 'text', required: true }],
        },
      },
      { key: 'analysis', type: 'textGeneration', settings: { instruction: 'Analyze the topic.' } },
      {
        key: 'structured',
        type: 'structuredOutput',
        settings: {
          schemaName: 'topic_analysis',
          fields: [{ id: 'title', key: 'title', kind: 'text', required: true }],
        },
      },
      {
        key: 'publicOutput',
        type: 'pipelineOutput',
        settings: {
          fields: [{ id: 'result', key: 'result', kind: 'json', required: true, fields: [] }],
        },
      },
    ],
    edges: [
      { sourceNodeKey: 'publicInput', sourcePortId: 'field:topic', targetNodeKey: 'analysis', targetPortId: 'text' },
      { sourceNodeKey: 'analysis', sourcePortId: 'result', targetNodeKey: 'structured', targetPortId: 'source' },
      { sourceNodeKey: 'structured', sourcePortId: 'json', targetNodeKey: 'publicOutput', targetPortId: 'field:result' },
    ],
  }), structuredClone(initialProject));

  assert.equal(prepared.patch.nodes.length, 4);
  assert.equal(prepared.patch.edges.length, 3);
  assert.deepEqual(prepared.patch.edges.map((edge) => edge.sourcePortId), ['field:topic', 'result', 'json']);
  const input = prepared.patch.nodes.find((node) => node.type === 'pipelineInput');
  assert.equal(input && 'fields' in input.data ? input.data.fields[0]?.key : undefined, 'topic');
});

test('builds an explicit targetUrl input through a deterministic QR node into composition', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'QR composition from URL',
    summary: 'Create a reusable QR layer from the targetUrl endpoint parameter.',
    nodes: [
      {
        key: 'publicInput',
        type: 'pipelineInput',
        settings: {
          fields: [{ id: 'target-url', key: 'targetUrl', kind: 'text', required: true }],
        },
      },
      {
        key: 'qr',
        type: 'qrCode',
        settings: { contentMode: 'url' },
      },
      { key: 'composition', type: 'composition' },
      {
        key: 'publicOutput',
        type: 'pipelineOutput',
        settings: {
          fields: [{ id: 'composed-image', key: 'image', kind: 'image', required: true }],
        },
      },
    ],
    edges: [
      { sourceNodeKey: 'publicInput', sourcePortId: 'field:target-url', targetNodeKey: 'qr', targetPortId: 'text' },
      { sourceNodeKey: 'qr', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-0' },
      { sourceNodeKey: 'composition', sourcePortId: 'image', targetNodeKey: 'publicOutput', targetPortId: 'field:composed-image' },
    ],
  }), structuredClone(initialProject));
  const qr = prepared.patch.nodes.find((node) => node.type === 'qrCode')!;
  const publicInput = prepared.patch.nodes.find((node) => node.type === 'pipelineInput')!;

  assert.equal('fields' in publicInput.data ? publicInput.data.fields[0]?.key : undefined, 'targetUrl');
  assert.equal('content' in qr.data ? qr.data.content : undefined, '');
  assert.equal('contentMode' in qr.data ? qr.data.contentMode : undefined, 'url');
  assert.equal('pixelSize' in qr.data ? qr.data.pixelSize : undefined, 1024);
  assert.equal('outputFormat' in qr.data ? qr.data.outputFormat : undefined, 'png');
  assert.deepEqual(prepared.patch.edges.map((edge) => [edge.sourcePortId, edge.targetPortId]), [
    ['field:target-url', 'text'],
    ['image', 'layer-0'],
    ['image', 'field:composed-image'],
  ]);
  assert.deepEqual(prepared.safePreview.nodes.find((node) => node.key === 'qr')?.settings, {
    contentMode: 'url',
  });
});

test('omits assistant-owned advanced QR settings and content above the shared byte limit', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Bounded QR settings',
    summary: 'Keep QR rendering defaults outside the assistant contract.',
    nodes: [{
      key: 'qr',
      type: 'qrCode',
      settings: {
        content: 'я'.repeat(1_025),
        errorCorrectionLevel: 'H',
        foregroundColor: '#112233',
        backgroundColor: '#F7F7F7',
        margin: 8,
        pixelSize: 2048,
        outputFormat: 'png',
      },
    }],
    edges: [],
  }), structuredClone(initialProject));
  const qr = prepared.patch.nodes[0];

  assert.equal('content' in qr.data ? qr.data.content : undefined, '');
  assert.equal('foregroundColor' in qr.data ? qr.data.foregroundColor : undefined, '#000000');
  assert.equal('margin' in qr.data ? qr.data.margin : undefined, 4);
  assert.equal('pixelSize' in qr.data ? qr.data.pixelSize : undefined, 1024);
  assert.equal('outputFormat' in qr.data ? qr.data.outputFormat : undefined, 'png');
  assert.deepEqual(prepared.safePreview.nodes[0]?.settings, {});
  assert.match(
    prepared.safePreview.warnings.join('\n'),
    /content.*errorCorrectionLevel.*foregroundColor.*backgroundColor.*margin.*pixelSize.*outputFormat/us,
  );
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

test('expands dynamic image layer and export inputs for layered visual recipes', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Layered campaign banner',
    summary: 'Compose generated art, a QR image and an optional overlay.',
    nodes: [
      { key: 'art', type: 'generateImage' },
      { key: 'qr', type: 'qrCode' },
      { key: 'overlay', type: 'importImage' },
      { key: 'composition', type: 'composition' },
      { key: 'export', type: 'exportImage' },
    ],
    edges: [
      { sourceNodeKey: 'art', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-0' },
      { sourceNodeKey: 'qr', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-1' },
      { sourceNodeKey: 'overlay', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-2' },
      { sourceNodeKey: 'composition', sourcePortId: 'image', targetNodeKey: 'export', targetPortId: 'image-1' },
    ],
  }), structuredClone(initialProject));
  const composition = prepared.patch.nodes.find((node) => node.type === 'composition')!;
  const exportNode = prepared.patch.nodes.find((node) => node.type === 'exportImage')!;

  assert.equal('layerInputCount' in composition.data ? composition.data.layerInputCount : undefined, 3);
  assert.equal('imageInputCount' in exportNode.data ? exportNode.data.imageInputCount : undefined, 2);
  assert.equal(prepared.patch.edges.length, 4);
});

test('prepares an ordinary editable poster with native text and QR layers without executable boundaries', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Редактируемая афиша мероприятия',
    summary: 'Собрать первый рабочий макет с отдельными текстами и QR-кодом.',
    nodes: [
      { key: 'background', type: 'generateImage', settings: { title: 'Фон афиши' } },
      { key: 'title', type: 'textPrompt', settings: { title: 'Название мероприятия', text: '' } },
      { key: 'date', type: 'textPrompt', settings: { title: 'Дата и время', text: '' } },
      { key: 'cta', type: 'textPrompt', settings: { title: 'Призыв к действию', text: '' } },
      { key: 'qr', type: 'qrCode', settings: { title: 'Ссылка QR', contentMode: 'url' } },
      { key: 'composition', type: 'composition', settings: { title: 'Редактируемый макет' } },
      { key: 'export', type: 'exportImage', settings: { title: 'Готовый макет', format: 'png' } },
    ],
    edges: [
      { sourceNodeKey: 'background', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-0' },
      { sourceNodeKey: 'title', sourcePortId: 'text', targetNodeKey: 'composition', targetPortId: 'layer-1' },
      { sourceNodeKey: 'date', sourcePortId: 'text', targetNodeKey: 'composition', targetPortId: 'layer-2' },
      { sourceNodeKey: 'cta', sourcePortId: 'text', targetNodeKey: 'composition', targetPortId: 'layer-3' },
      { sourceNodeKey: 'qr', sourcePortId: 'image', targetNodeKey: 'composition', targetPortId: 'layer-4' },
      { sourceNodeKey: 'composition', sourcePortId: 'image', targetNodeKey: 'export', targetPortId: 'image-0' },
    ],
  }), structuredClone(initialProject));

  const composition = prepared.patch.nodes.find((node) => node.type === 'composition')!;
  const qr = prepared.patch.nodes.find((node) => node.type === 'qrCode')!;

  assert.equal('layerInputCount' in composition.data ? composition.data.layerInputCount : undefined, 5);
  assert.equal('content' in qr.data ? qr.data.content : undefined, '');
  assert.equal(prepared.patch.nodes.filter((node) => node.type === 'textPrompt').length, 3);
  assert.equal(prepared.patch.nodes.some((node) => node.type === 'pipelineInput'), false);
  assert.equal(prepared.patch.nodes.some((node) => node.type === 'pipelineOutput'), false);
  assert.equal(prepared.patch.edges.length, 6);
});

test('normalizes an unambiguous reversed text-generation port from the model', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Layered banner prompt',
    summary: 'Build a reusable prompt for image generation.',
    nodes: [
      { key: 'stylePrompt', type: 'textPrompt' },
      { key: 'promptBuild', type: 'textGeneration' },
    ],
    edges: [{
      sourceNodeKey: 'stylePrompt',
      sourcePortId: 'text',
      targetNodeKey: 'promptBuild',
      targetPortId: 'result',
    }],
  }), structuredClone(initialProject));

  assert.equal(prepared.patch.edges[0]?.sourcePortId, 'text');
  assert.equal(prepared.patch.edges[0]?.targetPortId, 'text');
  assert.match(prepared.safePreview.warnings.join(' '), /единственная совместимая пара/u);
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

test('keeps a managed chat reference declarative until the import node is confirmed', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Reference-based visual',
    summary: 'Use the attached reference as the image input.',
    nodes: [
      { key: 'reference', type: 'importImage', sourceAttachmentIndex: 0 },
      { key: 'extract', type: 'imageToText' },
    ],
    edges: [
      { sourceNodeKey: 'reference', sourcePortId: 'image', targetNodeKey: 'extract', targetPortId: 'image' },
    ],
  }), structuredClone(initialProject));
  const importNode = prepared.patch.nodes.find((node) => node.type === 'importImage')!;

  assert.deepEqual(prepared.patch.attachmentImports, [{ attachmentIndex: 0, nodeId: importNode.id }]);
  assert.equal('assetId' in importNode.data, false);
  assert.equal(prepared.safePreview.nodes[0].sourceAttachmentIndex, 0);

  const materialized = applyPipelineBuildPatch(structuredClone(initialProject), {
    ...prepared.patch,
    assets: [{
      createdAt: '2026-08-13T00:00:00.000Z',
      id: 'asset-reference',
      kind: 'image',
      mimeType: 'image/webp',
      name: 'reference.webp',
      storage: { assetId: 'asset-reference', type: 'remote' },
    }],
    nodes: prepared.patch.nodes.map((node) => (
      node.id === importNode.id ? { ...node, data: { ...node.data, assetId: 'asset-reference' } } : node
    )),
  });
  assert.equal(materialized.assets[0]?.id, 'asset-reference');
  assert.equal('assetId' in materialized.nodes[0].data ? materialized.nodes[0].data.assetId : undefined, 'asset-reference');
});

test('rejects attachment indices on nodes that are not image imports', () => {
  assert.throws(() => preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Invalid reference pipeline',
    summary: 'Reject an attachment assigned to the wrong node type.',
    nodes: [{ key: 'extract', type: 'imageToText', sourceAttachmentIndex: 0 }],
    edges: [],
  }), structuredClone(initialProject)), /only for importImage/u);
});
