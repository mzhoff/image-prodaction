import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { createUuidV7 } from '@/shared/lib/id';
import {
  executablePipeline,
  pipelineApiKey,
  pipelineConsumer,
  pipelineEndpoint,
  pipelineVersion,
} from '../adapters/postgres/pipeline-schema';

const TOKEN_MARKER = 'rvr_pipe_';
const LOOKUP_PREFIX_LENGTH = 12;

export class PipelineApiKeyAuthenticationError extends Error {
  constructor() {
    super('A valid pipeline API bearer token is required.');
    this.name = 'PipelineApiKeyAuthenticationError';
  }
}

export async function createPipelineApiKey(input: {
  consumerId: string;
  createdByUserId: string;
  label: string;
}) {
  const token = generatePipelineApiToken();
  const parsed = parsePipelineApiToken(token);
  if (!parsed) throw new Error('Pipeline API token generation failed.');

  const [consumer] = await getDb().select({
    endpointId: pipelineEndpoint.id,
    sourceApplication: pipelineConsumer.sourceApplication,
  }).from(pipelineConsumer)
    .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineConsumer.pipelineId))
    .innerJoin(pipelineEndpoint, eq(pipelineEndpoint.pipelineId, pipelineConsumer.pipelineId))
    .where(and(
      eq(pipelineConsumer.id, input.consumerId),
      eq(pipelineConsumer.enabled, true),
      eq(pipelineEndpoint.enabled, true),
      eq(executablePipeline.status, 'active'),
    ))
    .limit(1);
  if (!consumer) throw new Error('Active pipeline consumer was not found.');

  const [created] = await getDb().insert(pipelineApiKey).values({
    id: createUuidV7(),
    endpointId: consumer.endpointId,
    consumerId: input.consumerId,
    label: normalizeLabel(input.label),
    sourceApplication: consumer.sourceApplication,
    tokenPrefix: parsed.lookupPrefix,
    tokenHash: hashPipelineApiToken(token),
    createdByUserId: input.createdByUserId,
  }).returning({
    id: pipelineApiKey.id,
    createdAt: pipelineApiKey.createdAt,
  });
  if (!created) throw new Error('Pipeline API key could not be created.');

  return {
    id: created.id,
    createdAt: created.createdAt,
    token,
  };
}

export async function authenticatePipelineApiRequest(
  request: Request,
  expectedPublicId?: string,
) {
  const token = readBearerToken(request.headers.get('authorization'));
  const parsed = token ? parsePipelineApiToken(token) : null;
  if (!token || !parsed) throw new PipelineApiKeyAuthenticationError();

  const [record] = await getDb().select({
    apiKeyId: pipelineApiKey.id,
    consumerId: pipelineConsumer.id,
    sourceApplication: pipelineConsumer.sourceApplication,
    tokenHash: pipelineApiKey.tokenHash,
    endpointId: pipelineEndpoint.id,
    endpointPublicId: pipelineEndpoint.publicId,
    executionPolicy: pipelineConsumer.executionPolicy,
    pipelineId: executablePipeline.id,
    workspaceId: executablePipeline.workspaceId,
    originDocumentId: executablePipeline.originDocumentId,
    pinnedVersionId: pipelineVersion.id,
    pipelineVersion: pipelineVersion.version,
    compiledPlan: pipelineVersion.compiledPlan,
    publishedByUserId: pipelineVersion.publishedByUserId,
  }).from(pipelineApiKey)
    .innerJoin(pipelineConsumer, eq(pipelineConsumer.id, pipelineApiKey.consumerId))
    .innerJoin(executablePipeline, eq(executablePipeline.id, pipelineConsumer.pipelineId))
    .innerJoin(pipelineEndpoint, and(
      eq(pipelineEndpoint.id, pipelineApiKey.endpointId),
      eq(pipelineEndpoint.pipelineId, pipelineConsumer.pipelineId),
    ))
    .innerJoin(pipelineVersion, and(
      eq(pipelineVersion.id, pipelineConsumer.pinnedVersionId),
      eq(pipelineVersion.pipelineId, pipelineConsumer.pipelineId),
    ))
    .where(and(
      eq(pipelineApiKey.tokenPrefix, parsed.lookupPrefix),
      isNull(pipelineApiKey.revokedAt),
      eq(pipelineConsumer.enabled, true),
      eq(pipelineEndpoint.enabled, true),
      eq(executablePipeline.status, 'active'),
      expectedPublicId ? eq(pipelineEndpoint.publicId, expectedPublicId) : undefined,
    ))
    .limit(1);

  if (!record || !safeHashesEqual(record.tokenHash, hashPipelineApiToken(token))) {
    throw new PipelineApiKeyAuthenticationError();
  }

  await getDb().update(pipelineApiKey).set({
    lastUsedAt: new Date(),
  }).where(eq(pipelineApiKey.id, record.apiKeyId));

  return record;
}

export function generatePipelineApiToken() {
  const secret = randomBytes(32).toString('base64url');
  return `${TOKEN_MARKER}${secret.slice(0, LOOKUP_PREFIX_LENGTH)}.${secret}`;
}

export function hashPipelineApiToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function parsePipelineApiToken(token: string) {
  const match = /^rvr_pipe_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const lookupPrefix = match[1];
  const secret = match[2];
  if (!lookupPrefix || !secret || secret.slice(0, LOOKUP_PREFIX_LENGTH) !== lookupPrefix) {
    return null;
  }
  return { lookupPrefix };
}

function readBearerToken(value: string | null) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(value?.trim() ?? '');
  return match?.[1] ?? null;
}

function safeHashesEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first, 'hex');
  const secondBuffer = Buffer.from(second, 'hex');
  return firstBuffer.length === 32
    && secondBuffer.length === 32
    && timingSafeEqual(firstBuffer, secondBuffer);
}

function normalizeLabel(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) throw new Error('API key label is invalid.');
  return normalized;
}
