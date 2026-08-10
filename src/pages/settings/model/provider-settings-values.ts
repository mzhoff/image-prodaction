import { WorkspaceAiApiError } from '../api/workspace-ai-api';
import type { WorkspaceSettingsRole } from '../api/workspace-ai-api';

export function roleLabel(role: WorkspaceSettingsRole) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Только просмотр';
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatUsd(value: number | string | null) {
  if (value === null || value === '') return 'Не предоставлено';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'Не предоставлено';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(parsed);
}

export function formatInteger(value: number | string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(parsed);
}

export function formatOperation(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/^\w/u, (letter) => letter.toUpperCase());
}

export function formatKeyTier(value?: boolean | null) {
  if (value === true) return 'Free tier key';
  if (value === false) return 'Paid key';
  return 'Тариф key не предоставлен';
}

export function formatLimitReset(value?: string | null) {
  if (!value) return 'Reset policy не предоставлена';
  const resetAt = new Date(value);
  if (Number.isNaN(resetAt.getTime())) return `Reset: ${value}`;
  return `Reset: ${formatDateTime(value)}`;
}

export function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.';
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function isNotFoundError(error: unknown) {
  return error instanceof WorkspaceAiApiError && error.status === 404;
}
