import { loadWorkspaceAiAccess, readWorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';
import type { WorkspaceAiAccess } from '@/modules/chat-assistant/adapters/client/workspace-ai-access';

/** UX preflight only. Every paid operation still checks access on the server. */
export async function checkAiAccessBeforeSubmit(workspaceId: string, blocked: (access: WorkspaceAiAccess | undefined) => void) {
  try {
    const known = readWorkspaceAiAccess(workspaceId);
    const access = known && known.status !== 'connected' ? known : await loadWorkspaceAiAccess(workspaceId);
    if (access.status === 'connected') return true;
    blocked(access);
  } catch { blocked(undefined); }
  return false;
}
