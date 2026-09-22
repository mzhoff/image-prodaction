import { trackBehavior } from '@/shared/analytics/client';

/** IDs only guard this local lifecycle; the callback sends no document identity. */
export function createDocumentOpenTracker(emit = () => trackBehavior('ip_document_opened', { source: 'editor' })) {
  let current: string | undefined;
  let reported = false;
  return {
    select(documentId: string | undefined) {
      if (current === documentId) return false;
      current = documentId;
      reported = false;
      return true;
    },
    loaded(documentId: string) {
      if (current !== documentId || reported) return;
      reported = true;
      emit();
    },
  };
}
