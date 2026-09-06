import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  executablePipeline,
  pipelineApiKey,
  pipelineEndpoint,
  pipelineVersion,
} from '@/modules/executable-pipelines/adapters/postgres/pipeline-schema';
import { createPipelineApiKey } from '@/modules/executable-pipelines/server/pipeline-api-key-service';
import { ensurePipelineConsumerForEndpoint } from '@/modules/executable-pipelines/server/pipeline-consumer-service';
import { getDb, getPostgresPool } from '@/shared/db/client';

config({ path: '.env.local' });
config({ path: '.env' });

const parsedArguments = parseArguments(process.argv.slice(2));
const [publicId, sourceApplication = 'external-client', ...labelParts] = parsedArguments.positionals;
if (!publicId || !parsedArguments.tokenFile) {
  console.error(
    'Usage: npm run pipeline:key:create -- <endpoint-public-id> [source-application] [label] --token-file <new-file>',
  );
  process.exitCode = 64;
} else {
  let createdKeyId: string | null = null;
  let tokenDelivered = false;
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
    const [pinnedVersion] = await getDb().select({
      checksum: pipelineVersion.checksum,
      inputSchemaChecksum: pipelineVersion.inputSchemaChecksum,
      outputSchemaChecksum: pipelineVersion.outputSchemaChecksum,
      sourceMetadata: pipelineVersion.sourceMetadata,
      version: pipelineVersion.version,
    }).from(pipelineVersion)
      .where(eq(pipelineVersion.id, consumer.pinnedVersionId))
      .limit(1);
    if (!pinnedVersion) throw new Error('Pinned pipeline version was not found.');
    const created = await createPipelineApiKey({
      consumerId: consumer.id,
      createdByUserId: endpoint.createdByUserId,
      label,
    });
    createdKeyId = created.id;
    const tokenFile = resolve(parsedArguments.tokenFile);
    await writeNewTokenFile(tokenFile, created.token);
    tokenDelivered = true;
    console.log(JSON.stringify({
      apiKeyId: created.id,
      consumerId: consumer.id,
      endpointPublicId: publicId,
      pinnedVersion: {
        capabilityKey: pinnedVersion.sourceMetadata?.capabilityKey ?? null,
        checksum: pinnedVersion.checksum,
        inputSchemaChecksum: pinnedVersion.inputSchemaChecksum,
        outputSchemaChecksum: pinnedVersion.outputSchemaChecksum,
        version: pinnedVersion.version,
      },
      tokenFile,
    }));
  } catch (error) {
    if (createdKeyId && !tokenDelivered) {
      await getDb().update(pipelineApiKey).set({
        revokedAt: new Date(),
      }).where(eq(pipelineApiKey.id, createdKeyId)).catch(() => undefined);
    }
    console.error(error instanceof Error ? error.message : 'Pipeline API key creation failed.');
    process.exitCode = 1;
  } finally {
    await getPostgresPool().end().catch(() => undefined);
  }
}

function parseArguments(argumentsList: string[]) {
  const positionals: string[] = [];
  let tokenFile: string | null = null;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== '--token-file') {
      if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
      positionals.push(argument);
      continue;
    }
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--') || tokenFile) {
      throw new Error('--token-file requires one file path.');
    }
    tokenFile = value;
    index += 1;
  }
  return { positionals, tokenFile };
}

async function writeNewTokenFile(filePath: string, token: string) {
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(`${token}\n`, { encoding: 'utf8' });
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(filePath).catch(() => undefined);
    throw error;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
