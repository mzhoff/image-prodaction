'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { HomeVideoSlotId } from '@/shared/media/home-video-intent';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { isHeicImageFile } from '@/shared/lib/normalize-image-file';
import type { HomeAttachments } from './use-home-image-submit';
import { availableVideoSlots, moveVideoBinding, readyVideoSlots, reconcileVideoBindings, type VideoSlotBindings } from './home-video-materials';

export function useHomeVideoMaterials(attachments: HomeAttachments, model: VideoModelCapabilities | undefined,
  bindings: VideoSlotBindings, setBindings: Dispatch<SetStateAction<VideoSlotBindings>>) {
  const tUi = useTranslations();
  const pending = useRef<{ slot: HomeVideoSlotId; before: Set<string> } | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const target = pending.current;
    setBindings((previous) => reconcileVideoBindings(previous, attachments.items, model, target));
    if (target && attachments.items.some((item) => !target.before.has(item.id))) pending.current = null;
  }, [attachments.items, model, setBindings]);
  const current = reconcileVideoBindings(bindings, attachments.items, model, pending.current);
  const unassigned = attachments.items.filter((item) => !Object.values(current).some((binding) => binding.itemId === item.id));
  const add = async (slot: HomeVideoSlotId, file: File) => {
    if (pending.current || current[slot]) throw new Error(tUi("Сначала освободите этот слот."));
    if (!attachments.canAdd) throw new Error(tUi("Можно добавить до трёх изображений. Уберите лишний материал."));
    if (!(file.type.startsWith('image/') || isHeicImageFile(file)) || !attachments.acceptsFile(file)) throw new Error(tUi("Выберите изображение размером до 8 МБ."));
    pending.current = { slot, before: new Set(attachments.items.map((item) => item.id)) };
    setNotice('');
    try { await attachments.addFiles([file]); }
    catch (error) { pending.current = null; throw error; }
  };
  return { bindings: current, slots: readyVideoSlots(current, attachments.items), available: availableVideoSlots(model), unassigned, notice, setNotice, add,
    reset: () => { pending.current = null; setBindings({}); setNotice(''); },
    remove: async (slot: HomeVideoSlotId) => { const binding = current[slot]; if (binding) await attachments.remove(binding.itemId); },
    move: (from: HomeVideoSlotId, to: HomeVideoSlotId) => setBindings(moveVideoBinding(current, from, to)),
    describe: (slot: HomeVideoSlotId, description: string) => {
      const binding = current[slot]; if (binding) setBindings({ ...current, [slot]: { ...binding, description } });
    },
  };
}
