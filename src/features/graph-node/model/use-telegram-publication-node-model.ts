'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  createPublicationArtifact,
  getPublicationMetrics,
  validatePublicationArtifact,
  type PublicationAttachment,
  type PublicationComponent,
  type PublicationValidationReport,
} from '@/entities/production-graph/model/publication';
import {
  DEFAULT_PUBLICATION_CONTENT_UNIT_ID,
  getPublicationContentUnitDefinition,
  getPublicationPlatformDefinition,
} from '@/entities/production-graph/model/publication-platforms';
import { getIncomingImageCollectionInputs, getIncomingTextCollectionInputs, type GraphImageInputItem } from '@/entities/production-graph/model/graph-io';
import {
  TELEGRAM_MEDIA_MAX_INPUTS,
  TELEGRAM_MEDIA_MIN_INPUTS,
  getTelegramMediaInputPortId,
  getTelegramMediaInputPortIndex,
} from '@/entities/production-graph/model/node-definitions';
import type { AssetRecord, ProductionNode, TelegramPublicationNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestFormatTelegramText } from '@/shared/api/ai-client';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { TELEGRAM_MAX_MEDIA_ITEMS } from '../lib/telegram-media-layout';
import {
  assertTelegramFormattingPreservesText,
  getPlainTextFromTelegramRichText,
  normalizeTelegramPlainText,
  type TelegramMessageEditorValue,
} from '../lib/telegram-rich-text';

const TELEGRAM_CONTENT_UNIT = getPublicationContentUnitDefinition(DEFAULT_PUBLICATION_CONTENT_UNIT_ID);
const TELEGRAM_PLATFORM = getPublicationPlatformDefinition('telegram');

export interface TelegramPreviewMediaItem {
  asset: AssetRecord;
  assetId: string;
  edgeId?: string;
  targetPortId?: string;
}

export function useTelegramPublicationNodeModel(node: ProductionNode) {
  const data = node.data as TelegramPublicationNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const reorderTelegramMediaInputs = useProductionGraphStore((state) => state.reorderTelegramMediaInputs);
  const textInputs = useMemo(() => (
    getIncomingTextCollectionInputs(node.id, 'body', { edges, nodes })
  ), [edges, node.id, nodes]);
  const imageInputs = useMemo(() => (
    sortTelegramImageInputs(
      getIncomingImageCollectionInputs(node.id, undefined, { assets, edges, nodes })
        .filter((input) => isTelegramMediaTargetPort(input.targetPortId)),
    )
  ), [assets, edges, node.id, nodes]);
  const connectedMediaPortIds = useMemo(() => (
    Array.from(new Set(edges
      .filter((edge) => edge.targetNodeId === node.id && getTelegramMediaInputPortIndex(edge.targetPortId) >= 0)
      .map((edge) => edge.targetPortId)))
  ), [edges, node.id]);
  const requiredMediaSlotCount = useMemo(() => (
    getTelegramMediaSlotCount(connectedMediaPortIds)
  ), [connectedMediaPortIds]);
  const mediaSlotCount = useMemo(() => (
    getStoredTelegramMediaSlotCount(data.mediaInputCount, requiredMediaSlotCount)
  ), [data.mediaInputCount, requiredMediaSlotCount]);
  const mediaSlotPortIds = useMemo(() => (
    Array.from({ length: mediaSlotCount }, (_, index) => getTelegramMediaInputPortId(index))
  ), [mediaSlotCount]);
  const connectedText = useMemo(() => (
    textInputs.map((input) => input.text.trim()).filter(Boolean).join('\n\n')
  ), [textInputs]);
  const connectedMessageText = useMemo(() => normalizeTelegramPlainText(connectedText), [connectedText]);
  const legacyMessageText = useMemo(() => (
    [data.publicationTitle, data.body, data.caption, data.cta]
      .map((part) => part?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
  ), [data.body, data.caption, data.cta, data.publicationTitle]);
  const localMessageText = normalizeTelegramPlainText(data.messageText ?? legacyMessageText);
  const localMessageSourceText = normalizeTelegramPlainText(data.messageSourceText);
  const hasConnectedText = connectedMessageText.length > 0;
  const shouldUseLocalMessage = !hasConnectedText
    || (localMessageSourceText === connectedMessageText && localMessageText.length > 0);
  const messageText = useMemo(() => (
    shouldUseLocalMessage ? localMessageText : connectedMessageText
  ), [connectedMessageText, localMessageText, shouldUseLocalMessage]);
  const storedRichTextPlainText = useMemo(() => (
    normalizeTelegramPlainText(getPlainTextFromTelegramRichText(data.messageRichText))
  ), [data.messageRichText]);
  const hasCurrentRichText = Boolean(data.messageRichText)
    && (
      normalizeTelegramPlainText(data.messageRichTextSource) === messageText
      || storedRichTextPlainText === messageText
    );
  const messageRichText = hasCurrentRichText ? data.messageRichText ?? '' : '';
  const uniqueImageInputs = useMemo(() => (
    uniqueByAssetId(imageInputs)
  ), [imageInputs]);
  const mediaOrder = useMemo(() => (
    uniqueImageInputs.map((input) => input.assetId)
  ), [uniqueImageInputs]);
  const orderedImageInputs = useMemo(() => (
    uniqueImageInputs
  ), [uniqueImageInputs]);
  const imageAssetIds = useMemo(() => orderedImageInputs.map((input) => input.assetId), [orderedImageInputs]);
  const previewMediaItems = useMemo<TelegramPreviewMediaItem[]>(() => (
    orderedImageInputs.slice(0, TELEGRAM_MAX_MEDIA_ITEMS).map((input) => ({
      asset: input.asset,
      assetId: input.assetId,
      edgeId: input.edge.id,
      targetPortId: input.targetPortId,
    }))
  ), [orderedImageInputs]);
  const artifact = useMemo(() => (
    createPublicationArtifact({
      id: data.artifactId || `${node.id}-telegram-post`,
      platformId: 'telegram',
      contentUnitId: DEFAULT_PUBLICATION_CONTENT_UNIT_ID,
      contentPlain: messageText,
      sourceNodeId: node.id,
      components: createPublicationComponents(messageText),
      attachments: orderedImageInputs.map((input, index): PublicationAttachment => ({
        id: `${node.id}-telegram-image-${input.assetId}`,
        kind: 'image',
        assetId: input.assetId,
        order: index,
        slot: index === 0 ? 'cover' : 'gallery',
        metadata: {
          height: input.asset.height,
          width: input.asset.width,
        },
      })),
      metadata: {
        previewMediaCount: previewMediaItems.length,
        sourceImageCount: imageInputs.length,
        sourceTextCount: textInputs.length,
      },
      status: 'draft',
    })
  ), [data.artifactId, imageInputs.length, messageText, node.id, orderedImageInputs, previewMediaItems.length, textInputs.length]);
  const validation = useMemo<PublicationValidationReport>(() => (
    TELEGRAM_CONTENT_UNIT
      ? validatePublicationArtifact(artifact, TELEGRAM_CONTENT_UNIT)
      : {
        status: 'warning',
        metrics: getPublicationMetrics(artifact),
        issues: [],
      }
  ), [artifact]);

  useEffect(() => {
    const shouldAdoptConnectedText = hasConnectedText && !shouldUseLocalMessage && data.messageText !== messageText;
    const shouldClearStaleRichText = Boolean(data.messageRichText || data.messageRichTextSource)
      && !hasCurrentRichText;
    const shouldSync = data.result !== messageText
      || data.mediaInputCount !== mediaSlotCount
      || data.sourceImageCount !== imageInputs.length
      || data.sourceTextCount !== textInputs.length
      || !areStringArraysEqual(data.mediaOrder, mediaOrder)
      || shouldAdoptConnectedText
      || shouldClearStaleRichText;
    if (!shouldSync) return;

    updateNodeDataSilent(node.id, {
      mediaOrder,
      mediaInputCount: mediaSlotCount,
      ...(shouldAdoptConnectedText ? {
        messageRichText: '',
        messageRichTextSource: '',
        messageSourceText: '',
        messageText,
      } : null),
      ...(shouldClearStaleRichText ? {
        messageRichText: '',
        messageRichTextSource: '',
      } : null),
      result: messageText,
      sourceImageCount: imageInputs.length,
      sourceTextCount: textInputs.length,
    });
  }, [data.mediaInputCount, data.mediaOrder, data.messageRichText, data.messageRichTextSource, data.messageText, data.result, data.sourceImageCount, data.sourceTextCount, hasConnectedText, hasCurrentRichText, imageInputs.length, mediaOrder, mediaSlotCount, messageText, node.id, shouldUseLocalMessage, textInputs.length, updateNodeDataSilent]);

  const handleFormatMessage = useCallback(async () => {
    if (!messageText.trim()) {
      updateNodeData(node.id, { message: 'Добавь или подключи текст перед форматированием.' });
      return;
    }

    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const nextMessage = await requestFormatTelegramText({
        inputText: messageText,
        model: DEFAULT_ANALYSIS_MODEL,
      });
      assertTelegramFormattingPreservesText(messageText, nextMessage.plainText);
      updateNodeData(node.id, {
        message: nextMessage.message ?? '',
        messageRichText: nextMessage.richText,
        messageRichTextSource: nextMessage.plainText,
        messageSourceText: connectedMessageText,
        messageText: nextMessage.plainText,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter Telegram formatting failed',
      });
    }
  }, [connectedMessageText, messageText, node.id, setNodeStatus, updateNodeData, updateNodeDataSilent]);

  return {
    artifact,
    contentUnit: TELEGRAM_CONTENT_UNIT,
    data,
    formatDisabled: node.status === 'running' || !messageText.trim(),
    handleFormatMessage,
    handleMessageTextChange: (nextMessage: TelegramMessageEditorValue) => updateNodeData(node.id, {
      messageRichText: nextMessage.richText,
      messageRichTextSource: nextMessage.plainText,
      messageSourceText: connectedMessageText,
      messageText: nextMessage.plainText,
    }),
    handleMediaReorder: (fromIndex: number, toIndex: number) => {
      const nextImageInputs = moveItem(orderedImageInputs, fromIndex, toIndex);
      const nextMediaOrder = nextImageInputs.map((input) => input.assetId);
      reorderTelegramMediaInputs(node.id, nextImageInputs.map((input) => input.edge.id), nextMediaOrder);
    },
    handleMediaRemove: (edgeId?: string) => {
      if (edgeId) deleteEdge(edgeId);
    },
    hasMediaOverflow: orderedImageInputs.length > TELEGRAM_MAX_MEDIA_ITEMS,
    imageAssetIds,
    imageCount: orderedImageInputs.length,
    imageInputs: orderedImageInputs,
    localMessageText,
    connectedMediaPortIds,
    mediaSlotCount,
    mediaSlotPortIds,
    mediaOverflowCount: Math.max(0, orderedImageInputs.length - TELEGRAM_MAX_MEDIA_ITEMS),
    messageRichText,
    messageText,
    platform: TELEGRAM_PLATFORM,
    previewMediaItems,
    textCount: textInputs.length,
    textInputs,
    validation,
  };
}

function isTelegramMediaTargetPort(portId: string) {
  return portId === 'media' || getTelegramMediaInputPortIndex(portId) >= 0;
}

function sortTelegramImageInputs<T extends GraphImageInputItem>(items: T[]) {
  return [...items].sort((first, second) => {
    const firstPortIndex = first.targetPortId === 'media' ? 0 : getTelegramMediaInputPortIndex(first.targetPortId);
    const secondPortIndex = second.targetPortId === 'media' ? 0 : getTelegramMediaInputPortIndex(second.targetPortId);
    if (firstPortIndex !== secondPortIndex) return firstPortIndex - secondPortIndex;
    return (first.collectionIndex ?? 0) - (second.collectionIndex ?? 0);
  });
}

function getTelegramMediaSlotCount(connectedPortIds: string[]) {
  const usedSlotCount = connectedPortIds.length;
  const nextFreeSlotCount = usedSlotCount >= TELEGRAM_MEDIA_MAX_INPUTS
    ? TELEGRAM_MEDIA_MAX_INPUTS
    : usedSlotCount + 1;
  return Math.max(
    TELEGRAM_MEDIA_MIN_INPUTS,
    Math.min(TELEGRAM_MEDIA_MAX_INPUTS, nextFreeSlotCount),
  );
}

function getStoredTelegramMediaSlotCount(storedInputCount: number | undefined, minimumInputCount: number) {
  const storedCount = Math.floor(Number(storedInputCount) || TELEGRAM_MEDIA_MIN_INPUTS);
  if (storedCount > minimumInputCount + 1) return minimumInputCount;
  return Math.max(
    minimumInputCount,
    TELEGRAM_MEDIA_MIN_INPUTS,
    Math.min(TELEGRAM_MEDIA_MAX_INPUTS, storedCount),
  );
}

function createPublicationComponents(messageText: string): PublicationComponent[] {
  const trimmedMessage = messageText.trim();
  if (!trimmedMessage) return [];

  return [{
    id: 'telegram-message',
    type: 'body',
    slot: 'body',
    order: 0,
    contentText: trimmedMessage,
  }];
}

function uniqueByAssetId<T extends { assetId: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.assetId || seen.has(item.assetId)) return false;
    seen.add(item.assetId);
    return true;
  });
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function areStringArraysEqual(left: string[] | undefined, right: string[]) {
  if (!left || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}
