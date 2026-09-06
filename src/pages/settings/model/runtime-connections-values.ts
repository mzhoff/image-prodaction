import type { RuntimeV2Scope, RuntimeV2Repin } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import type { RuntimeV2Pipeline, RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';

export const runtimeScopeLabels: Record<RuntimeV2Scope, string> = {
  'pipeline.catalog.read': 'Просматривать доступные pipelines',
  'pipeline.descriptor.read': 'Читать формат входа и результата',
  'pipeline.run.create': 'Запускать генерацию',
  'pipeline.run.read': 'Получать состояние и результат',
  'pipeline.run.cancel': 'Отменять запуски',
  'pipeline.artifact.read': 'Скачивать готовые файлы',
  'pipeline.grants.manage': 'Самостоятельно подключать pipelines',
  'pipeline.asset.write': 'Загружать аудио для pipelines',
};

export function resolveCatalogReference(reference: string, catalog: RuntimeV2Pipeline[]) {
  const normalized = reference.trim();
  const direct = catalog.find((pipeline) => pipeline.publicId === normalized);
  if (direct) return direct;
  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const ids = url.pathname.split('/').filter((part) => /^pln_[a-z0-9]{32}$/.test(part));
    return ids.length === 1 ? catalog.find((pipeline) => pipeline.publicId === ids[0]) ?? null : null;
  } catch {
    return null;
  }
}

export function canPinRuntimeVersion(version: RuntimeV2Version | null | undefined) {
  return Boolean(version?.capabilityKey && version.inputSchemaChecksum && version.outputSchemaChecksum);
}

export function runtimeRepinInput(revision: number, version: RuntimeV2Version): RuntimeV2Repin {
  if (!canPinRuntimeVersion(version)) throw new Error('У версии нет полного опубликованного контракта.');
  return {
    expectedGrantRevision: revision, version: version.version, checksum: version.checksum,
    inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum!,
  };
}

export function readableRuntimeDate(value: string | null) {
  return value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'Ещё не использован';
}

export function runtimeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие.';
}
