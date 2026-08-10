import { PROVIDER_MODALITIES, type ProviderModality, type ProviderSafeMetadata } from '../contracts/provider-contracts';
import { createInvalidProviderResponseError } from '../core/provider-errors';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readString(value: unknown, key: string) {
  const candidate = asRecord(value)?.[key];
  return typeof candidate === 'string' && candidate ? candidate : null;
}

export function readToken(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function readDecimal(value: unknown) {
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return trimDecimal(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return trimDecimal(value.toFixed(12));
}

export function normalizeModalities(value: unknown): ProviderModality[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(PROVIDER_MODALITIES);
  return Array.from(new Set(value.filter(
    (item): item is ProviderModality => typeof item === 'string' && allowed.has(item),
  )));
}

export function uniqueModalities(value: ProviderModality[]) {
  return Array.from(new Set(value));
}

export function setSafeMetadata(target: ProviderSafeMetadata, key: string, value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    target[key] = value;
  }
}

export function removeUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export async function readJsonSafely(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return {};
    throw createInvalidProviderResponseError();
  }
}

export function readEmbeddedError(raw: unknown): {
  errorType: string | null;
  providerOperationId: string | null;
  status: number | null;
} | null {
  const payload = asRecord(raw);
  const error = asRecord(payload?.error);
  if (!error) return null;
  const metadata = asRecord(error.metadata);
  return {
    errorType: typeof metadata?.error_type === 'string'
      ? metadata.error_type
      : typeof payload?.error_type === 'string' ? payload.error_type : null,
    providerOperationId: readString(payload, 'id'),
    status: readToken(error.code),
  };
}

export function readRetryAfterMs(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

function trimDecimal(value: string) {
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') || '0' : value;
}
