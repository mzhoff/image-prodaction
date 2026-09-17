// Outlives the editor during an in-app navigation. A reopened document must wait
// for its previous editor's final save before reading the server revision.
const pendingSaves = new Map<string, Promise<number>>();
export const DOCUMENT_PREVIEW_UPDATED = 'document-preview-updated';

export function retainDocumentExitSave(id: string, save: Promise<number>) {
  pendingSaves.set(id, save);
  void save.finally(() => {
    if (pendingSaves.get(id) === save) pendingSaves.delete(id);
  }).catch(() => undefined);
  return save;
}

export async function waitForDocumentExitSave(id: string) {
  await pendingSaves.get(id)?.catch(() => undefined);
}
