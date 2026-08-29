import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { normalizeProject } from '@/entities/production-graph/model/normalize-project';
import {
  COMPOSITION_TEXT_FONT_SIZE_MAX,
  COMPOSITION_TEXT_LINE_HEIGHT_MAX,
} from '@/entities/production-graph/model/composition-text-constraints';
import type { CompositionNodeData } from '@/entities/production-graph/model/types';
import {
  applyPipelineBuildPatch,
  parsePipelineBuildInput,
  preparePipelineBuild,
} from './pipeline-build.ts';
import {
  applyPipelineUpdatePatch,
  pipelineUpdateInputSchema,
  preparePipelineUpdate,
} from './pipeline-update.ts';

function createEditablePoster() {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Editable event poster',
    summary: 'Create independently editable headline and QR layers.',
    nodes: [
      { key: 'headline', type: 'textPrompt', settings: { text: 'AI workshop', title: 'Headline' } },
      { key: 'qr', type: 'qrCode', settings: { content: 'https://example.com/event' } },
      { key: 'composition', type: 'composition', settings: { title: 'Poster composition' } },
    ],
    edges: [],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_200, height: 800 },
      layers: [{
        key: 'headline',
        name: 'Заголовок',
        role: 'headline',
        kind: 'text',
        source: { nodeRef: 'headline', portId: 'text' },
        frame: { x: 0.08, y: 0.1, width: 0.7, height: 0.2 },
        zIndex: 10,
        text: {
          color: '#FFFFFF',
          fontSize: 72,
          gradient: {
            type: 'linear',
            angle: 90,
            stops: [
              { color: '#FF8800', offset: 0 },
              { color: '#FFEE00', offset: 1 },
            ],
          },
        },
      }, {
        key: 'qr',
        name: 'QR-код',
        role: 'qr',
        kind: 'image',
        source: { nodeRef: 'qr', portId: 'image' },
        frame: { x: 0.78, y: 0.68, width: 0.16, height: 0.24 },
        zIndex: 20,
        image: { fit: 'fit' },
      }],
      groups: [{ key: 'copy', name: 'Текст', layerKeys: ['headline'] }],
    }],
  }), structuredClone(initialProject));
  return {
    prepared,
    project: applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch),
  };
}

test('compiles normalized text, gradient and QR layers into editable Composition data and edges', () => {
  const { prepared, project } = createEditablePoster();
  const composition = project.nodes.find((node) => node.type === 'composition')!;
  const headline = project.nodes.find((node) => node.data.title === 'Headline')!;
  const qr = project.nodes.find((node) => node.type === 'qrCode')!;
  const data = composition.data as CompositionNodeData;

  assert.equal(prepared.patch.edges.length, 2);
  assert.equal(prepared.patch.edges.some((edge) => (
    edge.sourceNodeId === headline.id && edge.targetNodeId === composition.id && edge.targetPortId === 'layer-0'
  )), true);
  assert.equal(prepared.patch.edges.some((edge) => (
    edge.sourceNodeId === qr.id && edge.targetNodeId === composition.id && edge.targetPortId === 'layer-1'
  )), true);
  assert.equal(data.canvasWidth, 1_200);
  assert.equal(data.canvasHeight, 800);
  assert.equal(data.aspectRatio, '3:2');
  assert.equal(data.layerInputCount, 2);
  assert.deepEqual(data.layerOrder, ['layer-1', 'group-copy']);
  assert.deepEqual(data.groups?.[0]?.layerIds, ['layer-0']);
  assert.deepEqual(data.layers?.find((layer) => layer.id === 'layer-0'), {
    align: 'left',
    blendMode: 'pass-through',
    color: '#FFFFFF',
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 72,
    fontWeight: '700',
    gradient: {
      angle: 90,
      stops: [
        { color: '#ff8800', offset: 0 },
        { color: '#ffee00', offset: 1 },
      ],
      type: 'linear',
    },
    groupId: 'group-copy',
    height: 160,
    id: 'layer-0',
    kind: 'text',
    letterSpacing: 0,
    lineHeight: 86,
    locked: false,
    name: 'Заголовок',
    opacity: 100,
    rotation: 0,
    sizingMode: 'fixed',
    verticalAlign: 'top',
    visible: true,
    width: 840,
    x: 96,
    y: 80,
  });
  assert.equal(data.layers?.find((layer) => layer.id === 'layer-1')?.preserveAspectRatio, false);
  assert.equal(prepared.safePreview.compositionBlueprints[0]?.layerCount, 2);
  assert.ok(headline.position.x < composition.position.x);
  assert.ok(qr.position.x < composition.position.x);
});

test('merge replaces a managed layer source in place and preserves unmentioned layers', () => {
  const { project } = createEditablePoster();
  const composition = project.nodes.find((node) => node.type === 'composition')!;
  const oldHeadlineEdge = project.edges.find((edge) => (
    edge.targetNodeId === composition.id && edge.targetPortId === 'layer-0'
  ))!;
  const prepared = preparePipelineUpdate(pipelineUpdateInputSchema.parse({
    summary: 'Replace the headline source and placement while preserving the QR layer.',
    nodes: [{ key: 'newHeadline', type: 'textPrompt', settings: { text: 'Updated title' } }],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: composition.id,
      mode: 'merge',
      canvas: { width: 1_200, height: 800 },
      layers: [{
        key: 'headline',
        name: 'Заголовок',
        role: 'headline',
        kind: 'text',
        source: { nodeRef: 'newHeadline', portId: 'text' },
        frame: { x: 0.12, y: 0.18, width: 0.62, height: 0.16 },
        zIndex: 30,
      }],
    }],
  }), project);
  const updated = applyPipelineUpdatePatch(project, prepared.patch);
  const updatedComposition = updated.nodes.find((node) => node.id === composition.id)!;
  const newHeadline = updated.nodes.find((node) => node.id === prepared.patch.addedNodes[0]?.id)!;
  const data = updatedComposition.data as CompositionNodeData;

  assert.deepEqual(prepared.patch.removeEdgeIds, [oldHeadlineEdge.id]);
  assert.equal(updated.edges.some((edge) => edge.id === oldHeadlineEdge.id), false);
  assert.equal(updated.edges.some((edge) => (
    edge.sourceNodeId === newHeadline.id
    && edge.targetNodeId === composition.id
    && edge.targetPortId === 'layer-0'
  )), true);
  assert.equal(updated.edges.some((edge) => (
    edge.targetNodeId === composition.id && edge.targetPortId === 'layer-1'
  )), true);
  assert.equal(data.layers?.length, 2);
  assert.equal(data.layers?.find((layer) => layer.id === 'layer-0')?.x, 144);
  assert.equal(data.layers?.find((layer) => layer.id === 'layer-1')?.name, 'QR-код');
  assert.deepEqual(data.layerOrder, ['layer-0', 'layer-1']);
  assert.equal(prepared.safePreview.compositionBlueprints[0]?.mode, 'merge');
});

test('returns field-level paths for unsafe frames and invalid QR sources', () => {
  assert.throws(() => parsePipelineBuildInput({
    documentName: 'Invalid frame',
    summary: 'Reject a layer that extends beyond the normalized canvas.',
    nodes: [
      { key: 'headline', type: 'textPrompt' },
      { key: 'composition', type: 'composition' },
    ],
    edges: [],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers: [{
        key: 'headline', name: 'Headline', role: 'headline', kind: 'text', zIndex: 1,
        source: { nodeRef: 'headline', portId: 'text' },
        frame: { x: 0.8, y: 0, width: 0.4, height: 0.2 },
      }],
    }],
  }), /compositionBlueprints.*0.*layers.*0.*frame.*width/s);

  const parsed = parsePipelineBuildInput({
    documentName: 'Invalid QR source',
    summary: 'Reject an image that is mislabeled as a QR layer.',
    nodes: [
      { key: 'image', type: 'generateImage' },
      { key: 'composition', type: 'composition' },
    ],
    edges: [],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers: [{
        key: 'qr', name: 'QR', role: 'qr', kind: 'image', zIndex: 1,
        source: { nodeRef: 'image', portId: 'image' },
        frame: { x: 0.7, y: 0.7, width: 0.2, height: 0.2 },
      }],
    }],
  });
  assert.throws(
    () => preparePipelineBuild(parsed, structuredClone(initialProject)),
    /compositionBlueprints\[0\]\.layers\[0\]\.source: The qr role must use the image output of a qrCode node/,
  );
});

test('supports the shared limit of 24 real Composition layer ports', () => {
  const layers = Array.from({ length: 24 }, (_, index) => ({
    key: `copy-${index}`,
    name: `Copy ${index + 1}`,
    role: `copy-${index}`,
    kind: 'text' as const,
    source: { nodeRef: 'copy', portId: 'text' },
    frame: { x: 0, y: 0, width: 0.5, height: 0.1 },
    zIndex: index,
  }));
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: '24 layer composition',
    summary: 'Compile every supported Composition layer port.',
    nodes: [
      { key: 'copy', type: 'textPrompt' },
      { key: 'composition', type: 'composition' },
    ],
    edges: [],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers,
    }],
  }), structuredClone(initialProject));
  const composition = prepared.patch.nodes.find((node) => node.type === 'composition')!;
  const data = composition.data as CompositionNodeData;

  assert.equal(prepared.patch.edges.length, 24);
  assert.equal(prepared.patch.edges.some((edge) => edge.targetPortId === 'layer-23'), true);
  assert.equal(data.layerInputCount, 24);
  assert.equal(data.layers?.length, 24);
  const reloaded = normalizeProject(applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch));
  const reloadedData = reloaded.nodes.find((node) => node.type === 'composition')!.data as CompositionNodeData;
  assert.equal(reloadedData.layerInputCount, 24);
  assert.equal(reloadedData.layers?.length, 24);
});

test('preserves maximum supported typography values through compile, apply and normalization', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Typography boundary round trip',
    summary: 'Keep values accepted by the blueprint identical after project normalization.',
    nodes: [
      { key: 'copy', type: 'textPrompt', settings: { text: 'Boundary', title: 'Copy' } },
      { key: 'composition', type: 'composition', settings: { title: 'Composition' } },
    ],
    edges: [],
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers: [{
        key: 'copy',
        name: 'Copy',
        role: 'headline',
        kind: 'text',
        source: { nodeRef: 'copy', portId: 'text' },
        frame: { x: 0, y: 0, width: 1, height: 1 },
        zIndex: 1,
        text: {
          fontSize: COMPOSITION_TEXT_FONT_SIZE_MAX,
          lineHeight: COMPOSITION_TEXT_LINE_HEIGHT_MAX,
        },
      }],
    }],
  }), structuredClone(initialProject));
  const normalized = normalizeProject(
    applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch),
  );
  const data = normalized.nodes.find((node) => node.type === 'composition')!.data as CompositionNodeData;
  const layer = data.layers?.find((candidate) => candidate.id === 'layer-0');

  assert.equal(layer?.fontSize, COMPOSITION_TEXT_FONT_SIZE_MAX);
  assert.equal(layer?.lineHeight, COMPOSITION_TEXT_LINE_HEIGHT_MAX);
});

test('rejects typography values that the Composition model would otherwise clamp', () => {
  const baseInput = {
    documentName: 'Invalid typography boundary',
    summary: 'Reject lossy values before preparing the graph.',
    nodes: [
      { key: 'copy', type: 'textPrompt' },
      { key: 'composition', type: 'composition' },
    ],
    edges: [],
  };

  assert.throws(() => parsePipelineBuildInput({
    ...baseInput,
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers: [{
        key: 'copy', name: 'Copy', role: 'headline', kind: 'text', zIndex: 1,
        source: { nodeRef: 'copy', portId: 'text' },
        frame: { x: 0, y: 0, width: 1, height: 1 },
        text: { fontSize: COMPOSITION_TEXT_FONT_SIZE_MAX + 1 },
      }],
    }],
  }), /compositionBlueprints.*0.*layers.*0.*text.*fontSize/s);

  assert.throws(() => parsePipelineBuildInput({
    ...baseInput,
    compositionBlueprints: [{
      version: 1,
      compositionNodeRef: 'composition',
      mode: 'replace',
      canvas: { width: 1_080, height: 1_080 },
      layers: [{
        key: 'copy', name: 'Copy', role: 'headline', kind: 'text', zIndex: 1,
        source: { nodeRef: 'copy', portId: 'text' },
        frame: { x: 0, y: 0, width: 1, height: 1 },
        text: { lineHeight: COMPOSITION_TEXT_LINE_HEIGHT_MAX + 1 },
      }],
    }],
  }), /compositionBlueprints.*0.*layers.*0.*text.*lineHeight/s);
});
