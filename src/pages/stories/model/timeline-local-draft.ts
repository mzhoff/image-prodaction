import { z } from 'zod';
import { timelineSnapshotSchema, type TimelineDocument, type TimelineWrite } from '@/modules/story-projects/contracts/story-timeline';
import { sameDocumentContent } from './document-content';

export const timelineWrite = (doc: TimelineDocument): TimelineWrite => ({ name: doc.name, folderId: doc.folderId, storyboardId: doc.storyboardId, snapshot: doc.snapshot });
export const sameTimeline = (a: TimelineDocument, b: TimelineDocument) => sameDocumentContent(timelineWrite(a), timelineWrite(b));
export interface LocalTimelineDraft { version: 1; base: TimelineDocument; draft: TimelineDocument; savedAt: number }
export interface TimelineDraftStore { read(): LocalTimelineDraft | null; write(value: LocalTimelineDraft): void }
const documentSchema = z.object({ id: z.uuid(), workspaceId: z.uuid(), folderId: z.uuid().nullable(), storyboardId: z.uuid().nullable(), name: z.string().max(120), revision: z.number().int().min(0), createdAt: z.string(), updatedAt: z.string(), snapshot: timelineSnapshotSchema });
const recordSchema = z.object({ version: z.literal(1), base: documentSchema, draft: documentSchema, savedAt: z.number().finite() });

/** Separate tab journals prevent one tab from deleting another tab's unsynced work. */
export function browserTimelineDraftStore(userId: string, id: string): TimelineDraftStore {
  const prefix = `timeline-autosave:v1:${userId}:${id}:`;
  let tabId: string | undefined;
  let recovered: { key: string; raw: string | null } | undefined;
  const key = () => prefix + (tabId ??= crypto.randomUUID());
  return {
    read() {
      const ownKey = key(); const records: { key: string; value: LocalTimelineDraft }[] = [];
      for (let index = 0; index < localStorage.length; index++) {
        const candidate = localStorage.key(index); if (!candidate?.startsWith(prefix)) continue;
        try {
          const raw = localStorage.getItem(candidate); if (!raw || raw.length > 4 * 1024 * 1024) continue;
          const result = recordSchema.safeParse(JSON.parse(raw));
          if (result.success && result.data.base.id === id && result.data.draft.id === id && result.data.base.workspaceId === result.data.draft.workspaceId) records.push({ key: candidate, value: result.data });
        } catch { /* A broken journal must not prevent loading the server document. */ }
      }
      const own = records.find((item) => item.key === ownKey);
      const selected = own ?? records.sort((a, b) => Number(!sameTimeline(b.value.base, b.value.draft)) - Number(!sameTimeline(a.value.base, a.value.draft)) || b.value.savedAt - a.value.savedAt)[0];
      if (selected && selected.key !== ownKey) recovered = { key: selected.key, raw: localStorage.getItem(selected.key) };
      return selected?.value ?? null;
    },
    write(value) {
      localStorage.setItem(key(), JSON.stringify(value));
      // Transfer a recovered journal only after its replacement is durable.
      if (recovered && localStorage.getItem(recovered.key) === recovered.raw) localStorage.removeItem(recovered.key);
      recovered = undefined;
    },
  };
}
