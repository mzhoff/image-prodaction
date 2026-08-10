import type { GraphImageInputItem, GraphTextInputItem } from '@/entities/production-graph/model/graph-io';
import {
  TELEGRAM_MEDIA_MAX_INPUTS,
  TELEGRAM_MEDIA_MIN_INPUTS,
  getTelegramMediaInputPortIndex,
} from '@/entities/production-graph/model/node-definitions';
import type { PublicationComponent } from '@/entities/production-graph/model/publication';
import {
  getPlainTextFromTelegramRichText,
  normalizeTelegramPlainText,
} from '../lib/telegram-rich-text';

export function isTelegramMediaTargetPort(portId: string) {
  return portId === 'media' || getTelegramMediaInputPortIndex(portId) >= 0;
}

export function sortTelegramImageInputs<T extends GraphImageInputItem>(items: T[]) {
  return [...items].sort((first, second) => {
    const firstIndex = first.targetPortId === 'media' ? 0 : getTelegramMediaInputPortIndex(first.targetPortId);
    const secondIndex = second.targetPortId === 'media' ? 0 : getTelegramMediaInputPortIndex(second.targetPortId);
    return firstIndex !== secondIndex
      ? firstIndex - secondIndex
      : (first.collectionIndex ?? 0) - (second.collectionIndex ?? 0);
  });
}

export function getConnectedRichText(textInputs: GraphTextInputItem[]) {
  return textInputs.find((input) => input.richText
    && normalizeTelegramPlainText(getPlainTextFromTelegramRichText(input.richText))
      === normalizeTelegramPlainText(input.text))?.richText ?? '';
}

export function getTelegramMediaSlotCountFromInputs(
  connectedPortIds: string[],
  storedInputCount: number | undefined,
) {
  const connectedIndices = connectedPortIds
    .map((portId) => getTelegramMediaInputPortIndex(portId))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  const maxConnectedIndex = connectedIndices.at(-1) ?? -1;
  const storedCount = Math.floor(Number(storedInputCount) || TELEGRAM_MEDIA_MIN_INPUTS);
  const baseCount = connectedIndices.length === 0
    ? storedCount
    : Math.max(storedCount, maxConnectedIndex + 2);
  return Math.min(TELEGRAM_MEDIA_MAX_INPUTS, Math.max(TELEGRAM_MEDIA_MIN_INPUTS, baseCount));
}

export function createPublicationComponents(messageText: string): PublicationComponent[] {
  const contentText = messageText.trim();
  return contentText ? [{
    id: 'telegram-message',
    type: 'body',
    slot: 'body',
    order: 0,
    contentText,
  }] : [];
}

export function uniqueByAssetId<T extends { assetId: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.assetId || seen.has(item.assetId)) return false;
    seen.add(item.assetId);
    return true;
  });
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0
    || fromIndex >= items.length || toIndex >= items.length) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export function areStringArraysEqual(left: string[] | undefined, right: string[]) {
  return Boolean(left && left.length === right.length
    && left.every((item, index) => item === right[index]));
}
