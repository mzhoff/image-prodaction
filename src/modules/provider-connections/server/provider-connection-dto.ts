import type { ProviderCredentialSummary } from '..';
import type { ProviderConnectionWithCredential } from '../adapters/postgres/provider-connection-repository';

export interface ProviderConnectionDto {
  canManage: boolean;
  lastError: string | null;
  lastUsedAt: string | null;
  lastValidatedAt: string | null;
  maskedKey: string | null;
  provider: 'openrouter';
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

export function toProviderConnectionDto(
  record: ProviderConnectionWithCredential,
  canManage: boolean,
): ProviderConnectionDto {
  return {
    provider: 'openrouter',
    status: record?.status ?? 'disconnected',
    canManage,
    maskedKey: record?.maskedLabel ?? null,
    lastValidatedAt: record?.lastValidatedAt?.toISOString() ?? null,
    lastUsedAt: record?.lastUsedAt?.toISOString() ?? null,
    lastError: record?.lastErrorMessage ?? null,
  };
}

export function toKeyUsageDto(
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

function decimalToNumber(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
