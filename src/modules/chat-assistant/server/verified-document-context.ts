import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';

export type VerifiedDocumentContext = {
  id: string;
  revision: number;
};

/**
 * Reads the server-verified document identity from ChatModule context.
 *
 * `selectorRevisionMatches` describes whether the browser snapshot was fresh
 * when the server resolved the context. It is not an authorization decision and
 * must not block proposal preparation: the product tool reloads the document
 * from the server and uses that revision as its proposal baseline. Execution is
 * still protected by the proposal concurrency token and a locked revision check.
 * An explicit unsaved selector is different: the server cannot prepare against
 * client-only graph changes, so it must remain fail-closed until autosave ends.
 */
export function readVerifiedDocumentContext(context: ToolExecutionContext): VerifiedDocumentContext {
  const value = context.verifiedContext?.document;
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.revision !== 'number'
    || !Number.isInteger(value.revision)
    || value.selectorHasUnsavedChanges === true) {
    throw new Error('A verified document context is required for this action.');
  }
  return { id: value.id, revision: value.revision };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
