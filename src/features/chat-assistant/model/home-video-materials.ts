import type { ChatAttachmentUploadItem } from '@prodactionpro/chat-runtime-core';
import { HOME_VIDEO_SLOT_IDS, type HomeVideoSlotId, type HomeVideoSlots } from '@/shared/media/home-video-intent';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';

export type VideoSlotBindings = Partial<Record<HomeVideoSlotId, { itemId: string; description: string }>>;
export const VIDEO_SLOT_LABELS: Record<HomeVideoSlotId, string> = {
  firstFrame: 'Первый кадр', lastFrame: 'Последний кадр', reference1: 'Референс 1', reference2: 'Референс 2', reference3: 'Референс 3',
};
export function availableVideoSlots(model?: VideoModelCapabilities): HomeVideoSlotId[] {
  return HOME_VIDEO_SLOT_IDS.filter((slot) => slot === 'firstFrame' ? model?.firstFrame : slot === 'lastFrame' ? model?.lastFrame : model?.references);
}

/** Keep an image's role stable across removals, upload completion and model changes. */
export function reconcileVideoBindings(previous: VideoSlotBindings, items: Pick<ChatAttachmentUploadItem, 'id'>[], model?: VideoModelCapabilities,
  pending?: { slot: HomeVideoSlotId; before: Set<string> } | null): VideoSlotBindings {
  const next = Object.fromEntries(Object.entries(previous).filter(([, value]) => items.some((item) => item.id === value.itemId))) as VideoSlotBindings;
  const targeted = pending && items.find((item) => !pending.before.has(item.id));
  if (targeted && pending && !next[pending.slot]) next[pending.slot] = { itemId: targeted.id, description: '' };
  const available = availableVideoSlots(model);
  for (const item of items) {
    if (Object.values(next).some((value) => value.itemId === item.id)) continue;
    const family = next.firstFrame || next.lastFrame ? ['firstFrame', 'lastFrame'] : next.reference1 || next.reference2 || next.reference3
      ? ['reference1', 'reference2', 'reference3'] : model?.references ? ['reference1', 'reference2', 'reference3'] : ['firstFrame', 'lastFrame'];
    const slot = available.find((id) => family.includes(id) && !next[id]);
    if (slot) next[slot] = { itemId: item.id, description: '' };
  }
  return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
}

export function moveVideoBinding(bindings: VideoSlotBindings, from: HomeVideoSlotId, to: HomeVideoSlotId): VideoSlotBindings {
  if (from === to || !bindings[from]) return bindings;
  const result = { ...bindings, [to]: bindings[from] };
  if (bindings[to]) result[from] = bindings[to]; else delete result[from];
  return result;
}

export function readyVideoSlots(bindings: VideoSlotBindings, items: ChatAttachmentUploadItem[]): HomeVideoSlots {
  return Object.fromEntries(HOME_VIDEO_SLOT_IDS.flatMap((slot) => {
    const binding = bindings[slot];
    const item = binding && items.find((candidate) => candidate.id === binding.itemId);
    return item?.status === 'ready' && item.ref ? [[slot, { attachmentId: item.ref.attachmentId, description: binding!.description }]] : [];
  }));
}
