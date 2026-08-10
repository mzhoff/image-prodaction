import { and, eq, isNull } from 'drizzle-orm';
import type { ProviderAdapterError } from '../../core/provider-errors';
import type { ProviderCredentialSummary } from '../../contracts/provider-contracts';
import { getDb } from '@/shared/db/client';
import {
  workspaceProviderConnection,
  workspaceProviderCredential,
} from '@/shared/db/schema/provider';
import { workspace } from '@/shared/db/schema/workspace';

export async function findProviderConnection(workspaceId: string, provider: string) {
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

export type ProviderConnectionWithCredential = Awaited<ReturnType<typeof findProviderConnection>>;

export async function findProviderWorkspace(workspaceId: string) {
  const [record] = await getDb().select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  return record;
}

export async function getOrCreateProviderConnectionId(input: {
  createId(): string;
  provider: string;
  userId: string;
  workspaceId: string;
}) {
  const existing = await findProviderConnection(input.workspaceId, input.provider);
  if (existing) return existing.id;
  const id = input.createId();
  const [created] = await getDb().insert(workspaceProviderConnection).values({
    id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    status: 'disconnected',
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
  }).onConflictDoNothing({
    target: [workspaceProviderConnection.workspaceId, workspaceProviderConnection.provider],
  }).returning({ id: workspaceProviderConnection.id });
  if (created) return created.id;
  const raced = await findProviderConnection(input.workspaceId, input.provider);
  if (!raced) throw new Error('Provider connection could not be initialized.');
  return raced.id;
}

export async function saveProviderCredential(input: {
  connectionId: string;
  credential: {
    authenticationTag: string;
    ciphertext: string;
    fingerprint: string;
    initializationVector: string;
    keyVersion: string;
    maskedLabel: string;
  };
  credentialId: string;
  now: Date;
  provider: string;
  providerMetadata: Record<string, unknown>;
  userId: string;
  workspaceId: string;
}) {
  await getDb().transaction(async (tx) => {
    const [connection] = await tx.insert(workspaceProviderConnection).values({
      id: input.connectionId,
      workspaceId: input.workspaceId,
      provider: input.provider,
      status: 'connected',
      providerMetadata: input.providerMetadata,
      lastValidatedAt: input.now,
      lastErrorCode: null,
      lastErrorMessage: null,
      disconnectedAt: null,
      createdByUserId: input.userId,
      updatedByUserId: input.userId,
      updatedAt: input.now,
    }).onConflictDoUpdate({
      target: [workspaceProviderConnection.workspaceId, workspaceProviderConnection.provider],
      set: {
        status: 'connected',
        providerMetadata: input.providerMetadata,
        lastValidatedAt: input.now,
        lastErrorCode: null,
        lastErrorMessage: null,
        disconnectedAt: null,
        updatedByUserId: input.userId,
        updatedAt: input.now,
      },
    }).returning();
    if (!connection) throw new Error('Provider connection could not be saved.');
    await tx.update(workspaceProviderCredential).set({ revokedAt: input.now }).where(and(
      eq(workspaceProviderCredential.connectionId, connection.id),
      isNull(workspaceProviderCredential.revokedAt),
    ));
    await tx.insert(workspaceProviderCredential).values({
      id: input.credentialId,
      connectionId: connection.id,
      encryptedSecret: input.credential.ciphertext,
      initializationVector: input.credential.initializationVector,
      authenticationTag: input.credential.authenticationTag,
      encryptionKeyVersion: input.credential.keyVersion,
      fingerprint: input.credential.fingerprint,
      maskedLabel: input.credential.maskedLabel,
      createdByUserId: input.userId,
    });
  });
}

export async function disconnectProviderConnection(connectionId: string, userId: string, now: Date) {
  await getDb().transaction(async (tx) => {
    await tx.update(workspaceProviderCredential).set({ revokedAt: now }).where(and(
      eq(workspaceProviderCredential.connectionId, connectionId),
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
    }).where(eq(workspaceProviderConnection.id, connectionId));
  });
}

export async function updateProviderValidation(input: {
  connectionId: string;
  metadata: Record<string, unknown>;
  userId: string;
  validatedAt: Date;
}) {
  await getDb().update(workspaceProviderConnection).set({
    status: 'connected',
    providerMetadata: input.metadata,
    lastValidatedAt: input.validatedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedByUserId: input.userId,
    updatedAt: input.validatedAt,
  }).where(eq(workspaceProviderConnection.id, input.connectionId));
}

export async function recordProviderValidationError(input: {
  connectionId: string;
  error: ProviderAdapterError;
  invalid: boolean;
  now: Date;
  userId: string;
}) {
  await getDb().update(workspaceProviderConnection).set({
    ...(input.invalid ? { status: 'invalid' as const } : {}),
    lastErrorCode: input.error.descriptor.code,
    lastErrorMessage: input.error.descriptor.message.slice(0, 1_000),
    updatedByUserId: input.userId,
    updatedAt: input.now,
  }).where(eq(workspaceProviderConnection.id, input.connectionId));
}

export async function markProviderConnectionUsed(connectionId: string, usedAt: Date) {
  await getDb().update(workspaceProviderConnection).set({
    lastUsedAt: usedAt,
    updatedAt: usedAt,
  }).where(eq(workspaceProviderConnection.id, connectionId));
}

export function summaryToProviderMetadata(summary: ProviderCredentialSummary) {
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
