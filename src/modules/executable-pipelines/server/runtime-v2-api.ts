import { runtimeV2GrantEnabledSchema } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';
import { authenticateRuntimeClientRequest } from './runtime-client-auth';
import { getRuntimeClient } from './runtime-client-service';
import { getRuntimePipelineVersionDescriptor, listRuntimePipelines, listRuntimePipelineVersions } from './runtime-catalog-service';
import { getRuntimeGrant, getRuntimeGrantUpdates, listRuntimeGrants } from './runtime-grant-read-service';
import { createRuntimeGrant, repinRuntimeGrant, setRuntimeGrantEnabled } from './runtime-grant-service';
import { submitRuntimeV2Run } from './runtime-v2-run-service';
import { cancelRuntimeV2Run, getRuntimeV2Artifact, getRuntimeV2Run, runtimeV2RunDto } from './runtime-v2-run-read';
import { readRuntimeBody, runtimeError, runtimeId, runtimeJson, runtimeVersionNumber } from './runtime-v2-http';
import { runtimeV2OpenApi } from '../contracts/runtime-v2-openapi';

export async function handleRuntimeV2(request: Request, segments: string[]) {
  try {
    const [root, id, action, artifactId] = segments;
    const method = request.method;
    if (root === 'openapi.json' && segments.length === 1 && method === 'GET') return runtimeJson(runtimeV2OpenApi());
    if (root === 'client' && segments.length === 1 && method === 'GET') {
      const actor = await authenticateRuntimeClientRequest(request);
      return runtimeJson({ client: await getRuntimeClient(actor, actor.serviceClientId) });
    }
    if (root === 'pipelines' && method === 'GET') {
      const actor = await authenticateRuntimeClientRequest(request, 'pipeline.catalog.read');
      if (!id) return runtimeJson({ pipelines: await listRuntimePipelines(actor) });
      if (action === 'versions' && segments.length === 3) return runtimeJson({ versions: await listRuntimePipelineVersions(actor, id) });
      if (action === 'versions' && segments.length === 4) return runtimeJson({ descriptor: await getRuntimePipelineVersionDescriptor(actor, id, runtimeVersionNumber(artifactId!)) });
    }
    if (root === 'grants' && !id) {
      const actor = await authenticateRuntimeClientRequest(request, method === 'GET' ? 'pipeline.descriptor.read' : 'pipeline.grants.manage');
      if (method === 'GET') return runtimeJson({ grants: await listRuntimeGrants(actor, actor.serviceClientId) });
      if (method === 'POST') return runtimeJson({ grant: await createRuntimeGrant(actor, actor.serviceClientId, await readRuntimeBody(request)) }, 201);
    }
    if (root === 'grants' && id) {
      runtimeId(id);
      if (action === 'runs' && segments.length === 3 && method === 'POST') {
        const submitted = await submitRuntimeV2Run(request, id, await readRuntimeBody(request));
        const response = runtimeJson(await runtimeV2RunDto(submitted.run, submitted.idempotentReplay), 202);
        response.headers.set('Location', `/v2/runtime/runs/${submitted.run.id}`);
        return response;
      }
      const actor = await authenticateRuntimeClientRequest(request, method === 'GET' ? 'pipeline.descriptor.read' : 'pipeline.grants.manage');
      if (!action && method === 'GET') return runtimeJson({ grant: await getRuntimeGrant(actor, id) });
      if (action === 'updates' && segments.length === 3 && method === 'GET') return runtimeJson({ updates: await getRuntimeGrantUpdates(actor, id) });
      if ((action === 'repin' || action === 'rollback') && segments.length === 3 && method === 'POST') return runtimeJson({ grant: await repinRuntimeGrant(actor, id, await readRuntimeBody(request), action === 'rollback') });
      if (!action && method === 'PATCH') {
        const body = runtimeV2GrantEnabledSchema.parse(await readRuntimeBody(request));
        return runtimeJson({ grant: await setRuntimeGrantEnabled(actor, id, body.enabled, body.expectedGrantRevision) });
      }
    }
    if (root === 'runs' && id) {
      if (!action && method === 'GET') return await getRuntimeV2Run(request, id);
      if (action === 'cancel' && segments.length === 3 && method === 'POST') return await cancelRuntimeV2Run(request, id);
      if (action === 'artifacts' && artifactId && segments.length === 4 && method === 'GET') return await getRuntimeV2Artifact(request, id, artifactId);
    }
    throw new RuntimeV2Error('not_found', 'Runtime route was not found.', 404);
  } catch (error) { return runtimeError(error); }
}
