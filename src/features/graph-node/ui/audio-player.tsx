'use client';

import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

export function AudioPlayer({ assetId, emptyLabel = 'Audio will appear here.' }: { assetId?: string; emptyLabel?: string }) {
  const url = useAssetUrl(assetId);
  const asset = useProductionGraphStore((state) => state.assets.find((item) => item.id === assetId));
  if (!url) return <div className="text-to-speech-empty-result">{emptyLabel}</div>;
  return <div className="text-to-speech-player" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
    <audio key={url} controls preload="metadata" src={url} aria-label={asset?.name || 'Audio preview'} style={{ width: '100%', minWidth: 0 }} />
    <div className="text-to-speech-meta"><span>{asset?.name}</span>{asset?.audio ? <span>
      {asset.audio.container.toUpperCase()} · {Math.round(asset.audio.durationSeconds)} sec · {asset.audio.sampleRateHz} Hz · {asset.audio.channels === 1 ? 'Mono' : 'Stereo'}
    </span> : null}</div>
  </div>;
}
