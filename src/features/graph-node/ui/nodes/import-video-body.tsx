'use client';

import type { PointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { SettingRow } from '@/shared/ui/setting-row';
import { useImportVideo } from '../../model/use-import-video';
import { AudioPlayer } from '../audio-player';
import { PortButton } from '../port-button';

export function ImportVideoBody({ node, onStartConnection }: {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const model = useImportVideo(node);
  const url = useAssetUrl(model.previewAssetId ?? model.source?.id);
  const playbackReady = model.source?.video?.browserPlayable || Boolean(model.previewAssetId);
  return <div className="import-video-body" data-node-interactive>
    {url && playbackReady ? <video src={url} controls preload="metadata" playsInline aria-label="Imported video preview" />
      : <div className="node-note">Original video is preserved. Prepare a compatible preview to play it here.</div>}
    {!playbackReady ? <button type="button" className="secondary-node-button" disabled={Boolean(model.busy)}
      onClick={() => void model.prepare('preview')}>{model.busy === 'preview' ? 'Preparing preview…' : 'Prepare preview'}</button> : null}
    <div className="node-note node-note-compact">{model.source?.video ? `${model.source.video.width} × ${model.source.video.height} · ${Math.round(model.source.video.durationSeconds)} sec` : 'Video metadata unavailable'}</div>
    {model.tracks.length ? <SettingRow label="Audio track" value={String(model.selectedTrack)} wide
      options={model.tracks.map((track, index) => ({ value: String(track.index), label: `${index + 1}. ${track.title || track.language || track.codec}${track.isDefault ? ' · Default' : ''}` }))}
      onChange={model.selectTrack} /> : <div className="node-note">This video has no audio track.</div>}
    <div className="import-video-output-row"><span>{model.tracks.length ? 'Original · video + audio' : 'Original · video'}</span><small>Ready</small>
      <PortButton nodeId={node.id} portId="original" side="output" kind="video" label="Original" className="node-port-section" onStartConnection={onStartConnection} />
    </div>
    <div className="import-video-output-row"><span>Video without audio</span>
      <button type="button" className="mini-select" disabled={Boolean(model.busy) || Boolean(model.videoAssetId)}
        onClick={() => void model.prepare('video-only')}>{model.videoAssetId ? 'Ready' : model.busy === 'video-only' ? 'Preparing…' : 'Prepare video'}</button>
      <PortButton nodeId={node.id} portId="video" side="output" kind="video" label="Video without audio" className="node-port-section" onStartConnection={onStartConnection} />
    </div>
    <div className="import-video-output-row"><span>Audio only</span>
      <button type="button" className="mini-select" disabled={Boolean(model.busy) || !model.tracks.length || Boolean(model.audioAssetId)}
        onClick={() => void model.prepare('audio')}>{!model.tracks.length ? 'No audio' : model.audioAssetId ? 'Ready' : model.busy === 'audio' ? 'Preparing…' : 'Extract audio'}</button>
      <PortButton nodeId={node.id} portId="audio" side="output" kind="audio" label="Audio only" className="node-port-section" onStartConnection={onStartConnection} />
    </div>
    {model.audioAssetId ? <AudioPlayer assetId={model.audioAssetId} /> : null}
    <div className="node-note node-note-compact">Original is unchanged. Prepared tracks are reused. Audio includes speech, music and background sounds.</div>
    {model.error ? <div className="node-note" role="alert">{model.error}</div> : null}
  </div>;
}
