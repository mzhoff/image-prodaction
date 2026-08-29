import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import {
  executablePipeline,
  pipelineEndpoint,
  pipelineVersion,
} from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPipelineApiKey } from '@/modules/executable-pipelines/server/pipeline-api-key-service';
import { ensurePipelineConsumerForEndpoint } from '@/modules/executable-pipelines/server/pipeline-consumer-service';
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

    const label = labelParts.join(' ').trim() || sourceApplication;
    const consumer = await ensurePipelineConsumerForEndpoint({
      endpointId: endpoint.endpointId,
      name: label,
      sourceApplication,
    });
    const created = await createPipelineApiKey({
      consumerId: consumer.id,
      createdByUserId: endpoint.createdByUserId,
      label,
    });
    console.log(JSON.stringify({
      apiKeyId: created.id,
      consumerId: consumer.id,
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
