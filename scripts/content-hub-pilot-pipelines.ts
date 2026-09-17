import { config } from 'dotenv';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { createDocument, listDocuments, saveDocumentSnapshot } from '@/entities/document/server/document-service';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { compileStudioSection } from '@/modules/executable-pipelines/adapters/studio/studio-pipeline-compiler';
import { getRuntimePipelineVersionDescriptor } from '@/modules/executable-pipelines/server/runtime-catalog-service';
import { requireRuntimeAdmin, requireRuntimeClient, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { createRuntimeGrant } from '@/modules/executable-pipelines/server/runtime-grant-service';
import { listRuntimeGrants } from '@/modules/executable-pipelines/server/runtime-grant-read-service';
import { listStudioPipelinePublications, publishStudioPipeline } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { isProductionPipelineHandlerSupported } from '@/modules/executable-pipelines/server/pipeline-production-manifest';
import { getPostgresPool } from '@/shared/db/client';
import { contentHubPilotRecipes, createContentHubPilotSnapshot } from './content-hub-pilot-recipes';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

try {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const options: Record<string, string> = {};
  const values = args.filter((arg) => arg !== '--apply');
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]?.replace(/^--/, '');
    const value = values[i + 1];
    if (!key || !values[i].startsWith('--') || !['user', 'workspace', 'client', 'consumer-workspace', 'model'].includes(key)
      || options[key] || !value || value.startsWith('--')) throw new Error('Invalid arguments.');
    options[key] = value;
  }
  const actor: RuntimeSessionActor = { kind: 'session', userId: z.string().min(1).parse(options.user), workspaceId: z.uuid().parse(options.workspace) };
  const clientId = z.uuid().parse(options.client);
  const consumerWorkspace = z.uuid().parse(options['consumer-workspace']);
  const model = z.string().min(3).max(160).regex(/^[a-zA-Z0-9._/-]+$/).parse(options.model ?? 'google/gemini-2.5-flash');
  await requireRuntimeAdmin(actor);
  const client = await requireRuntimeClient(actor, clientId);
  if (!client.enabled || client.sourceApplication !== 'content-hub' || client.externalWorkspaceRef !== consumerWorkspace) {
    throw new Error('The active Content Hub connection does not match the requested consumer Workspace.');
  }
  const documents = (await listDocuments(actor.userId)).filter((document) => document.workspaceId === actor.workspaceId);
  const grants = await listRuntimeGrants(actor, clientId);
  // Preflight every recipe before the first write. Never overwrite a manually edited Studio document.
  const prepared = contentHubPilotRecipes.map((recipe) => {
    const recipeModel = options.model ? model : recipe.capabilityKey === 'content.generate-seo-draft' ? 'anthropic/claude-haiku-4.5' : model;
    const snapshot = validateDocumentSnapshot(createContentHubPilotSnapshot(recipe, recipeModel));
    const compilation = compileStudioSection(snapshot.project, recipe.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    const candidates = documents.filter((document) => document.name === recipe.documentName && document.status !== 'trash');
    if (candidates.length > 1) throw new Error(`Multiple documents match ${recipe.capabilityKey}; resolve explicitly in Studio.`);
    const existing = candidates[0];
    if (existing?.snapshot) {
      const actual = compileStudioSection(existing.snapshot.project, recipe.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
      if (!isDeepStrictEqual(compilation, actual)) throw new Error(`Existing ${recipe.capabilityKey} was edited; this bootstrap will not overwrite or republish it.`);
    } else if (existing && existing.revision !== 0) {
      throw new Error(`Existing ${recipe.capabilityKey} has an unexpected empty revision.`);
    }
    return { recipe, snapshot, existing, model: recipeModel };
  });
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, workspaceId: actor.workspaceId, clientId, consumerWorkspace,
      recipes: prepared.map(({ recipe, existing, model: recipeModel }) => ({ capabilityKey: recipe.capabilityKey, existingDocumentId: existing?.id ?? null, model: recipeModel, input: { brief: 'required text' }, output: { [recipe.capabilityKey === 'channels.analyze-telegram-sample' ? 'analysis' : 'draft']: 'required text (Markdown)' } })) }));
  } else {
    for (const { recipe, snapshot, existing } of prepared) {
      let document = existing ?? await createDocument({ userId: actor.userId, workspaceId: actor.workspaceId, name: recipe.documentName });
      if (!document.snapshot) document = await saveDocumentSnapshot({ userId: actor.userId, documentId: document.id, expectedRevision: document.revision, snapshot });
      const published = await listStudioPipelinePublications({ documentId: document.id, userId: actor.userId });
      const publication = published.find((entry) => entry.sectionId === recipe.sectionId)
        ?? await publishStudioPipeline({ userId: actor.userId, documentId: document.id, sectionId: recipe.sectionId, snapshot: document.snapshot });
      const descriptor = await getRuntimePipelineVersionDescriptor(actor, publication.endpointPublicId, publication.version);
      const existingGrant = grants.find((grant) => grant.enabled && grant.pipelinePublicId === publication.endpointPublicId && grant.capabilityKey === recipe.capabilityKey);
      if (existingGrant && (existingGrant.pinned.checksum !== descriptor.version.checksum
        || existingGrant.updatePolicy !== 'PINNED' || existingGrant.costPolicy.mode !== 'BEST_EFFORT'
        || existingGrant.costPolicy.maximumProviderCostUsd !== null)) throw new Error(`Existing grant differs for ${recipe.capabilityKey}; review separately.`);
      const grant = existingGrant ?? await createRuntimeGrant(actor, clientId, {
        pipeline: publication.endpointPublicId, capabilityKey: recipe.capabilityKey,
        version: descriptor.version.version, checksum: descriptor.version.checksum,
        inputSchemaChecksum: descriptor.version.inputSchemaChecksum, outputSchemaChecksum: descriptor.version.outputSchemaChecksum,
        updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'BEST_EFFORT', maximumProviderCostUsd: null },
      });
      console.log(JSON.stringify({ documentId: document.id, documentRevision: document.revision, capabilityKey: recipe.capabilityKey, grant, paidRunExecuted: false }));
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0,1000) : 'Pipeline provisioning failed.');
  process.exitCode = 1;
} finally {
  await getPostgresPool().end().catch(() => undefined);
}
