import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { and, eq, inArray } from 'drizzle-orm';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { CONTENT_HUB_CAPABILITIES, CONTENT_HUB_STARTER_KEY, getContentHubStarterPreset, type ContentHubPresetEntry } from '@/entities/production-graph/model/content-hub-starter-preset';
import { getDb } from '@/shared/db/client';
import { document } from '@/shared/db/schema/document';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { createUuidV7 } from '@/shared/lib/id';
import { compileStudioSection } from '../adapters/studio/studio-pipeline-compiler';
import { executablePipeline } from '../adapters/postgres/pipeline-schema';
import { runtimePipelineGrant } from '../adapters/postgres/runtime-schema';
import { CONTENT_HUB_PROJECT_NAME, CONTENT_HUB_PROJECT_SYSTEM_KEY } from '../core/content-hub-workspace';
import { requireRuntimeClient, type RuntimeSessionActor } from './runtime-client-auth';
import { listStudioPipelinePublications, publishStudioPipeline } from './pipeline-publication-service';
import { getRuntimePipelineVersionDescriptor } from './runtime-catalog-service';
import { createRuntimeGrant } from './runtime-grant-service';
import { listRuntimeGrants } from './runtime-grant-read-service';
import { isProductionPipelineHandlerSupported } from './pipeline-production-manifest';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';

export function contentHubPresetDocumentId(workspaceId: string, capability: string) {
  const hash = createHash('sha256').update(`${workspaceId}:${CONTENT_HUB_STARTER_KEY}:${capability}`).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

/** Retry-safe installation: existing editable copies and pinned versions are never overwritten. */
export async function installContentHubPreset(actor: RuntimeSessionActor, clientId: string, entries = getContentHubStarterPreset()) {
  await requireRuntimeClient(actor, clientId);
  // A dedicated short-lived connection owns the session lock. Publication and
  // grant services use their own transactions, so a pool connection cannot own it.
  const lock = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await lock.connect();
  const lockKey = `${actor.workspaceId}:${CONTENT_HUB_STARTER_KEY}`;
  let acquired = false;
  try {
    const result = await lock.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as locked', [lockKey]);
    acquired = result.rows[0]?.locked === true;
    if (!acquired) throw new RuntimeV2Error('invalid_request', 'Content Hub starter installation is already running. Retry after it completes.', 409);
    return await installLockedPreset(actor, clientId, entries);
  } finally {
    try { if (acquired) await lock.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]); }
    finally { await lock.end(); }
  }
}

async function installLockedPreset(actor: RuntimeSessionActor, clientId: string, entries: ContentHubPresetEntry[]) {
  const client = await requireRuntimeClient(actor, clientId);
  if (!client.enabled || client.sourceApplication !== 'content-hub' || client.externalWorkspaceRef !== actor.workspaceId) {
    throw new Error('Content Hub requires the same canonical Workspace in both products.');
  }
  const prepared = prepareEntries(entries);
  const grants = await listRuntimeGrants(actor, clientId);
  const projectFolder = await ensureContentHubProjectFolder(actor);
  const result = [];
  for (const entry of prepared) {
    const id = contentHubPresetDocumentId(actor.workspaceId, entry.capabilityKey);
    await getDb().insert(document).values({ id, workspaceId: actor.workspaceId, createdByUserId: actor.userId,
      name: entry.name, folderId: projectFolder.id, snapshot: entry.snapshot, revision: 1, schemaVersion: 1, hasEverHadContent: true,
    }).onConflictDoNothing();
    const [current] = await getDb().select().from(document).where(eq(document.id, id));
    if (!current || current.workspaceId !== actor.workspaceId || current.status !== 'active') {
      throw new Error('An existing preset document is unavailable; restore it explicitly instead of creating duplicates.');
    }
    const publications = await listStudioPipelinePublications({ userId: actor.userId, documentId: id });
    const publication = publications.find((item) => item.capabilityKey === entry.capabilityKey)
      ?? await publishStudioPipeline({ userId: actor.userId, documentId: id, sectionId: entry.sectionId, snapshot: current.snapshot });
    const existing = grants.filter((grant) => grant.capabilityKey === entry.capabilityKey);
    if (existing.length > 1 || (existing[0] && (!existing[0].enabled || existing[0].pipelinePublicId !== publication.endpointPublicId))) {
      throw new Error('Existing capability was customized or disabled; review it explicitly.');
    }
    const descriptor = await getRuntimePipelineVersionDescriptor(actor, publication.endpointPublicId, publication.version);
    const grant = existing[0] ?? await createRuntimeGrant(actor, clientId, {
      pipeline: publication.endpointPublicId, capabilityKey: entry.capabilityKey, version: descriptor.version.version,
      checksum: descriptor.version.checksum, inputSchemaChecksum: descriptor.version.inputSchemaChecksum,
      outputSchemaChecksum: descriptor.version.outputSchemaChecksum, updatePolicy: 'PINNED',
      executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'BEST_EFFORT', maximumProviderCostUsd: null },
    });
    result.push({ capabilityKey: entry.capabilityKey, documentId: id, pipelinePublicId: publication.endpointPublicId, grantId: grant.id });
  }
  const organizedDocumentIds = await organizeContentHubDocuments(actor, clientId, projectFolder.id);
  return { preset: CONTENT_HUB_STARTER_KEY, workspaceId: actor.workspaceId, projectFolderId: projectFolder.id,
    organizedDocumentIds, items: result, paidRunExecuted: false };
}

async function ensureContentHubProjectFolder(actor: RuntimeSessionActor) {
  const db = getDb();
  const [existing] = await db.select().from(studioFolder).where(and(
    eq(studioFolder.workspaceId, actor.workspaceId),
    eq(studioFolder.systemKey, CONTENT_HUB_PROJECT_SYSTEM_KEY),
  )).limit(1);
  if (existing) return existing;
  await db.insert(studioFolder).values({ id: createUuidV7(), workspaceId: actor.workspaceId,
    createdByUserId: actor.userId, name: CONTENT_HUB_PROJECT_NAME, systemKey: CONTENT_HUB_PROJECT_SYSTEM_KEY,
  }).onConflictDoNothing({ target: [studioFolder.workspaceId, studioFolder.systemKey] });
  const [created] = await db.select().from(studioFolder).where(and(
    eq(studioFolder.workspaceId, actor.workspaceId),
    eq(studioFolder.systemKey, CONTENT_HUB_PROJECT_SYSTEM_KEY),
  )).limit(1);
  if (!created) throw new Error('Content Hub project folder could not be created.');
  return created;
}

async function organizeContentHubDocuments(actor: RuntimeSessionActor, clientId: string, folderId: string) {
  const db = getDb();
  const rows = await db.select({ documentId: executablePipeline.originDocumentId })
    .from(runtimePipelineGrant)
    .innerJoin(executablePipeline, eq(executablePipeline.id, runtimePipelineGrant.pipelineId))
    .where(and(eq(runtimePipelineGrant.serviceClientId, clientId), eq(executablePipeline.workspaceId, actor.workspaceId)));
  const documentIds = [...new Set(rows.flatMap((row) => row.documentId ? [row.documentId] : []))];
  if (documentIds.length) await db.update(document).set({ folderId }).where(and(
    eq(document.workspaceId, actor.workspaceId),
    inArray(document.id, documentIds),
  ));
  return documentIds;
}

function prepareEntries(entries: ContentHubPresetEntry[]) {
  if (entries.length !== CONTENT_HUB_CAPABILITIES.length || new Set(entries.map((entry) => entry.capabilityKey)).size !== entries.length
    || CONTENT_HUB_CAPABILITIES.some((key) => !entries.some((entry) => entry.capabilityKey === key))) throw new Error('All five Content Hub capabilities are required.');
  return entries.map((entry) => {
    const snapshot = validateDocumentSnapshot(entry.snapshot);
    const compiled = compileStudioSection(snapshot.project, entry.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    if (compiled.sourceMetadata.capabilityKey !== entry.capabilityKey || snapshot.project.assets.length || snapshot.assetsManifest.length) throw new Error('Preset contract or asset isolation failed.');
    return { ...entry, snapshot };
  });
}
