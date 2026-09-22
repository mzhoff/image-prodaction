import type { MontageSelection, MontageSlot } from '../contracts/timeline-production';

/** A meaningful action may span up to three reviewed cells, never across a fixed clip. */
export function selectionLayout(slots: MontageSlot[], { selections }: MontageSelection) {
  const covered = new Set<string>();
  const starts = new Map<string, { selection: MontageSelection['selections'][number]; durationMs: number }>();
  for (const selection of selections) {
    const first = slots.findIndex((slot) => slot.id === selection.slotId);
    const last = selection.throughSlotId ? slots.findIndex((slot) => slot.id === selection.throughSlotId) : first;
    if (first < 0 || last < first || last - first > 2) throw new Error('Модель должна заполнить каждую свободную ячейку ровно один раз.');
    const group = slots.slice(first, last + 1);
    if (group.some((slot, index) => slot.lockedClipId || covered.has(slot.id) || (index > 0 && slot.startMs !== group[index - 1].startMs + group[index - 1].durationMs))) throw new Error('Нельзя объединять повторные ячейки или закреплённые клипы.');
    group.forEach((slot) => covered.add(slot.id));
    starts.set(selection.slotId, { selection, durationMs: group.reduce((sum, slot) => sum + slot.durationMs, 0) });
  }
  if (slots.some((slot) => !slot.lockedClipId && !covered.has(slot.id))) throw new Error('Модель должна заполнить каждую свободную ячейку ровно один раз.');
  return starts;
}
