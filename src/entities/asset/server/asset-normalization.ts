import type { UploadImageAssetInput } from './asset-service-contracts';
import { AssetLibraryQueryError, AssetProvenanceError } from './asset-service-contracts';

export function normalizeAssetProvenance(input: UploadImageAssetInput) {
  const origin = input.origin ?? 'unknown';
  const libraryVisible = input.libraryVisible ?? false;
  const provider = normalizeOptionalMetadataText(input.provider);
  const modelId = normalizeOptionalMetadataText(input.modelId);
  const generationJobId = input.generationJobId ?? null;
  let operation = normalizeOptionalMetadataText(input.operation);
  if (origin === 'uploaded') {
    operation ??= 'upload';
    if (provider || modelId || generationJobId) {
      throw new AssetProvenanceError('Uploaded assets cannot have generation provenance.');
    }
  }
  if (origin === 'generated' && (!provider || !modelId || !operation || !generationJobId)) {
    throw new AssetProvenanceError('Generated assets require provider, model, operation, and generation job.');
  }
  if (origin === 'saved') operation ??= 'save_to_library';
  if (!libraryVisible && origin !== 'unknown' && origin !== 'generated') {
    throw new AssetProvenanceError('Durable library origins require library visibility.');
  }
  return {
    generationJobId,
    libraryVisible,
    metadata: normalizeMetadata(input.metadata),
    modelId,
    operation,
    origin,
    provider,
  };
}

export function normalizeOriginalName(value: string, extension: string) {
  const leafName = value.replace(/\\/g, '/').split('/').pop() ?? '';
  const normalized = leafName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return normalized || `image.${extension}`;
}

export function normalizeLibraryLimit(value?: number) {
  if (value === undefined) return 40;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new AssetLibraryQueryError('Library page size must be between 1 and 100.');
  }
  return value;
}

export function normalizeLibrarySearch(value?: string) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, 120) || undefined;
}

export function normalizeStringFilters(values?: string[]) {
  if (!values?.length) return undefined;
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > 50) throw new AssetLibraryQueryError('Too many library filters.');
  return normalized.length ? normalized : undefined;
}

export function encodeLibraryCursor(input: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({
    createdAt: input.createdAt.toISOString(), id: input.id,
  }), 'utf8').toString('base64url');
}

export function decodeLibraryCursor(value?: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown; id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new AssetLibraryQueryError('Library cursor is invalid.');
  }
}

function normalizeMetadata(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768) throw new AssetProvenanceError('Asset metadata is too large.');
  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeOptionalMetadataText(value: string | null | undefined) {
  return value?.trim().slice(0, 255) || null;
}
