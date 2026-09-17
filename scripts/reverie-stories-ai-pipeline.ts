/**
 * Local operator: publish a separate AI recipe without executing it or changing grants.
 * Dry-run is the default. Required: --user ID --workspace UUID --client UUID
 * --source-document UUID --profile-file PATH. Add --apply only after reviewing dry-run.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { config } from 'dotenv';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getAssetMetadata, type AssetDto } from '@/entities/asset/server/asset-service';
import { createDocument, getDocument, listDocuments, saveDocumentSnapshot } from '@/entities/document/server/document-service';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { createReverieStoriesAiPreset } from '@/entities/production-graph/model/reverie-stories-ai-preset';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { compileStudioSection } from '@/modules/executable-pipelines/adapters/studio/studio-pipeline-compiler';
import { isCanonicalContentHubWorkspace } from '@/modules/executable-pipelines/core/content-hub-workspace';
import { getRuntimePipelineVersionDescriptor } from '@/modules/executable-pipelines/server/runtime-catalog-service';
import { requireRuntimeAdmin, requireRuntimeClient, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { listStudioPipelinePublications, publishStudioPipeline } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { isProductionPipelineHandlerSupported } from '@/modules/executable-pipelines/server/pipeline-production-manifest';
import { parseStoriesAuthoringProfileBundle } from '@/shared/contracts/stories-authoring-profile';
import { getPostgresPool } from '@/shared/db/client';

export interface AiStoriesOperatorOptions {
  apply: boolean; userId: string; workspaceId: string; clientId: string; sourceDocumentId: string; profileFile: string;
}

export function parseAiStoriesOperatorArguments(args: string[]): AiStoriesOperatorOptions {
  const options: Record<string, string> = {};
  let apply = false;
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i]!;
    if (argument === '--apply') {
      assert.ok(!apply, 'Duplicate --apply.'); apply = true; continue;
    }
    const key = argument.slice(2); const value = args[++i];
    assert.ok(argument.startsWith('--') && ['user', 'workspace', 'client', 'source-document', 'profile-file'].includes(key)
      && value && !value.startsWith('--') && !options[key],
    'Expected --user, --workspace, --client, --source-document, --profile-file and optional --apply.');
    options[key] = value;
  }
  return { apply, userId: z.string().trim().min(1).max(200).parse(options.user), workspaceId: z.uuid().parse(options.workspace),
    clientId: z.uuid().parse(options.client), sourceDocumentId: z.uuid().parse(options['source-document']),
    profileFile: z.string().trim().min(1).parse(options['profile-file']) };
}

export function assertLocalAiStoriesEnvironment(env: { DATABASE_URL?: string; S3_ENDPOINT?: string }): void {
  const database = new URL(env.DATABASE_URL ?? ''); const store = new URL(env.S3_ENDPOINT ?? '');
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol)
    && ['localhost', '127.0.0.1', '[::1]', 'postgres', 'image-prodaction-postgres-1'].includes(database.hostname)
    && database.pathname === '/image_prodaction'
    && !['host', 'hostaddr', 'dbname'].some((key) => database.searchParams.has(key)),
  'Only the local Image Production database is allowed.');
  assert.ok(['http:', 'https:'].includes(store.protocol)
    && ['localhost', '127.0.0.1', '[::1]', 'minio', 'host.docker.internal', 'image-prodaction-minio-1'].includes(store.hostname)
    && !store.username && !store.password && !store.search && !store.hash
    && (store.pathname === '/' || store.pathname === ''), 'Only the local MinIO endpoint is allowed.');
}

export function assertCanonicalAiStoriesClient(workspaceId: string, client: {
  workspaceId: string; enabled: boolean; sourceApplication: string; externalWorkspaceRef: string;
}): void {
  assert.ok(client.enabled && client.workspaceId === workspaceId && client.sourceApplication === 'content-hub'
    && isCanonicalContentHubWorkspace(workspaceId, client), 'An enabled canonical Content Hub connection in this Workspace is required.');
}

export function assertExactAiRecipeSnapshot(actual: unknown, expected: unknown): void {
  const current = validateDocumentSnapshot(actual); const planned = validateDocumentSnapshot(expected);
  // Timestamps and viewport do not change the recipe. All graph content, including
  // the imported application style and media references, must match exactly.
  assert.ok(isDeepStrictEqual(JSON.parse(JSON.stringify(current.project)), JSON.parse(JSON.stringify(planned.project)))
    && isDeepStrictEqual(JSON.parse(JSON.stringify(current.assetsManifest)), JSON.parse(JSON.stringify(planned.assetsManifest))),
  'The named AI recipe was edited or uses different media/style. Refusing to overwrite or republish it.');
}

export async function runAiStoriesOperator(options: AiStoriesOperatorOptions) {
  assertLocalAiStoriesEnvironment({ DATABASE_URL: process.env.DATABASE_URL, S3_ENDPOINT: process.env.S3_ENDPOINT });
  const actor: RuntimeSessionActor = { kind: 'session', userId: options.userId, workspaceId: options.workspaceId };
  const profileBytes = await readFile(options.profileFile);
  assert.ok(profileBytes.byteLength <= 256_000, 'The application profile file is too large.');
  const profile = parseStoriesAuthoringProfileBundle(JSON.parse(profileBytes.toString('utf8')));
  const pool = getPostgresPool();
  let lock: PoolClient | undefined;
  const lockKey = `reverie-stories-ai:${actor.workspaceId}`;
  try {
    if (options.apply) {
      // Serialize this operator's invocations while keeping the normal permissioned
      // services responsible for their own transactions and optimistic revisions.
      lock = await pool.connect();
      const result = await lock.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)::bigint) as locked', [lockKey]);
      assert.ok(result.rows[0]?.locked, 'Another AI Stories publication is in progress. Retry after it finishes.');
    }
    await requireRuntimeAdmin(actor);
    // Use the normal owner/admin authority for this same actor; do not require
    // a different account or impose a stricter role than Runtime management.
    const client = await requireRuntimeClient(actor, options.clientId);
    assertCanonicalAiStoriesClient(actor.workspaceId, client);
    const source = await getDocument(actor.userId, options.sourceDocumentId);
    assert.ok(source.workspaceId === actor.workspaceId && source.status === 'active' && source.snapshot,
      'The source must be an active document in the selected Workspace.');
    const sourceSnapshot = validateDocumentSnapshot(source.snapshot);
    const image = await sourceAsset('image'); const video = await sourceAsset('video');
    const preset = createReverieStoriesAiPreset({ media: { image, video, poster: image }, authoringProfileBundle: profile });
    const snapshot = validateDocumentSnapshot(preset.snapshot);
    const compilation = compileStudioSection(snapshot.project, preset.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    const candidates = (await listDocuments(actor.userId)).filter((item) => item.workspaceId === actor.workspaceId && item.name === preset.name);
    assert.ok(candidates.length <= 1, 'Multiple named AI recipe documents exist. Resolve them explicitly in Studio.');
    let target = candidates[0];
    assert.ok(!target || target.id !== source.id, 'The source and AI recipe documents must be separate.');
    if (target) {
      assert.equal(target.status, 'active', 'The named AI recipe is in trash. Refusing to replace it.');
      if (target.snapshot) assertExactAiRecipeSnapshot(target.snapshot, snapshot);
      else assert.equal(target.revision, 0, 'The named AI recipe has an unexpected empty revision.');
    }
    const publications = target ? await listStudioPipelinePublications({ userId: actor.userId, documentId: target.id }) : [];
    assert.ok(publications.every((entry) => entry.sectionId === preset.sectionId) && publications.length <= 1,
      'The named AI recipe has different publications. Review them explicitly in Studio.');
    let publication = publications[0];
    if (publication) {
      assert.ok(target?.snapshot && publication.capabilityKey === preset.capabilityKey
        && publication.sectionTitle === preset.name && isDeepStrictEqual(publication.compiledPlan, compilation.compiledPlan),
      'The existing AI publication differs from this recipe. Refusing to change its active version.');
      // Also rejects a disabled endpoint or paused pipeline; never re-enables it.
      await getRuntimePipelineVersionDescriptor(actor, publication.endpointPublicId, publication.version);
    }
    const before = { documentId: target?.id ?? null, endpointPublicId: publication?.endpointPublicId ?? null };
    if (options.apply) {
      target ??= await createDocument({ userId: actor.userId, workspaceId: actor.workspaceId, name: preset.name });
      if (!target.snapshot) target = await saveDocumentSnapshot({ userId: actor.userId, documentId: target.id,
        expectedRevision: target.revision, snapshot });
      const current = await getDocument(actor.userId, target.id);
      assert.ok(current.status === 'active' && current.revision === target.revision, 'The AI recipe changed during preflight. Run dry-run again.');
      assertExactAiRecipeSnapshot(current.snapshot, snapshot);
      publication ??= await publishStudioPipeline({ userId: actor.userId, documentId: target.id, sectionId: preset.sectionId, snapshot: target.snapshot });
      const saved = await getDocument(actor.userId, target.id);
      assertExactAiRecipeSnapshot(saved.snapshot, snapshot);
      assert.ok(isDeepStrictEqual(publication.compiledPlan, compilation.compiledPlan), 'Published AI recipe differs from the reviewed plan.');
    }
    const descriptor = publication ? await getRuntimePipelineVersionDescriptor(actor, publication.endpointPublicId, publication.version) : null;
    return { dryRun: !options.apply, action: before.endpointPublicId ? 'reuse-exact-publication' : 'create-and-publish-ai-recipe',
      workspaceId: actor.workspaceId, clientId: client.id, sourceDocumentId: source.id, sourceDocumentRevision: source.revision,
      documentId: target?.id ?? null, documentRevision: target?.revision ?? null, documentName: preset.name,
      sectionId: preset.sectionId, capabilityKey: preset.capabilityKey, endpointPublicId: publication?.endpointPublicId ?? null,
      version: descriptor?.version ?? null, mediaAssetIds: { image: image.id, video: video.id, poster: image.id },
      styleProfile: { profileId: profile.styleProfile.profileId, revisionId: profile.styleProfile.revisionId },
      model: compilation.compiledPlan.definition.nodes.find((node) => node.handlerType === 'ai.structured.generate')?.config.model,
      paidCalls: 0, grantsChanged: false, deliveryBindingChanged: false,
      lengthRepair: 'Limits 100/160/600 are checked by Stories assembly; no automatic shortening.',
    };

    async function sourceAsset(kind: 'image' | 'video'): Promise<AssetRecord> {
      const candidates = sourceSnapshot.project.assets.filter((asset) => asset.kind === kind && asset.storage.type === 'remote');
      const ids = [...new Set(candidates.map((asset) => asset.storage.type === 'remote' ? asset.storage.assetId : ''))];
      assert.equal(ids.length, 1, `The source document must contain exactly one remote ${kind}.`);
      const asset = await getAssetMetadata(actor.userId, z.uuid().parse(ids[0]));
      assert.ok(asset.workspaceId === actor.workspaceId && asset.status === 'ready' && asset.mediaKind === kind
        && asset.width && asset.height && /^[a-f0-9]{64}$/.test(asset.checksumSha256), 'A source media file is unavailable in this Workspace.');
      assert.ok(kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp'].includes(asset.contentType)
        : asset.contentType === 'video/mp4' && asset.video?.codec === 'h264' && asset.video.browserPlayable,
      'Stories requires a supported image and browser-playable MP4 H.264 video.');
      return graphAsset(asset);
    }
  } finally {
    if (lock) {
      await lock.query('select pg_advisory_unlock(hashtext($1)::bigint)', [lockKey]).catch(() => undefined);
      lock.release();
    }
    await pool.end();
  }
}

function graphAsset(asset: AssetDto): AssetRecord {
  return { id: asset.id, kind: asset.mediaKind, name: asset.originalName, mimeType: asset.contentType,
    width: asset.width ?? undefined, height: asset.height ?? undefined, video: asset.video, createdAt: asset.createdAt,
    storage: { type: 'remote', assetId: asset.id } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  config({ path: '.env.local', quiet: true }); config({ path: '.env', quiet: true });
  try { console.log(JSON.stringify(await runAiStoriesOperator(parseAiStoriesOperatorArguments(process.argv.slice(2))))); }
  catch (error) {
    console.error(error instanceof Error ? error.message.slice(0, 800) : 'AI Stories recipe publication failed.');
    process.exitCode = 1;
  }
}
