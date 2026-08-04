import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { getDocument } from '@/entities/document/server/document-service';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import {
  executablePipeline,
  pipelineEndpoint,
  pipelineVersion,
} from '../adapters/postgres/pipeline-schema';
import { compileStudioSection } from '../adapters/studio/studio-pipeline-compiler';
import type { CompiledPipelinePlan } from '../contracts/pipeline-contracts';
import type {
  StudioPipelinePublication,
  StudioPipelineSourceMetadata,
} from '../contracts/pipeline-publication-contracts';

export async function listStudioPipelinePublications(input: {
  documentId: string;
  userId: string;
}) {
  await getDocument(input.userId, input.documentId);
  const rows = await getDb().select({
    pipelineId: executablePipeline.id,
    sectionId: executablePipeline.originSectionId,
    sectionTitle: executablePipeline.name,
    compiledPlan: pipelineVersion.compiledPlan,
    sourceMetadata: pipelineVersion.sourceMetadata,
    version: pipelineVersion.version,
    publishedAt: pipelineVersion.publishedAt,
    endpointPublicId: pipelineEndpoint.publicId,
  }).from(executablePipeline)
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, executablePipeline.id))
    .innerJoin(pipelineVersion, eq(pipelineVersion.id, pipelineEndpoint.activeVersionId))
    .where(eq(executablePipeline.originDocumentId, input.documentId))
    .orderBy(desc(pipelineVersion.publishedAt));

  return rows.flatMap((row) => {
    if (!row.sectionId || !row.sourceMetadata) return [];
    return [toPublicationDto({ ...row, sectionId: row.sectionId, sourceMetadata: row.sourceMetadata })];
  });
}

export async function publishStudioPipeline(input: {
  documentId: string;
  sectionId: string;
  snapshot: unknown;
  userId: string;
}) {
  const document = await getDocument(input.userId, input.documentId);
  const snapshot = validateDocumentSnapshot(input.snapshot);
  const compilation = compileStudioSection(snapshot.project, input.sectionId);
  const checksum = checksumPublication(compilation);
  const publishedAt = new Date();

  return getDb().transaction(async (tx) => {
    const [existingPipeline] = await tx.select({
      id: executablePipeline.id,
    }).from(executablePipeline).where(and(
      eq(executablePipeline.originDocumentId, input.documentId),
      eq(executablePipeline.originSectionId, input.sectionId),
    )).limit(1);

    const pipelineId = existingPipeline?.id ?? createUuidV7();
    if (existingPipeline) {
      await tx.update(executablePipeline).set({
        name: compilation.sourceMetadata.sectionTitle,
        status: 'active',
        updatedAt: publishedAt,
      }).where(eq(executablePipeline.id, pipelineId));
    } else {
      await tx.insert(executablePipeline).values({
        id: pipelineId,
        workspaceId: document.workspaceId,
        originDocumentId: input.documentId,
        originSectionId: input.sectionId,
        createdByUserId: input.userId,
        name: compilation.sourceMetadata.sectionTitle,
        status: 'active',
      });
    }

    const [latestVersion] = await tx.select({
      id: pipelineVersion.id,
      version: pipelineVersion.version,
      checksum: pipelineVersion.checksum,
      compiledPlan: pipelineVersion.compiledPlan,
      sourceMetadata: pipelineVersion.sourceMetadata,
      publishedAt: pipelineVersion.publishedAt,
    }).from(pipelineVersion)
      .where(eq(pipelineVersion.pipelineId, pipelineId))
      .orderBy(desc(pipelineVersion.version))
      .limit(1);

    let activeVersion = latestVersion;
    if (!latestVersion || latestVersion.checksum !== checksum) {
      const versionId = createUuidV7();
      activeVersion = {
        id: versionId,
        version: (latestVersion?.version ?? 0) + 1,
        checksum,
        compiledPlan: compilation.compiledPlan,
        sourceMetadata: compilation.sourceMetadata,
        publishedAt,
      };
      await tx.insert(pipelineVersion).values({
        id: versionId,
        pipelineId,
        version: activeVersion.version,
        compiledPlan: compilation.compiledPlan,
        sourceMetadata: compilation.sourceMetadata,
        checksum,
        publishedByUserId: input.userId,
        publishedAt,
      });
    }

    const [existingEndpoint] = await tx.select({
      id: pipelineEndpoint.id,
      publicId: pipelineEndpoint.publicId,
    }).from(pipelineEndpoint).where(eq(pipelineEndpoint.pipelineId, pipelineId)).limit(1);
    const endpointPublicId = existingEndpoint?.publicId ?? createPipelinePublicId();

    if (existingEndpoint) {
      await tx.update(pipelineEndpoint).set({
        activeVersionId: activeVersion.id,
        enabled: true,
        updatedAt: publishedAt,
      }).where(eq(pipelineEndpoint.id, existingEndpoint.id));
    } else {
      await tx.insert(pipelineEndpoint).values({
        id: createUuidV7(),
        pipelineId,
        activeVersionId: activeVersion.id,
        publicId: endpointPublicId,
        enabled: true,
        authPolicy: { mode: 'workspace-member' },
        executionPolicy: { maxAttempts: 3, mode: 'queued' },
      });
    }

    const sourceMetadata = activeVersion.sourceMetadata ?? compilation.sourceMetadata;
    return toPublicationDto({
      pipelineId,
      endpointPublicId,
      sectionId: input.sectionId,
      sectionTitle: sourceMetadata.sectionTitle,
      compiledPlan: activeVersion.compiledPlan,
      sourceMetadata,
      version: activeVersion.version,
      publishedAt: activeVersion.publishedAt,
    });
  });
}

function toPublicationDto(input: {
  compiledPlan: CompiledPipelinePlan;
  endpointPublicId: string;
  pipelineId: string;
  publishedAt: Date;
  sectionId: string;
  sectionTitle: string;
  sourceMetadata: StudioPipelineSourceMetadata;
  version: number;
}): StudioPipelinePublication {
  return {
    pipelineId: input.pipelineId,
    endpointPublicId: input.endpointPublicId,
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    version: input.version,
    publishedAt: input.publishedAt.toISOString(),
    compiledPlan: input.compiledPlan,
    inputs: input.sourceMetadata.inputs,
    outputs: input.sourceMetadata.outputs,
  };
}

function checksumPublication(publication: {
  compiledPlan: CompiledPipelinePlan;
  sourceMetadata: StudioPipelineSourceMetadata;
}) {
  return createHash('sha256').update(stableStringify(publication)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createPipelinePublicId() {
  return `pln_${createUuidV7().replaceAll('-', '')}`;
}
