import { z } from 'zod';
import { runtimeV2ClientSchema, runtimeV2CreateGrantSchema, runtimeV2GrantEnabledSchema, runtimeV2RepinSchema } from './runtime-v2-contracts';
import { runtimeV2GrantSchema, runtimeV2PipelineSchema, runtimeV2PipelineVersionDescriptorSchema, runtimeV2UpdatesSchema, runtimeV2VersionSchema } from './runtime-v2-descriptor-contracts';
import { runtimeV2RunRequestSchema, runtimeV2RunSchema } from './runtime-v2-run-contracts';
import { runtimeAudioUploadResponseSchema } from './runtime-audio-contracts';

export const runtimeV2ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }).strict() }).strict();
const grant = z.object({ grant: runtimeV2GrantSchema }).strict();
const json = (schema: z.ZodType) => ({ 'application/json': { schema: z.toJSONSchema(schema, { target: 'draft-2020-12' }) } });

/** Generated from the same runtime validators used by routes and UI clients. */
export function runtimeV2OpenApi() {
  const operation = (summary: string, response: z.ZodType, input?: z.ZodType, status = 200) => ({
    summary, security: [{ RuntimeClientCredential: [] }],
    ...(input ? { requestBody: { required: true, content: json(input) } } : {}),
    responses: {
      [status]: { description: 'Successful response', content: json(response) },
      default: { description: 'Stable machine-readable error; no secrets or internals', content: json(runtimeV2ErrorSchema) },
    },
  });
  const pathId = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string', ...(name === 'publicId' ? {} : name === 'version' ? { pattern: '^[1-9][0-9]*$' } : { format: 'uuid' }) } });
  return {
    openapi: '3.1.0', info: { title: 'Image Production Runtime', version: '2.0.0',
      description: 'Workspace-scoped server credentials and pinned pipeline grants. V1 is unchanged. All money is a decimal string; null means unknown. Keys are server-only.' },
    servers: [{ url: '/v2/runtime' }],
    components: { securitySchemes: { RuntimeClientCredential: { type: 'http', scheme: 'bearer', bearerFormat: 'rvr_client_*' } } },
    paths: {
      '/assets/audio': { post: {
        ...operation('Upload private audio (explicit pipeline.asset.write; 50 MiB / 30 minutes)', runtimeAudioUploadResponseSchema, undefined, 201),
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 1, maxLength: 255 } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', additionalProperties: false, required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } },
      } },
      '/client': { get: operation('Current service connection', z.object({ client: runtimeV2ClientSchema }).strict()) },
      '/pipelines': { get: operation('Published Workspace catalog (pipeline.catalog.read)', z.object({ pipelines: z.array(runtimeV2PipelineSchema) }).strict()) },
      '/pipelines/{publicId}/versions': { parameters: [pathId('publicId')], get: operation('Published versions, never drafts', z.object({ versions: z.array(runtimeV2VersionSchema) }).strict()) },
      '/pipelines/{publicId}/versions/{version}': { parameters: [pathId('publicId'), pathId('version')], get: operation('Candidate version contracts', z.object({ descriptor: runtimeV2PipelineVersionDescriptorSchema }).strict()) },
      '/grants': {
        get: operation('Connection grants (pipeline.descriptor.read)', z.object({ grants: z.array(runtimeV2GrantSchema) }).strict()),
        post: operation('Create pinned grant (explicit pipeline.grants.manage)', grant, runtimeV2CreateGrantSchema, 201),
      },
      '/grants/{grantId}': { parameters: [pathId('grantId')], get: operation('Pinned descriptor', grant), patch: operation('Enable/disable grant with revision guard', grant, runtimeV2GrantEnabledSchema) },
      '/grants/{grantId}/updates': { parameters: [pathId('grantId')], get: operation('Discover latest publication and compatibility, without updating', z.object({ updates: runtimeV2UpdatesSchema }).strict()) },
      '/grants/{grantId}/repin': { parameters: [pathId('grantId')], post: operation('Explicit atomic repin', grant, runtimeV2RepinSchema) },
      '/grants/{grantId}/rollback': { parameters: [pathId('grantId')], post: operation('Return to a previously pinned immutable version', grant, runtimeV2RepinSchema) },
      '/grants/{grantId}/runs': { parameters: [pathId('grantId'), { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1, maxLength: 255 } }], post: operation('Submit or replay a durable run', runtimeV2RunSchema, runtimeV2RunRequestSchema, 202) },
      '/runs/{runId}': { parameters: [pathId('runId')], get: operation('Status, outputs and honest usage (pipeline.run.read)', runtimeV2RunSchema) },
      '/runs/{runId}/cancel': { parameters: [pathId('runId')], post: operation('Request cancellation; completed runs may return cancellation_race', runtimeV2RunSchema) },
      '/runs/{runId}/artifacts/{assetId}': { parameters: [pathId('runId'), pathId('assetId')], get: {
        summary: 'Download a declared artifact owned by the run (pipeline.artifact.read)', security: [{ RuntimeClientCredential: [] }],
        responses: { '200': { description: 'Authenticated binary artifact', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } }, default: { description: 'Artifact unavailable', content: json(runtimeV2ErrorSchema) } },
      } },
    },
  };
}
