import { requireApiSession, AuthenticationRequiredError } from '@/modules/authentication/server/auth-session';
import { readAuthServerConfig } from '@/shared/auth/config';
import { runtimeV2GrantEnabledSchema, runtimeV2SetEnabledSchema } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '@/modules/executable-pipelines/contracts/runtime-v2-errors';
import { requireRuntimeAdmin, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { createRuntimeClient, getRuntimeClient, issueRuntimeCredential, listRuntimeClients, listRuntimeCredentials, revokeRuntimeCredential, setRuntimeClientEnabled } from '@/modules/executable-pipelines/server/runtime-client-service';
import { getRuntimePipelineVersionDescriptor, listRuntimePipelines, listRuntimePipelineVersions } from '@/modules/executable-pipelines/server/runtime-catalog-service';
import { getRuntimeGrant, getRuntimeGrantUpdates, listRuntimeGrants } from '@/modules/executable-pipelines/server/runtime-grant-read-service';
import { createRuntimeGrant, repinRuntimeGrant, setRuntimeGrantEnabled } from '@/modules/executable-pipelines/server/runtime-grant-service';
import { readRuntimeBody, runtimeError, runtimeId, runtimeJson, runtimeVersionNumber } from '@/modules/executable-pipelines/server/runtime-v2-http';
import { submitRuntimeV2Run } from '@/modules/executable-pipelines/server/runtime-v2-run-service';
import { runtimeV2RunDto } from '@/modules/executable-pipelines/server/runtime-v2-run-read';
import { handleRuntimeConnectionRun } from './runtime-connection-runs';

export async function handleWorkspaceRuntimeConnections(request: Request, workspaceId: string, path: string[]) {
  try {
    runtimeId(workspaceId);
    if (!['GET', 'HEAD'].includes(request.method)) assertRuntimeManagementOrigin(request);
    const session = await requireApiSession(request);
    const actor: RuntimeSessionActor = { kind: 'session', userId: session.user.id, workspaceId };
    await requireRuntimeAdmin(actor);
    return await dispatchRuntimeManagement(request, actor, path);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return runtimeError(new RuntimeV2Error('unauthorized', 'Sign in to manage connections.', 401));
    return runtimeError(error);
  }
}

async function dispatchRuntimeManagement(request: Request, actor: RuntimeSessionActor, path: string[]) {
  const [root, clientId, kind, targetId, action] = path;
  const method = request.method;
  if (root === 'pipelines' && method === 'GET') {
    if (path.length === 1) return runtimeJson({ pipelines: await listRuntimePipelines(actor) });
    if (path.length === 3 && kind === 'versions') return runtimeJson({ versions: await listRuntimePipelineVersions(actor, clientId!) });
    if (path.length === 4 && kind === 'versions') return runtimeJson({ descriptor: await getRuntimePipelineVersionDescriptor(actor, clientId!, runtimeVersionNumber(targetId!)) });
  }
  if (root === 'clients' && path.length === 1) {
    if (method === 'GET') return runtimeJson({ clients: await listRuntimeClients(actor) });
    if (method === 'POST') return runtimeJson({ client: await createRuntimeClient(actor, await readRuntimeBody(request)) }, 201);
  }
  if (root === 'clients' && clientId) {
    runtimeId(clientId);
    if (kind === 'runs') return handleRuntimeConnectionRun(request, actor, clientId, path.slice(3));
    if (path.length === 2) {
      if (method === 'GET') {
        const [client, credentials, grants] = await Promise.all([
          getRuntimeClient(actor, clientId), listRuntimeCredentials(actor, clientId), listRuntimeGrants(actor, clientId),
        ]);
        return runtimeJson({ client, credentials, grants });
      }
      if (method === 'PATCH') return runtimeJson({ client: await setRuntimeClientEnabled(actor, clientId, runtimeV2SetEnabledSchema.parse(await readRuntimeBody(request)).enabled) });
    }
    if (kind === 'credentials') {
      if (path.length === 3 && method === 'POST') return runtimeJson(await issueRuntimeCredential(actor, clientId, await readRuntimeBody(request)), 201);
      if (path.length === 5 && targetId && action === 'revoke' && method === 'POST') return runtimeJson({ credential: await revokeRuntimeCredential(actor, clientId, runtimeId(targetId)) });
    }
    if (kind === 'grants') {
      if (path.length === 3 && method === 'POST') return runtimeJson({ grant: await createRuntimeGrant(actor, clientId, await readRuntimeBody(request)) }, 201);
      if (targetId) {
        const grant = await getRuntimeGrant(actor, runtimeId(targetId));
        if (grant.serviceClientId !== clientId) throw new RuntimeV2Error('grant_not_found', 'Pipeline permission was not found.', 404);
        if (path.length === 5 && action === 'runs' && method === 'POST') {
          const submitted = await submitRuntimeV2Run(request, targetId, await readRuntimeBody(request), actor);
          return runtimeJson({ run: await runtimeV2RunDto(submitted.run, submitted.idempotentReplay) }, 202);
        }
        if (path.length === 4 && method === 'GET') return runtimeJson({ grant });
        if (path.length === 4 && method === 'PATCH') {
          const body = runtimeV2GrantEnabledSchema.parse(await readRuntimeBody(request));
          return runtimeJson({ grant: await setRuntimeGrantEnabled(actor, targetId, body.enabled, body.expectedGrantRevision) });
        }
        if (path.length === 5 && action === 'updates' && method === 'GET') return runtimeJson({ updates: await getRuntimeGrantUpdates(actor, targetId) });
        if (path.length === 5 && (action === 'repin' || action === 'rollback') && method === 'POST') return runtimeJson({ grant: await repinRuntimeGrant(actor, targetId, await readRuntimeBody(request), action === 'rollback') });
      }
    }
  }
  throw new RuntimeV2Error('not_found', 'Connection route was not found.', 404);
}

export function assertRuntimeManagementOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const trusted = readAuthServerConfig().trustedOrigins;
  // Use configured exact origins, never untrusted forwarded Host headers.
  if (!origin || !trusted.includes(origin)) throw new RuntimeV2Error('invalid_origin', 'The request origin is not trusted.', 403);
}
