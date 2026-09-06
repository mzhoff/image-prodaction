import { config } from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';
import {
  pipelineApiKey,
  pipelineEndpoint,
} from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { isUuidV7 } from '@/shared/lib/id';

config({ path: '.env.local' });
config({ path: '.env' });

const [apiKeyId, endpointPublicId, ...unexpected] = process.argv.slice(2);
if (!apiKeyId || !endpointPublicId || unexpected.length > 0 || !isUuidV7(apiKeyId)) {
  console.error(
    'Usage: npm run pipeline:key:revoke -- <api-key-id> <expected-endpoint-public-id>',
  );
  process.exitCode = 64;
} else {
  try {
    const [target] = await getDb().select({
      apiKeyId: pipelineApiKey.id,
      endpointPublicId: pipelineEndpoint.publicId,
      revokedAt: pipelineApiKey.revokedAt,
    }).from(pipelineApiKey)
      .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.id, pipelineApiKey.endpointId))
      .where(and(
        eq(pipelineApiKey.id, apiKeyId),
        eq(pipelineEndpoint.publicId, endpointPublicId),
      ))
      .limit(1);
    if (!target) throw new Error('Pipeline API key was not found for the expected endpoint.');
    if (target.revokedAt) {
      console.log(JSON.stringify({
        apiKeyId: target.apiKeyId,
        endpointPublicId: target.endpointPublicId,
        revokedAt: target.revokedAt.toISOString(),
        alreadyRevoked: true,
      }));
    } else {
      const revokedAt = new Date();
      const [revoked] = await getDb().update(pipelineApiKey).set({
        revokedAt,
      }).where(and(
        eq(pipelineApiKey.id, apiKeyId),
        isNull(pipelineApiKey.revokedAt),
      )).returning({ id: pipelineApiKey.id });
      if (!revoked) throw new Error('Pipeline API key revocation raced with another change.');
      console.log(JSON.stringify({
        apiKeyId,
        endpointPublicId,
        revokedAt: revokedAt.toISOString(),
        alreadyRevoked: false,
      }));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pipeline API key revocation failed.');
    process.exitCode = 1;
  } finally {
    await getPostgresPool().end().catch(() => undefined);
  }
}
