import { getPortById } from './node-definitions';
import type {
  GraphImageInputItem,
  GraphIoContext,
  GraphObjectInputItem,
  GraphTextInputItem,
} from './graph-io-contracts';
import { getNodeImageAssetId, getNodeImageOutputAssetIds } from './graph-image-outputs';
import { getIncomingSources, getTransparentRouterSource } from './graph-io-sources';
import {
  getNodeLocationResult,
  getNodeRichTextResult,
  getNodeSubjectResult,
  getNodeTextResult,
  getNodeTextResults,
} from './graph-text-outputs';

type GraphRoutingContext = Pick<GraphIoContext, 'edges' | 'nodes'>;

export function getIncomingImageInputs(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: GraphIoContext,
): GraphImageInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphImageInputItem[] => {
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (source.sourceNode.type === 'router') {
      return getIncomingImageInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }
    if (sourcePort?.kind !== 'image') return [];
    const assetId = getNodeImageAssetId(source.sourceNode, context);
    const asset = context.assets.find((item) => item.id === assetId);
    if (!assetId || !asset) return [];
    return [{
      ...source,
      asset,
      assetId,
      sourceLabel: source.sourceNode.data.title,
      filename: asset.name,
    }];
  });
}

export function getFirstIncomingImageAsset(
  targetNodeId: string,
  targetPortId: string,
  context: GraphIoContext,
) {
  return getIncomingImageInputs(targetNodeId, targetPortId, context)[0]?.asset;
}

export function getIncomingImageCollectionInputs(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: GraphIoContext,
): GraphImageInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphImageInputItem[] => {
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    if (source.sourceNode.type === 'router') {
      return getIncomingImageCollectionInputs(source.sourceNode.id, 'input', context).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }
    if (sourcePort?.kind !== 'image') return [];
    const assetIds = getNodeImageOutputAssetIds(source.sourceNode, context);
    return assetIds.flatMap((assetId, collectionIndex): GraphImageInputItem[] => {
      const asset = context.assets.find((item) => item.id === assetId);
      if (!asset) return [];
      return [{
        ...source,
        asset,
        assetId,
        collectionIndex,
        sourceCollectionSize: assetIds.length,
        sourceLabel: source.sourceNode.data.title,
        filename: asset.name,
        valueKind: assetIds.length > 1 ? 'image[]' : 'image',
      }];
    });
  });
}

export function getIncomingTextInputs(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: GraphRoutingContext,
): GraphTextInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphTextInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingTextInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }
    const text = getNodeTextResult(source.sourceNode, source.sourcePortId, context);
    return text ? [{
      ...source,
      richText: getNodeRichTextResult(source.sourceNode, source.sourcePortId, context),
      text,
      sourceLabel: source.sourceNode.data.title,
    }] : [];
  });
}

export function getIncomingTextCollectionInputs(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: GraphRoutingContext,
): GraphTextInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphTextInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingTextCollectionInputs(source.sourceNode.id, 'input', context).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }
    const texts = getNodeTextResults(source.sourceNode, source.sourcePortId, context);
    return texts.map((text, collectionIndex) => ({
      ...source,
      collectionIndex,
      richText: getNodeRichTextResult(source.sourceNode, source.sourcePortId, context),
      sourceCollectionSize: texts.length,
      text,
      sourceLabel: source.sourceNode.data.title,
      valueKind: texts.length > 1 ? 'text[]' : 'text',
    }));
  });
}

export function getIncomingObjectInputs(
  targetNodeId: string,
  targetPortId: string | undefined,
  context: GraphRoutingContext,
): GraphObjectInputItem[] {
  return getIncomingSources(targetNodeId, targetPortId, context).flatMap((source): GraphObjectInputItem[] => {
    if (source.sourceNode.type === 'router') {
      return getIncomingObjectInputs(source.sourceNode.id, 'input', context).slice(0, 1).map((item) => ({
        ...item,
        ...getTransparentRouterSource(source, item),
        sourceLabel: item.sourceLabel ?? item.sourceNode.data.title,
      }));
    }
    const sourcePort = getPortById(source.sourceNode, source.sourcePortId);
    const objectKind = sourcePort?.kind === 'subject' || sourcePort?.kind === 'location'
      ? sourcePort.kind
      : undefined;
    if (!objectKind) return [];
    const text = objectKind === 'subject'
      ? getNodeSubjectResult(source.sourceNode, context)
      : getNodeLocationResult(source.sourceNode, context);
    return text ? [{
      ...source,
      objectKind,
      sourceLabel: source.sourceNode.data.title,
      text,
      valueKind: objectKind,
    }] : [];
  });
}
