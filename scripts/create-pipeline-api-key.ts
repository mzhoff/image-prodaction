import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import {
  executablePipeline,
  pipelineEndpoint,
  pipelineVersion,
} from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPipelineApiKey } from '@/modules/executable-pipelines/server/pipeline-api-key-service';
import { getDb, getPostgresPool } from '@/shared/db/client';

config({ path: '.env.local' });
config({ path: '.env' });

const [publicId, sourceApplication = 'external-client', ...labelParts] = process.argv.slice(2);
if (!publicId) {
  console.error('Usage: npm run pipeline:key:create -- <endpoint-public-id> [source-application] [label]');
  process.exitCode = 64;
} else {
  try {
    const [endpoint] = await getDb().select({
      endpointId: pipelineEndpoint.id,
      createdByUserId: pipelineVersion.publishedByUserId,
    }).from(pipelineEndpoint)
      .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineEndpoint.pipelineId))
      .innerJoin(pipelineVersion, eq(pipelineVersion.id, pipelineEndpoint.activeVersionId))
      .where(and(
        eq(pipelineEndpoint.publicId, publicId),
        eq(pipelineEndpoint.enabled, true),
        eq(executablePipeline.status, 'active'),
      ))
      .limit(1);
    if (!endpoint) throw new Error('Active pipeline endpoint was not found.');

    const created = await createPipelineApiKey({
      createdByUserId: endpoint.createdByUserId,
      endpointId: endpoint.endpointId,
      label: labelParts.join(' ').trim() || sourceApplication,
      sourceApplication,
    });
    console.log(JSON.stringify({
      apiKeyId: created.id,
      endpointPublicId: publicId,
      token: created.token,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pipeline API key creation failed.');
    process.exitCode = 1;
  } finally {
    await getPostgresPool().end().catch(() => undefined);
  }
}
