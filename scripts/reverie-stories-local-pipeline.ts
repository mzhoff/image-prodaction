/** Operator-only local fixture: real persisted image/video, no paid provider calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';
import sharp from 'sharp';
import { z } from 'zod';
import type { StoryDocumentDraftV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import { createDocument, listDocuments, saveDocumentSnapshot } from '@/entities/document/server/document-service';
import { uploadImageAsset, uploadVideoAsset, type AssetDto } from '@/entities/asset/server/asset-service';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { PROJECT_SCHEMA_VERSION, createEmptyProjectUiState, type ProjectExport } from '@/entities/production-graph/model/project-schema';
import type { AssetRecord, ProductionNode } from '@/entities/production-graph/model/types';
import { requireRuntimeAdmin, requireRuntimeClient, type RuntimeSessionActor } from '@/modules/executable-pipelines/server/runtime-client-auth';
import { listRuntimeGrants } from '@/modules/executable-pipelines/server/runtime-grant-read-service';
import { createRuntimeGrant, repinRuntimeGrant } from '@/modules/executable-pipelines/server/runtime-grant-service';
import { getRuntimePipelineVersionDescriptor } from '@/modules/executable-pipelines/server/runtime-catalog-service';
import { listStudioPipelinePublications, publishStudioPipeline } from '@/modules/executable-pipelines/server/pipeline-publication-service';
import { getPostgresPool } from '@/shared/db/client';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
const name = 'REVERIE Stories · Локальная проверка ТОКБЕРИ';
const sectionId = 'reverie-stories-local-check';
const capabilityKey = 'content.generate-stories';

try {
  const args = process.argv.slice(2); const apply = args.includes('--apply');
  const repair = args.includes('--repair-initial-fixture');
  const values = args.filter((item) => !['--apply', '--repair-initial-fixture'].includes(item)); const options: Record<string, string> = {};
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]?.replace(/^--/, ''); const value = values[i + 1];
    assert.ok(['user', 'workspace', 'client'].includes(key) && value && !options[key], 'Expected --user, --workspace, --client and optional --apply.');
    options[key] = value;
  }
  const actor: RuntimeSessionActor = { kind: 'session', userId: z.string().min(1).parse(options.user), workspaceId: z.uuid().parse(options.workspace) };
  const clientId = z.uuid().parse(options.client);
  const database = new URL(process.env.DATABASE_URL!); const store = new URL(process.env.S3_ENDPOINT!);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(database.hostname), 'Local database only.');
  assert.ok(['localhost', '127.0.0.1', 'minio', 'host.docker.internal'].includes(store.hostname), 'Local storage only.');
  await requireRuntimeAdmin(actor);
  const client = await requireRuntimeClient(actor, clientId);
  assert.ok(client.enabled && client.sourceApplication === 'content-hub', 'An enabled Content Hub connection is required.');
  const candidates = (await listDocuments(actor.userId)).filter((item) => item.workspaceId === actor.workspaceId && item.name === name && item.status !== 'trash');
  assert.ok(candidates.length <= 1, 'Multiple fixture documents; resolve explicitly in Studio.');
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, workspaceId: actor.workspaceId, clientId, consumerWorkspaceId: client.externalWorkspaceRef, existingDocumentId: candidates[0]?.id ?? null, capabilityKey, paidCalls: 0 }));
  } else {
    let document = candidates[0] ?? await createDocument({ userId: actor.userId, workspaceId: actor.workspaceId, name });
    if (!document.snapshot || repair) {
      // Only the known first local fixture can be upgraded. Never overwrite
      // author edits or a publication from another task.
      if (!repair) assert.equal(document.revision, 0, 'Refusing to replace an edited fixture.');
      if (repair) {
        assert.equal(document.id, '01a09311-ddde-7db5-8304-f27f2764cf6c');
        assert.ok(document.snapshot?.project.assets.every((item) => item.storage.type === 'remote'
          && [oldFixtureId(fixtureAssetId(actor.workspaceId, 'image')), oldFixtureId(fixtureAssetId(actor.workspaceId, 'video'))].includes(item.id)), 'Fixture assets have changed.');
      }
      const folder = await mkdtemp(join(tmpdir(), 'reverie-stories-local-media-'));
      try {
        const videoPath = join(folder, 'motion.mp4');
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=24', '-t', '3', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
        const bytes = await sharp({ create: { width: 540, height: 960, channels: 3, background: '#273c75' } }).webp().toBuffer();
        const common = { documentId: document.id, userId: actor.userId, workspaceId: actor.workspaceId, maxBytes: 5_000_000, origin: 'uploaded' as const, libraryVisible: true, metadata: { localFixture: sectionId } };
        const image = await uploadImageAsset({ ...common, bytes, claimedContentType: 'image/webp', originalName: 'Stories local — image.webp', requestedAssetId: fixtureAssetId(actor.workspaceId, 'image') });
        const video = await uploadVideoAsset({ ...common, bytes: await readFile(videoPath), claimedContentType: 'video/mp4', originalName: 'Stories local — motion.mp4', requestedAssetId: fixtureAssetId(actor.workspaceId, 'video'), maxDurationSeconds: 5 });
        const snapshot = repair ? replaceFixtureIds(document.snapshot!, [image, video]) : fixtureSnapshot(image, video);
        document = await saveDocumentSnapshot({ userId: actor.userId, documentId: document.id, expectedRevision: document.revision, snapshot });
      } finally { await rm(folder, { recursive: true, force: true }); }
    }
    const published = await listStudioPipelinePublications({ documentId: document.id, userId: actor.userId });
    const publication = (repair ? undefined : published.find((item) => item.sectionId === sectionId))
      ?? await publishStudioPipeline({ userId: actor.userId, documentId: document.id, sectionId, snapshot: document.snapshot });
    const descriptor = await getRuntimePipelineVersionDescriptor(actor, publication.endpointPublicId, publication.version);
    let existingGrant = (await listRuntimeGrants(actor, clientId)).find((item) => item.enabled && item.pipelinePublicId === publication.endpointPublicId);
    if (repair && existingGrant) {
      assert.equal(existingGrant.pinned.version, 1, 'Refusing to repin a modified fixture grant.');
      existingGrant = await repinRuntimeGrant(actor, existingGrant.id, { expectedGrantRevision: existingGrant.revision,
        version: descriptor.version.version, checksum: descriptor.version.checksum,
        inputSchemaChecksum: descriptor.version.inputSchemaChecksum, outputSchemaChecksum: descriptor.version.outputSchemaChecksum });
    }
    if (existingGrant) assert.equal(existingGrant.pinned.checksum, descriptor.version.checksum, 'Existing fixture grant was changed; refusing to repin.');
    const grant = existingGrant ?? await createRuntimeGrant(actor, clientId, {
      pipeline: publication.endpointPublicId, capabilityKey, version: descriptor.version.version, checksum: descriptor.version.checksum,
      inputSchemaChecksum: descriptor.version.inputSchemaChecksum, outputSchemaChecksum: descriptor.version.outputSchemaChecksum,
      updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'STRICT', maximumProviderCostUsd: '0.00000000' },
    });
    console.log(JSON.stringify({ documentId: document.id, documentRevision: document.revision, endpointPublicId: publication.endpointPublicId, version: publication.version, capabilityKey, grantId: grant.id, grantRevision: grant.revision, paidCalls: 0 }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message.slice(0, 800) : 'Local Stories provisioning failed.');
  process.exitCode = 1;
} finally { await getPostgresPool().end().catch(() => undefined); }

function fixtureAssetId(workspaceId: string, kind: string) {
  const hash = createHash('sha256').update(`${workspaceId}:${sectionId}:v1:${kind}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-7${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function replaceFixtureIds(snapshot: ProjectExport, assets: AssetDto[]): ProjectExport {
  // Preserve all viewport/content edits made by the browser after initial load.
  const replacements = new Map(assets.map((asset) => [oldFixtureId(asset.id), asset.id]));
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') return replacements.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replace(child)]));
    return value;
  };
  return replace(snapshot) as ProjectExport;
}
function oldFixtureId(id: string) { return `${id.slice(0, 14)}4${id.slice(15)}`; }
function fixtureSnapshot(image: AssetDto, video: AssetDto): ProjectExport {
  assert.ok(image.width && image.height && video.width && video.height && video.video);
  const imageAsset = { assetId: image.id, kind: 'image' as const, source: { kind: 'productionArtifact' as const, artifactId: image.id, producerKey: 'image-production', checksum: `sha256:${image.checksumSha256}` }, mimeType: 'image/webp' as const, width: image.width, height: image.height, byteSize: image.byteSize, altText: 'ТЕСТОВЫЙ СИНИЙ ФОН' };
  const videoDraft: StoryDocumentDraftV1 = { schemaVersion: 'stories.document-draft@1.0.0', id: 'tokberi-video-check', revisionId: 'tokberi-video-check-r1', locale: 'ru-RU', styleProfile: { profileId: 'reverie-default', revisionId: 'reverie-default-r1' }, preview: { title: 'ВИДЕО И ОПРОС', accessibilityLabel: 'ВИДЕО И ОПРОС', cover: imageAsset }, slides: [{ id: 'video-check', accessibilityLabel: 'ВИДЕО И ОПРОС', layoutIntent: 'fullBleedOverlay', advance: { mode: 'mediaEnd' }, background: { fit: 'cover', playback: { startMuted: true, loop: false, failure: 'posterManual' }, asset: { assetId: video.id, kind: 'video', source: { kind: 'productionArtifact', artifactId: video.id, producerKey: 'image-production', checksum: `sha256:${video.checksumSha256}` }, mimeType: 'video/mp4', width: video.width, height: video.height, byteSize: video.byteSize, durationMs: Math.round(video.video.durationSeconds * 1000), altText: 'ДВИЖУЩИЙСЯ ТЕСТОВЫЙ ФОН', poster: imageAsset } }, layers: [
    { id: 'video-title', kind: 'title', text: 'ВИДЕО РАБОТАЕТ?', contrastIntent: 'lightContent', layout: { region: 'top', order: 0, alignment: 'start' } },
    { id: 'video-poll', kind: 'poll', layout: { region: 'bottom', order: 1, alignment: 'start' }, definition: { schemaVersion: 'polls.definition@1.0.0', pollId: 'tokberi-local-video-poll', revisionId: 'r1', question: 'ВИДНО ДВИЖЕНИЕ?', selectionMode: 'single', options: [{ id: 'yes', label: 'ДА' }, { id: 'no', label: 'НЕТ' }] } },
    { id: 'video-action', kind: 'actions', layout: { region: 'bottom', order: 2, alignment: 'start' }, arrangement: 'vertical', actions: [{ businessActionId: 'support.open', label: 'ПОДДЕРЖКА', emphasis: 'secondary' }] },
  ] }] };
  const input: ProductionNode = { ...createDefaultNode('pipelineInput', { x: 100, y: 100 }), id: 'local-input', data: { title: 'ТЕКСТ ДЛЯ ПРОВЕРКИ', fields: [{ id: 'brief', key: 'brief', kind: 'text', required: true }] } };
  const media: ProductionNode = { ...createDefaultNode('importImage', { x: 100, y: 800 }), id: 'local-image', data: { title: 'ТЕСТОВОЕ ИЗОБРАЖЕНИЕ', assetId: image.id, mediaKind: 'image' } };
  const copy: ProductionNode = { ...createDefaultNode('textPrompt', { x: 100, y: 400 }), id: 'local-test-copy', data: { title: 'КОНТРОЛЬНЫЙ ТЕКСТ', text: 'ПРОВЕРЯЕМ ДОСТАВКУ ИЗОБРАЖЕНИЯ, ВИДЕО И ОПРОСА ИЗ CONTENT HUB.' } };
  const first: ProductionNode = { ...createDefaultNode('reverieStories', { x: 700, y: 100 }), id: 'local-slide', data: { title: 'ИЗОБРАЖЕНИЕ', storyMode: 'slide', storyTitle: 'STORIES В ТОКБЕРИ', subtitle: 'ЛОКАЛЬНАЯ ПРОВЕРКА', text: '', locale: 'ru-RU', styleProfileId: 'reverie-default', styleRevisionId: 'reverie-default-r1' } };
  const second: ProductionNode = { ...createDefaultNode('reverieStories', { x: 700, y: 1000 }), id: 'local-video', data: { ...first.data, title: 'ВИДЕО И ОПРОС', document: videoDraft } };
  const sequence: ProductionNode = { ...createDefaultNode('reverieStories', { x: 1400, y: 100 }), id: 'local-sequence', data: { ...first.data, title: 'ГОТОВАЯ ИСТОРИЯ', storyMode: 'sequence' } };
  const graphAsset = (value: AssetDto): AssetRecord => ({ id: value.id, kind: value.mediaKind, name: value.originalName, mimeType: value.contentType, width: value.width ?? undefined, height: value.height ?? undefined, createdAt: value.createdAt, storage: { type: 'remote', assetId: value.id } });
  return { kind: 'projectSnapshot', schemaVersion: PROJECT_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    project: { version: PROJECT_SCHEMA_VERSION, nodes: [input, copy, media, first, second, sequence], sections: [{ id: sectionId, title: name, capabilityKey, position: { x: 0, y: 0 }, size: { width: 2000, height: 2000 }, color: '#d9d9d9', locked: false }], edges: [
      // This named fixture tests delivery with stable copy; actual AI generation
      // is a separate recipe/quality benchmark with its own provider budget.
      { id: 'brief-copy', sourceNodeId: copy.id, sourcePortId: 'text', targetNodeId: first.id, targetPortId: 'text' },
      { id: 'image-background', sourceNodeId: media.id, sourcePortId: 'image', targetNodeId: first.id, targetPortId: 'image' },
      { id: 'first-sequence', sourceNodeId: first.id, sourcePortId: 'story', targetNodeId: sequence.id, targetPortId: 'document' },
      { id: 'video-sequence', sourceNodeId: second.id, sourcePortId: 'story', targetNodeId: sequence.id, targetPortId: 'document-2' },
    ], assets: [graphAsset(image), graphAsset(video)], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [] },
    uiState: { ...createEmptyProjectUiState(), viewport: { x: 30, y: 30, zoom: 0.6 } }, assetsManifest: [] };
}
