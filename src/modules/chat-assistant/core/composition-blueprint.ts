import {
  COMPOSITION_LAYER_MAX_INPUTS,
  COMPOSITION_LAYER_MIN_INPUTS,
  getCompositionLayerPortIndex,
  getPortById,
} from '@/entities/production-graph/model/node-definitions';
import type {
  CompositionLayerGroup,
  CompositionLayerStyle,
  GraphEdge,
  ProductionNode,
  ProductionNodeData,
} from '@/entities/production-graph/model/types';
import {
  assertAtPath,
  buildBlueprintLayerOrder,
  compileLayerStyle,
  findFreeCompositionPort,
  findMergePort,
  getBlueprintGroupId,
  isCompositionPortInRange,
  mergeBlueprintGroups,
  readBlueprintMetadata,
  toBlueprintAspectRatio,
  type BlueprintMetadataV1,
} from './composition-blueprint-helpers';
import {
  compositionBlueprintsSchema,
  type CompositionBlueprint,
} from './composition-blueprint-schema';

export { compositionBlueprintsSchema };

export interface CompositionBlueprintEdgeSpec {
  path: string;
  sourceNodeRef: string;
  sourcePortId: string;
  targetNodeRef: string;
  targetPortId: string;
}

export interface CompositionBlueprintSafeSummary {
  compositionNodeRef: string;
  layerCount: number;
  layers: Array<{ key: string; kind: 'text' | 'image'; name: string; role: string }>;
  mode: 'replace' | 'merge';
}

export interface CompiledCompositionBlueprints {
  edgeSpecs: CompositionBlueprintEdgeSpec[];
  removeEdgeIds: string[];
  safeSummaries: CompositionBlueprintSafeSummary[];
  updatedExistingNodeData: Map<string, Record<string, unknown>>;
}

interface ExtendedCompositionData extends Record<string, unknown> {
  assistantCompositionBlueprintV1?: BlueprintMetadataV1;
  canvasHeight?: number;
  canvasWidth?: number;
  groups?: CompositionLayerGroup[];
  layerInputCount?: number;
  layerOrder?: string[];
  layers?: CompositionLayerStyle[];
}

export function compileCompositionBlueprints(input: {
  blueprints: CompositionBlueprint[];
  existingEdges: GraphEdge[];
  existingNodeIds: Set<string>;
  nodeByRef: Map<string, ProductionNode>;
}): CompiledCompositionBlueprints {
  const edgeSpecs: CompositionBlueprintEdgeSpec[] = [];
  const removeEdgeIds = new Set<string>();
  const updatedExistingNodeData = new Map<string, Record<string, unknown>>();
  const safeSummaries: CompositionBlueprintSafeSummary[] = [];

  input.blueprints.forEach((blueprint, blueprintIndex) => {
    const rootPath = `compositionBlueprints[${blueprintIndex}]`;
    const composition = input.nodeByRef.get(blueprint.compositionNodeRef);
    assertAtPath(composition, `${rootPath}.compositionNodeRef`, `Node ${blueprint.compositionNodeRef} was not found.`);
    assertAtPath(
      composition.type === 'composition',
      `${rootPath}.compositionNodeRef`,
      `Node ${blueprint.compositionNodeRef} is ${composition.type}, not composition.`,
    );

    const originalData = composition.data as ProductionNodeData as unknown as ExtendedCompositionData;
    const originalLayers = Array.isArray(originalData.layers) ? originalData.layers.map((layer) => ({ ...layer })) : [];
    const originalGroups = Array.isArray(originalData.groups)
      ? originalData.groups.map((group) => ({ ...group, layerIds: [...group.layerIds] }))
      : [];
    const originalMetadata = readBlueprintMetadata(originalData.assistantCompositionBlueprintV1);
    const incomingEdges = input.existingEdges.filter((edge) => (
      edge.targetNodeId === composition.id && getCompositionLayerPortIndex(edge.targetPortId) >= 0
    ));

    if (blueprint.mode === 'replace') incomingEdges.forEach((edge) => removeEdgeIds.add(edge.id));

    const claimedPorts = new Set<string>();
    const occupiedPorts = new Set<string>(blueprint.mode === 'replace' ? [] : [
      ...originalLayers.map((layer) => layer.id),
      ...incomingEdges.map((edge) => edge.targetPortId),
      ...Object.values(originalMetadata.layers).map((layer) => layer.portId),
    ].filter((portId) => isCompositionPortInRange(portId)));
    const metadata: BlueprintMetadataV1 = blueprint.mode === 'replace'
      ? { version: 1, groups: {}, layers: {} }
      : structuredClone(originalMetadata);
    const nextLayers = blueprint.mode === 'replace' ? [] : originalLayers;
    const portByLayerKey = new Map<string, string>();

    blueprint.layers.forEach((layer, layerIndex) => {
      const layerPath = `${rootPath}.layers[${layerIndex}]`;
      const source = input.nodeByRef.get(layer.source.nodeRef);
      assertAtPath(source, `${layerPath}.source.nodeRef`, `Node ${layer.source.nodeRef} was not found.`);
      const sourcePort = getPortById(source, layer.source.portId);
      assertAtPath(
        sourcePort && sourcePort.side === 'output',
        `${layerPath}.source.portId`,
        `Output port ${layer.source.nodeRef}.${layer.source.portId} was not found.`,
      );
      const expectedPortKind = layer.kind;
      assertAtPath(
        sourcePort.kind === expectedPortKind || sourcePort.kind === 'any',
        `${layerPath}.source.portId`,
        `Port ${layer.source.nodeRef}.${layer.source.portId} outputs ${sourcePort.kind}, not ${expectedPortKind}.`,
      );
      if (layer.role === 'qr') {
        assertAtPath(
          source.type === 'qrCode' && layer.source.portId === 'image',
          `${layerPath}.source`,
          'The qr role must use the image output of a qrCode node.',
        );
      }

      let portId = blueprint.mode === 'merge'
        ? findMergePort({
            claimedPorts,
            key: layer.key,
            kind: layer.kind,
            layers: originalLayers,
            metadata: originalMetadata,
            name: layer.name,
          })
        : undefined;
      if (!portId) portId = findFreeCompositionPort(occupiedPorts, claimedPorts, `${layerPath}.source`);
      claimedPorts.add(portId);
      occupiedPorts.add(portId);
      portByLayerKey.set(layer.key, portId);

      if (blueprint.mode === 'merge') {
        incomingEdges
          .filter((edge) => edge.targetPortId === portId)
          .forEach((edge) => removeEdgeIds.add(edge.id));
      }

      const group = blueprint.groups.find((candidate) => candidate.layerKeys.includes(layer.key));
      const nextStyle = compileLayerStyle(
        layer,
        portId,
        blueprint.canvas,
        group ? getBlueprintGroupId(group.key) : undefined,
      );
      const existingIndex = nextLayers.findIndex((candidate) => candidate.id === portId);
      if (existingIndex >= 0) nextLayers[existingIndex] = nextStyle;
      else nextLayers.push(nextStyle);
      metadata.layers[layer.key] = {
        kind: layer.kind,
        portId,
        role: layer.role,
        zIndex: layer.zIndex,
      };
      edgeSpecs.push({
        path: `${layerPath}.source`,
        sourceNodeRef: layer.source.nodeRef,
        sourcePortId: layer.source.portId,
        targetNodeRef: blueprint.compositionNodeRef,
        targetPortId: portId,
      });
    });

    const blueprintPortIds = new Set(portByLayerKey.values());
    const nextGroups = mergeBlueprintGroups({
      blueprint,
      currentGroups: blueprint.mode === 'replace' ? [] : originalGroups,
      metadata,
      portByLayerKey,
    });
    const highestPortIndex = Math.max(
      COMPOSITION_LAYER_MIN_INPUTS - 1,
      ...nextLayers.map((layer) => getCompositionLayerPortIndex(layer.id)),
      ...incomingEdges
        .filter((edge) => !removeEdgeIds.has(edge.id))
        .map((edge) => getCompositionLayerPortIndex(edge.targetPortId)),
    );
    assertAtPath(
      highestPortIndex < COMPOSITION_LAYER_MAX_INPUTS,
      `${rootPath}.layers`,
      `Composition supports at most ${COMPOSITION_LAYER_MAX_INPUTS} layers.`,
    );
    const nextOrder = buildBlueprintLayerOrder({
      blueprint,
      currentOrder: blueprint.mode === 'replace' ? [] : originalData.layerOrder ?? [],
      groups: nextGroups,
      portByLayerKey,
      remainingLayerIds: nextLayers.map((layer) => layer.id).filter((id) => !blueprintPortIds.has(id)),
    });
    const nextData: ExtendedCompositionData = {
      ...originalData,
      assistantCompositionBlueprintV1: metadata,
      aspectRatio: toBlueprintAspectRatio(blueprint.canvas.width, blueprint.canvas.height),
      canvasHeight: blueprint.canvas.height,
      canvasWidth: blueprint.canvas.width,
      groups: nextGroups,
      layerInputCount: Math.max(COMPOSITION_LAYER_MIN_INPUTS, highestPortIndex + 1),
      layerOrder: nextOrder,
      layers: nextLayers,
      resultSignature: '',
    };
    composition.data = nextData as unknown as ProductionNodeData;
    if (input.existingNodeIds.has(composition.id)) {
      updatedExistingNodeData.set(composition.id, {
        assistantCompositionBlueprintV1: metadata,
        aspectRatio: nextData.aspectRatio,
        canvasHeight: nextData.canvasHeight,
        canvasWidth: nextData.canvasWidth,
        groups: nextData.groups,
        layerInputCount: nextData.layerInputCount,
        layerOrder: nextData.layerOrder,
        layers: nextData.layers,
        resultSignature: '',
      });
    }
    safeSummaries.push({
      compositionNodeRef: blueprint.compositionNodeRef,
      layerCount: blueprint.layers.length,
      layers: blueprint.layers.map(({ key, kind, name, role }) => ({ key, kind, name, role })),
      mode: blueprint.mode,
    });
  });

  return {
    edgeSpecs,
    removeEdgeIds: Array.from(removeEdgeIds),
    safeSummaries,
    updatedExistingNodeData,
  };
}
