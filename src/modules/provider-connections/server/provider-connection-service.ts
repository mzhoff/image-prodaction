import type { CredentialCryptoAdapter, ProviderAdapter } from '..';
import { ProviderAdapterError } from '../core/provider-errors';
import { ProviderCredentialValidationError } from '../core/provider-connection-errors';
import {
  disconnectProviderConnection,
  findProviderConnection,
  findProviderWorkspace,
  getOrCreateProviderConnectionId,
  markProviderConnectionUsed,
  recordProviderValidationError,
  saveProviderCredential,
  summaryToProviderMetadata,
  updateProviderValidation,
} from '../adapters/postgres/provider-connection-repository';
import {
  createCredentialBinding,
  normalizeOpenRouterKey,
  resolveStoredProviderCredential,
  toProviderAdapterError,
  validateProviderCredential,
} from './provider-credential';
import {
  toKeyUsageDto,
  toProviderConnectionDto,
} from './provider-connection-dto';
import { createRuntimeOpenRouterAdapter } from './runtime-provider-adapter';
import { getCredentialCrypto } from './credential-crypto-config';
import { requireWorkspaceMembership, type WorkspaceRole } from '@/entities/workspace/server/workspace-service';
import { workspaceProviderConnection, workspaceProviderCredential } from '@/shared/db/schema/provider';
import { createUuidV7 } from '@/shared/lib/id';

const OPENROUTER_PROVIDER = 'openrouter';
const MANAGER_ROLES: WorkspaceRole[] = ['owner', 'admin'];

export type ProviderConnectionRecord = typeof workspaceProviderConnection.$inferSelect;
export type ProviderCredentialRecord = typeof workspaceProviderCredential.$inferSelect;
export type { OpenRouterKeyUsageDto, ProviderConnectionDto } from './provider-connection-dto';
export { ProviderConnectionNotConfiguredError, ProviderCredentialValidationError } from '../core/provider-connection-errors';

export interface ProviderConnectionServiceDependencies {
  adapter: ProviderAdapter;
  crypto: CredentialCryptoAdapter;
  createId(): string;
  now(): Date;
}

export async function listWorkspaceProviderConnections(userId: string, workspaceId: string) {
  const member = await requireWorkspaceMembership(userId, workspaceId);
  const [targetWorkspace, connection] = await Promise.all([
    findProviderWorkspace(workspaceId),
    findProviderConnection(workspaceId, OPENROUTER_PROVIDER),
  ]);
  if (!targetWorkspace) throw new Error('Workspace does not exist.');
  return {
    workspace: { id: targetWorkspace.id, name: targetWorkspace.name, role: member.role },
    providers: [toProviderConnectionDto(connection, MANAGER_ROLES.includes(member.role))],
  };
}

export async function connectOpenRouterProvider(
  input: { apiKey: string; userId: string; workspaceId: string },
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(input.userId, input.workspaceId, MANAGER_ROLES);
  const apiKey = normalizeOpenRouterKey(input.apiKey);
  const summary = await validateProviderCredential(dependencies.adapter, apiKey);
  const connectionId = await getOrCreateProviderConnectionId({
    createId: dependencies.createId,
    provider: OPENROUTER_PROVIDER,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const envelope = dependencies.crypto.encrypt(apiKey, {
    binding: createCredentialBinding(input.workspaceId, OPENROUTER_PROVIDER),
  });
  const now = dependencies.now();
  await saveProviderCredential({
    connectionId,
    credential: {
      ...envelope,
      fingerprint: dependencies.crypto.fingerprint(apiKey),
      maskedLabel: dependencies.crypto.maskedLabel(apiKey),
    },
    credentialId: dependencies.createId(),
    now,
    provider: OPENROUTER_PROVIDER,
    providerMetadata: summaryToProviderMetadata(summary),
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  const saved = await findProviderConnection(input.workspaceId, OPENROUTER_PROVIDER);
  return { provider: toProviderConnectionDto(saved, true), keyUsage: toKeyUsageDto(summary, now) };
}

export async function validateStoredOpenRouterProvider(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId, MANAGER_ROLES);
  const resolved = await resolveCredential(workspaceId, dependencies);
  const now = dependencies.now();
  try {
    const summary = await dependencies.adapter.validateCredential({ credential: resolved.apiKey });
    await updateProviderValidation({
      connectionId: resolved.connection.id,
      metadata: summaryToProviderMetadata(summary),
      userId,
      validatedAt: now,
    });
    const refreshed = await findProviderConnection(workspaceId, OPENROUTER_PROVIDER);
    return {
      valid: true,
      provider: toProviderConnectionDto(refreshed, true),
      keyUsage: toKeyUsageDto(summary, now),
    };
  } catch (error) {
    const providerError = toProviderAdapterError(dependencies.adapter, error);
    await recordProviderValidationError({
      connectionId: resolved.connection.id,
      error: providerError,
      invalid: shouldInvalidateProviderConnection(providerError),
      now,
      userId,
    });
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
  const resolved = await resolveCredential(workspaceId, dependencies);
  const summary = await dependencies.adapter.getCredentialSummary({ credential: resolved.apiKey });
  const now = dependencies.now();
  return { provider: OPENROUTER_PROVIDER, keyUsage: toKeyUsageDto(summary, now) };
}

export async function disconnectOpenRouterProvider(
  userId: string,
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies = createDefaultDependencies(),
) {
  await requireWorkspaceMembership(userId, workspaceId, MANAGER_ROLES);
  const connection = await findProviderConnection(workspaceId, OPENROUTER_PROVIDER);
  if (connection) await disconnectProviderConnection(connection.id, userId, dependencies.now());
}

/** Internal-only secret resolver. Never return this value from an API response. */
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
  return resolveCredential(workspaceId, dependencies, true);
}

export async function markOpenRouterProviderUsed(connectionId: string, usedAt = new Date()) {
  await markProviderConnectionUsed(connectionId, usedAt);
}

function resolveCredential(
  workspaceId: string,
  dependencies: ProviderConnectionServiceDependencies,
  requireConnected = false,
) {
  return resolveStoredProviderCredential({
    crypto: dependencies.crypto,
    provider: OPENROUTER_PROVIDER,
    requireConnected,
    workspaceId,
  });
}

function createDefaultDependencies(): ProviderConnectionServiceDependencies {
  return {
    adapter: createRuntimeOpenRouterAdapter(),
    crypto: getCredentialCrypto(),
    createId: createUuidV7,
    now: () => new Date(),
  };
}
