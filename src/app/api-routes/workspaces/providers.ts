import { z } from 'zod';
import {
  connectOpenRouterProvider,
  disconnectOpenRouterProvider,
  getOpenRouterProviderUsage,
  listWorkspaceProviderConnections,
  ProviderConnectionNotConfiguredError,
  ProviderCredentialValidationError,
  validateStoredOpenRouterProvider,
} from '@/modules/provider-connections/server/provider-connection-service';
import { ProviderCredentialConfigurationError } from '@/modules/provider-connections/server/credential-crypto-config';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

const connectOpenRouterSchema = z.object({
  apiKey: z.string().trim().min(16).max(512),
});

export async function getWorkspaceProviders(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) return invalidWorkspaceId();
    const session = await requireApiSession(request);
    const result = await listWorkspaceProviderConnections(session.user.id, workspaceId);
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toProviderConnectionApiError(error);
  }
}

export async function connectWorkspaceOpenRouter(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) return invalidWorkspaceId();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 4_096) {
      return apiError('provider_credential_too_large', 'Provider credential request is too large.', 413);
    }
    const parsed = connectOpenRouterSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return apiError('invalid_provider_credential', 'Enter a valid OpenRouter key.', 400);
    }
    const session = await requireApiSession(request);
    const result = await connectOpenRouterProvider({
      apiKey: parsed.data.apiKey,
      userId: session.user.id,
      workspaceId,
    });
    return Response.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toProviderConnectionApiError(error);
  }
}

export async function validateWorkspaceOpenRouter(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) return invalidWorkspaceId();
    const session = await requireApiSession(request);
    const result = await validateStoredOpenRouterProvider(session.user.id, workspaceId);
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toProviderConnectionApiError(error);
  }
}

export async function disconnectWorkspaceOpenRouter(
  request: Request,
  workspaceId: string,
) {
  try {
    if (!isUuidV7(workspaceId)) return invalidWorkspaceId();
    const session = await requireApiSession(request);
    await disconnectOpenRouterProvider(session.user.id, workspaceId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toProviderConnectionApiError(error);
  }
}

export async function getWorkspaceOpenRouterUsage(request: Request, workspaceId: string) {
  try {
    if (!isUuidV7(workspaceId)) return invalidWorkspaceId();
    const session = await requireApiSession(request);
    const result = await getOpenRouterProviderUsage(session.user.id, workspaceId);
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toProviderConnectionApiError(error);
  }
}

function invalidWorkspaceId() {
  return apiError('invalid_workspace_id', 'Invalid workspace id.', 400);
}

function toProviderConnectionApiError(error: unknown) {
  if (error instanceof ProviderConnectionNotConfiguredError) {
    return apiError('provider_not_configured', error.message, 409);
  }
  if (error instanceof ProviderCredentialValidationError) {
    const descriptor = error.providerError.descriptor;
    return apiError(
      descriptor.code,
      descriptor.message,
      descriptor.classification === 'retryable' || descriptor.classification === 'ambiguous'
        ? 503
        : 422,
      {
        details: {
          classification: descriptor.classification,
          retryAfterSeconds: descriptor.retryAfterMs
            ? Math.ceil(descriptor.retryAfterMs / 1_000)
            : null,
        },
      },
    );
  }
  if (error instanceof ProviderCredentialConfigurationError) {
    return apiError(
      'provider_credentials_not_configured',
      'Server credential encryption is not configured.',
      503,
    );
  }
  return toApiErrorResponse(error);
}
