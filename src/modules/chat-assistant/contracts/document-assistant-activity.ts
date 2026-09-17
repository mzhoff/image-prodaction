export type DocumentAssistantEventKind = 'image-generated' | 'video-generated';

/** A persisted generation fact, also represented as an assistant message without an LLM call. */
export interface DocumentAssistantActivity {
  id: string;
  createdAt: string;
  kind: DocumentAssistantEventKind;
  nodeId: string;
  title: string;
  subtitle: string;
}
