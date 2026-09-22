'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useMemo, useState } from 'react';
import { deleteAssetBlob, loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { createExportImageResultSignature } from '@/entities/production-graph/model/export-image-result';
import type { AssetRecord, ExportImageNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { exportImageBlob, getExportFileName } from '../lib/export-image';

/** A local viewer cache. Browsing never changes Export's canonical output. */
export function useExportImagePreview(data: ExportImageNodeData, sourceAsset?: AssetRecord) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const [cache, setCache] = useState<Array<{ signature: string; assetId: string }>>([]);
  const [failure, setFailure] = useState<{ signature: string; message: string }>();
  const options = useMemo(() => ({ background: data.background, format: data.format,
    quality: data.quality, scale: data.scale }), [data.background, data.format, data.quality, data.scale]);
  const signature = sourceAsset ? createExportImageResultSignature(sourceAsset.id, options) : undefined;
  const resultAssetId = cache.find((entry) => entry.signature === signature)?.assetId;

  useEffect(() => {
    if (!sourceAsset || !signature || resultAssetId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const blob = await loadAssetBlob(sourceAsset);
        if (cancelled) return;
        if (!blob) throw new Error(tEffect("Не удалось прочитать изображение для просмотра."));
        const converted = await exportImageBlob(blob, options);
        if (cancelled) return;
        const asset = await saveTransientImageAsset(new File([converted.blob],
          getExportFileName(sourceAsset.name, converted.extension), { type: converted.mimeType }));
        if (cancelled) {
          await deleteAssetBlob(asset).catch(() => undefined);
          return;
        }
        addAsset(asset);
        // Keep the viewer's in-memory lookup bounded. Assets may already have
        // been saved/reused by the user, so cache eviction must not delete them.
        setCache((current) => [...current.filter((entry) => entry.signature !== signature).slice(-19),
          { signature, assetId: asset.id }]);
      } catch (error) {
        if (!cancelled) setFailure({ signature, message: error instanceof Error ? error.message : tEffect("Не удалось подготовить просмотр.") });
      }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [addAsset, options, resultAssetId, signature, sourceAsset]);

  return {
    getAssetId: (sourceId: string) => cache.find((entry) => entry.signature === createExportImageResultSignature(sourceId, options))?.assetId,
    message: failure && failure.signature === signature && !resultAssetId ? failure.message : '',
  };
}
