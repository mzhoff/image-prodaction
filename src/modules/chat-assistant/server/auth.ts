import { createBetterAuthPrincipalResolver } from '@prodactionpro/chat-auth-better-auth';
import { requireWorkspaceMembership, WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';
import { getAuth } from '@/modules/authentication/server/auth-server';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';

export async function resolveChatPrincipal(request: Request) {
  const auth = await getAuth();
  const resolve = createBetterAuthPrincipalResolver({
    auth,
    productId: CHAT_ASSISTANT_PRODUCT_ID,
    requireTenant: true,
    resolveAuthorization: async ({ request: authorizedRequest, userId }) => {
      const workspaceId = normalizeWorkspaceId(authorizedRequest.headers.get('x-workspace-id'));
      if (!workspaceId) return {};
      try {
        const member = await requireWorkspaceMembership(userId, workspaceId);
        return {
          metadata: { workspaceRole: member.role },
          tenantId: workspaceId,
        };
      } catch (error) {
        if (error instanceof WorkspaceAccessError) return {};
        throw error;
      }
    },
  });
  return resolve(request);
}

function normalizeWorkspaceId(value: string | null) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 256 ? normalized : undefined;
}
