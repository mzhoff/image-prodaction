import { and, eq, isNull } from 'drizzle-orm';
import {
  ProviderAdapterError,
  type CredentialCryptoAdapter,
  type ProviderAdapter,
  type ProviderCredentialSummary,
} from '@/modules/provider-connections';
import { createRuntimeOpenRouterAdapter } from './runtime-provider-adapter';
import {
  requireWorkspaceMembership,
  type WorkspaceRole,
} from '@/entities/workspace/server/workspace-service';
import { getDb } from '@/shared/db/client';
import {
  workspaceProviderConnection,
  workspaceProviderCredential,
} from '@/shared/db/schema/provider';
import { workspace } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import { getCredentialCrypto } from './credential-crypto-config';

const OPENROUTER_PROVIDER = 'openrouter';
const MANAGER_ROLES: WorkspaceRole[] = ['owner', 'admin'];

export type ProviderConnectionRecord = typeof workspaceProviderConnection.$inferSelect;
export type ProviderCredentialRecord = typeof workspaceProviderCredential.$inferSelect;

export interface ProviderConnectionDto {
  canManage: boolean;
  lastError: string | null;
  lastUsedAt: string | null;
  lastValidatedAt: string | null;
  maskedKey: string | null;
  provider: typeof OPENROUTER_PROVIDER;
  status: 'connected' | 'invalid' | 'disconnected';
}

export interface OpenRouterKeyUsageDto {
  isFreeTier: boolean | null;
  label: string | null;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  updatedAt: string;
  usage: number | null;
  usageDaily: number | null;
  usageMonthly: number | null;
  usageTotal: number | null;
  usageWeekly: number | null;
}

export interface ProviderConnectionServiceDependencies {
  adapter: ProviderAdapter;
  crypto: CredentialCryptoAdapter;
  createId(): string;
  now(): Date;
}

export class ProviderConnectionNotConfiguredError extends Error {
  constructor() {
    super('OpenRouter is not connected for this Workspace.');
    this.name = 'ProviderConnectionNotConfiguredError';
  }
}

export class ProviderCredentialValidationError extends Error {
  readonly providerError: ProviderAdapterError;

  constructor(error: ProviderAdapterError) {
    super('OpenRouter rejected this key. Check the key and its permissions.');
    this.name = 'ProviderCredentialValidationError';
    this.providerError = error;
  }
}

export async function listWorkspaceProviderConnections(
  userId: string,
  workspaceId: string,
) {
  const member = await requireWorkspaceMembership(userId, workspaceId);
  const [targetWorkspace, connection] = await Promise.all([
    getWorkspaceRecord(workspaceId),
    getConnectionWithActiveCredential(workspaceId, OPENROUTER_PROVIDER),
  ]);
  if (!targetWorkspace) throw new Error('Workspace does not exist.');
  return {
    workspace: {
      id: targetWorkspace.id,
      name: targetWorkspace.name,
      role: member.role,
    },
    providers: [
      toProviderConnectionDto(connection, MANAGER_ROLES.includes(member.role)),
    ],
  };
}

export async function connectOpenRouterProvider(
  input: {
    apiKey: string;
    userId: string;
    workspaceId: string;
  },
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(input.userId, input.workspaceId, MANAGER_ROLES);
  const apiKey = normalizeOpenRouterKey(input.apiKey);
  const summary = await validateCredential(dependencies.adapter, apiKey);
  const connectionId = await getOrCreateConnectionId(input.workspaceId, input.userId);
  const binding = createCredentialBinding(input.workspaceId, OPENROUTER_PROVIDER);
  const envelope = dependencies.crypto.encrypt(apiKey, { binding });
  const fingerprint = dependencies.crypto.fingerprint(apiKey);
  const maskedLabel = dependencies.crypto.maskedLabel(apiKey);
  const now = dependencies.now();

  await getDb().transaction(async (tx) => {
    const [connection] = await tx.insert(workspaceProviderConnection).values({
      id: connectionId,
      workspaceId: input.workspaceId,
      provider: OPENROUTER_PROVIDER,
      status: 'connected',
      providerMetadata: summaryToMetadata(summary),
      lastValidatedAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
      disconnectedAt: null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [
        workspaceProviderConnection.workspaceId,
        workspaceProviderConnection.provider,
      ],
      set: {
        status: 'connected',
        providerMetadata: summaryToMetadata(summary),
        lastValidatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        disconnectedAt: null,
        updatedByUserId: input.userId,
        updatedAt: now,
      },
    }).returning();
    if (!connection) throw new Error('Provider connection could not be saved.');

    await tx.update(workspaceProviderCredential).set({
      revokedAt: now,
    }).where(and(
      eq(workspaceProviderCredential.connectionId, connection.id),
      isNull(workspaceProviderCredential.revokedAt),
    ));
    await tx.insert(workspaceProviderCredential).values({
      id: dependencies.createId(),
      connectionId: connection.id,
      encryptedSecret: envelope.ciphertext,
      initializationVector: envelope.initializationVector,
      authenticationTag: envelope.authenticationTag,
      encryptionKeyVersion: envelope.keyVersion,
      fingerprint,
      maskedLabel,
      createdByUserId: input.userId,
    });
  });

  const saved = await getConnectionWithActiveCredential(
    input.workspaceId,
    OPENROUTER_PROVIDER,
  );
  return {
    provider: toProviderConnectionDto(saved, true),
    keyUsage: toKeyUsageDto(summary, now),
  };
}

export async function validateStoredOpenRouterProvider(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId, MANAGER_ROLES);
  const resolved = await resolveStoredOpenRouterCredential(
    workspaceId,
    dependencies,
  );
  const now = dependencies.now();
  try {
    const summary = await dependencies.adapter.validateCredential({
      credential: resolved.apiKey,
    });
    await updateConnectionValidation(
      resolved.connection.id,
      userId,
      now,
      summary,
    );
    const refreshed = await getConnectionWithActiveCredential(
      workspaceId,
      OPENROUTER_PROVIDER,
    );
    return {
      valid: true,
      provider: toProviderConnectionDto(refreshed, true),
      keyUsage: toKeyUsageDto(summary, now),
    };
  } catch (error) {
    const providerError = toProviderAdapterError(dependencies.adapter, error);
    if (shouldInvalidateProviderConnection(providerError)) {
      await markConnectionInvalid(resolved.connection.id, userId, now, providerError);
    } else {
      await recordConnectionValidationError(
        resolved.connection.id,
        userId,
        now,
        providerError,
      );
    }
    throw new ProviderCredentialValidationError(providerError);
  }
}

export function shouldInvalidateProviderConnection(error: ProviderAdapterError) {
  return error.descriptor.classification === 'permanent'
    && error.descriptor.code === 'invalid_credential';
}

export async function getOpenRouterProviderUsage(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId);
  const resolved = await resolveStoredOpenRouterCredential(workspaceId, dependencies);
  const summary = await dependencies.adapter.getCredentialSummary({
    credential: resolved.apiKey,
  });
  const now = dependencies.now();
  return {
    provider: OPENROUTER_PROVIDER,
    keyUsage: toKeyUsageDto(summary, now),
  };
}

export async function disconnectOpenRouterProvider(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId, MANAGER_ROLES);
  const connection = await getConnectionWithActiveCredential(
    workspaceId,
    OPENROUTER_PROVIDER,
  );
  if (!connection) return;
  const now = dependencies.now();
  await getDb().transaction(async (tx) => {
    await tx.update(workspaceProviderCredential).set({
      revokedAt: now,
    }).where(and(
      eq(workspaceProviderCredential.connectionId, connection.id),
      isNull(workspaceProviderCredential.revokedAt),
    ));
    await tx.update(workspaceProviderConnection).set({
      status: 'disconnected',
      providerMetadata: null,
      disconnectedAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedByUserId: userId,
      updatedAt: now,
    }).where(eq(workspaceProviderConnection.id, connection.id));
  });
}

/**
 * Internal-only secret resolver. Never return this value from an API response.
 */
export async function resolveOpenRouterCredential(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId);
  return resolveOpenRouterCredentialForWorkspace(workspaceId, dependencies);
}

export async function resolveOpenRouterCredentialForWorkspace(
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  return resolveStoredOpenRouterCredential(workspaceId, dependencies, true);
}

async function resolveStoredOpenRouterCredential(
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies,
  requireConnected = false,
) {
  const record = await getConnectionWithActiveCredential(
    workspaceId,
    OPENROUTER_PROVIDER,
  );
  if (
    !record
    || !record.encryptedSecret
    || (requireConnected && record.status !== 'connected')
  ) {
    throw new ProviderConnectionNotConfiguredError();
  }
  const envelope = {
    algorithm: 'aes-256-gcm' as const,
    version: 1 as const,
    authenticationTag: record.authenticationTag!,
    ciphertext: record.encryptedSecret,
    initializationVector: record.initializationVector!,
    keyVersion: record.encryptionKeyVersion!,
  };
  const apiKey = dependencies.crypto.decrypt(envelope, {
    binding: createCredentialBinding(workspaceId, OPENROUTER_PROVIDER),
  });
  return {
    apiKey,
    connection: record,
  };
}

export async function markOpenRouterProviderUsed(
  connectionId: string,
  usedAt = new Date(),
) {
  await getDb().update(workspaceProviderConnection).set({
    lastUsedAt: usedAt,
    updatedAt: usedAt,
  }).where(eq(workspaceProviderConnection.id, connectionId));
}

function createDefaultDependencies(): ProviderConnectionServiceDependencies {
  return {
    adapter: createRuntimeOpenRouterAdapter(),
    crypto: getCredentialCrypto(),
    createId: createUuidV7,
    now: () => new Date(),
  };
}

async function getConnectionWithActiveCredential(
  workspaceId: string,
  provider: string,
) {
  const [record] = await getDb().select({
    id: workspaceProviderConnection.id,
    workspaceId: workspaceProviderConnection.workspaceId,
    provider: workspaceProviderConnection.provider,
    status: workspaceProviderConnection.status,
    providerMetadata: workspaceProviderConnection.providerMetadata,
    lastValidatedAt: workspaceProviderConnection.lastValidatedAt,
    lastUsedAt: workspaceProviderConnection.lastUsedAt,
    lastErrorCode: workspaceProviderConnection.lastErrorCode,
    lastErrorMessage: workspaceProviderConnection.lastErrorMessage,
    disconnectedAt: workspaceProviderConnection.disconnectedAt,
    createdByUserId: workspaceProviderConnection.createdByUserId,
    updatedByUserId: workspaceProviderConnection.updatedByUserId,
    createdAt: workspaceProviderConnection.createdAt,
    updatedAt: workspaceProviderConnection.updatedAt,
    encryptedSecret: workspaceProviderCredential.encryptedSecret,
    initializationVector: workspaceProviderCredential.initializationVector,
    authenticationTag: workspaceProviderCredential.authenticationTag,
    encryptionKeyVersion: workspaceProviderCredential.encryptionKeyVersion,
    maskedLabel: workspaceProviderCredential.maskedLabel,
  }).from(workspaceProviderConnection)
    .leftJoin(workspaceProviderCredential, and(
      eq(workspaceProviderCredential.connectionId, workspaceProviderConnection.id),
      isNull(workspaceProviderCredential.revokedAt),
    ))
    .where(and(
      eq(workspaceProviderConnection.workspaceId, workspaceId),
      eq(workspaceProviderConnection.provider, provider),
    ))
    .limit(1);
  return record;
}

async function getWorkspaceRecord(workspaceId: string) {
  const [record] = await getDb().select({
    id: workspace.id,
    name: workspace.name,
  }).from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
  return record;
}

async function getOrCreateConnectionId(workspaceId: string, userId: string) {
  const existing = await getConnectionWithActiveCredential(
    workspaceId,
    OPENROUTER_PROVIDER,
  );
  if (existing) return existing.id;
  const id = createUuidV7();
  const [created] = await getDb().insert(workspaceProviderConnection).values({
    id,
    workspaceId,
    provider: OPENROUTER_PROVIDER,
    status: 'disconnected',
    createdByUserId: userId,
    updatedByUserId: userId,
  }).onConflictDoNothing({
    target: [
      workspaceProviderConnection.workspaceId,
      workspaceProviderConnection.provider,
    ],
  }).returning({ id: workspaceProviderConnection.id });
  if (created) return created.id;
  const raced = await getConnectionWithActiveCredential(workspaceId, OPENROUTER_PROVIDER);
  if (!raced) throw new Error('Provider connection could not be initialized.');
  return raced.id;
}

async function updateConnectionValidation(
  connectionId: string,
  userId: string,
  validatedAt: Date,
  summary: ProviderCredentialSummary,
) {
  await getDb().update(workspaceProviderConnection).set({
    status: 'connected',
    providerMetadata: summaryToMetadata(summary),
    lastValidatedAt: validatedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedByUserId: userId,
    updatedAt: validatedAt,
  }).where(eq(workspaceProviderConnection.id, connectionId));
}

async function markConnectionInvalid(
  connectionId: string,
  userId: string,
  now: Date,
  error: ProviderAdapterError,
) {
  await getDb().update(workspaceProviderConnection).set({
    status: 'invalid',
    lastErrorCode: error.descriptor.code,
    lastErrorMessage: error.descriptor.message.slice(0, 1_000),
    updatedByUserId: userId,
    updatedAt: now,
  }).where(eq(workspaceProviderConnection.id, connectionId));
}

async function recordConnectionValidationError(
  connectionId: string,
  userId: string,
  now: Date,
  error: ProviderAdapterError,
) {
  await getDb().update(workspaceProviderConnection).set({
    lastErrorCode: error.descriptor.code,
    lastErrorMessage: error.descriptor.message.slice(0, 1_000),
    updatedByUserId: userId,
    updatedAt: now,
  }).where(eq(workspaceProviderConnection.id, connectionId));
}

function toProviderConnectionDto(
  record: Awaited<ReturnType<typeof getConnectionWithActiveCredential>>,
  canManage: boolean,
): ProviderConnectionDto {
  return {
    provider: OPENROUTER_PROVIDER,
    status: record?.status ?? 'disconnected',
    canManage,
    maskedKey: record?.maskedLabel ?? null,
    lastValidatedAt: record?.lastValidatedAt?.toISOString() ?? null,
    lastUsedAt: record?.lastUsedAt?.toISOString() ?? null,
    lastError: record?.lastErrorMessage ?? null,
  };
}

function toKeyUsageDto(
  summary: ProviderCredentialSummary,
  updatedAt: Date,
): OpenRouterKeyUsageDto {
  return {
    label: summary.label,
    isFreeTier: summary.isFreeTier,
    limit: decimalToNumber(summary.limitUsd),
    limitRemaining: decimalToNumber(summary.limitRemainingUsd),
    limitReset: summary.limitReset,
    usage: decimalToNumber(summary.usageTotalUsd),
    usageDaily: decimalToNumber(summary.usageDailyUsd),
    usageWeekly: decimalToNumber(summary.usageWeeklyUsd),
    usageMonthly: decimalToNumber(summary.usageMonthlyUsd),
    usageTotal: decimalToNumber(summary.usageTotalUsd),
    updatedAt: updatedAt.toISOString(),
  };
}

function summaryToMetadata(summary: ProviderCredentialSummary) {
  return {
    label: summary.label,
    isFreeTier: summary.isFreeTier,
    limitUsd: summary.limitUsd,
    limitRemainingUsd: summary.limitRemainingUsd,
    limitReset: summary.limitReset,
    usageDailyUsd: summary.usageDailyUsd,
    usageWeeklyUsd: summary.usageWeeklyUsd,
    usageMonthlyUsd: summary.usageMonthlyUsd,
    usageTotalUsd: summary.usageTotalUsd,
  };
}

async function validateCredential(adapter: ProviderAdapter, apiKey: string) {
  try {
    return await adapter.validateCredential({ credential: apiKey });
  } catch (error) {
    throw new ProviderCredentialValidationError(toProviderAdapterError(adapter, error));
  }
}

function toProviderAdapterError(adapter: ProviderAdapter, error: unknown) {
  return error instanceof ProviderAdapterError
    ? error
    : new ProviderAdapterError(adapter.classifyError(error));
}

function normalizeOpenRouterKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 512 || /\s/.test(normalized)) {
    throw new ProviderCredentialValidationError(new ProviderAdapterError({
      classification: 'permanent',
      code: 'invalid_credential',
      httpStatus: null,
      message: 'OpenRouter key format is invalid.',
      providerOperationId: null,
      retryAfterMs: null,
    }));
  }
  return normalized;
}

function createCredentialBinding(workspaceId: string, provider: string) {
  return `workspace:${workspaceId}:provider:${provider}`;
}

function decimalToNumber(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
