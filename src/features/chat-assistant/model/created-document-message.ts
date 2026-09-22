export type CreationMessageKind = 'storyboard' | 'timeline' | 'flow';
export interface CreationMessageScope { userId: string; workspaceId: string; kind: CreationMessageKind; documentId: string }
export interface CreationMessage { prompt: string; state: 'queued' | 'claimed'; createdAt: number }
const memory = new Map<string, CreationMessage>();
const key = (scope: CreationMessageScope) => `production:first-message:v1:${scope.userId}:${scope.workspaceId}:${scope.kind}:${scope.documentId}`;
function storage() { try { return typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { return undefined; } }
export function queueCreationMessage(scope: CreationMessageScope, prompt: string) {
  const value: CreationMessage = { prompt, state: 'queued', createdAt: Date.now() };
  memory.set(key(scope), value);
  try { storage()?.setItem(key(scope), JSON.stringify(value)); } catch { /* In-memory handoff still works. */ }
}
export function readCreationMessage(scope: CreationMessageScope): CreationMessage | undefined {
  const cached = memory.get(key(scope)); if (cached) return cached;
  try {
    const value = JSON.parse(storage()?.getItem(key(scope)) ?? 'null') as CreationMessage | null;
    if (value && typeof value.prompt === 'string' && value.prompt.length <= 12_000 && ['queued', 'claimed'].includes(value.state)
      && typeof value.createdAt === 'number' && Date.now() - value.createdAt < 24 * 60 * 60 * 1000) {
      // A reload must never automatically repeat a possibly paid first turn.
      const recovered: CreationMessage = { ...value, state: 'claimed' }; memory.set(key(scope), recovered); return recovered;
    }
  } catch { /* Invalid or disabled storage is not an instruction to submit. */ }
}
export function claimCreationMessage(scope: CreationMessageScope) {
  const value = readCreationMessage(scope); if (!value || value.state !== 'queued') return undefined;
  const claimed: CreationMessage = { ...value, state: 'claimed' }; memory.set(key(scope), claimed);
  try { storage()?.setItem(key(scope), JSON.stringify(claimed)); } catch { /* Keep the in-memory claim. */ }
  return claimed;
}
export function clearCreationMessage(scope: CreationMessageScope) {
  memory.delete(key(scope)); try { storage()?.removeItem(key(scope)); } catch { /* No persistence available. */ }
}
