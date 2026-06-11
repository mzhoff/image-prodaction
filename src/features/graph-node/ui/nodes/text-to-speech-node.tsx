'use client';

import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Volume2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { RangeSlider } from '@/shared/ui/range-slider';
import { SettingRow } from '@/shared/ui/setting-row';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { useTextToSpeechNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface TextToSpeechNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextToSpeechNode({ node, onStartConnection }: TextToSpeechNodeProps) {
  const model = useTextToSpeechNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [resultOpen, setResultOpen] = useState(true);

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />} />
      {collapsed ? (
        <PortButton
          nodeId={node.id}
          portId="text"
          side="input"
          kind="text"
          label="Text"
          className="text-node-header-input-port"
          style={{ top: 20 }}
          onStartConnection={onStartConnection}
        />
      ) : null}
      {!collapsed ? (
        <>
          <CollapsibleSection
            title="Settings"
            className="text-node-section text-to-speech-settings-section"
            dropTarget={{ nodeId: node.id, portId: 'text' }}
            sidePort={<PortButton nodeId={node.id} portId="text" side="input" kind="text" label="Text" className="node-port-section" onStartConnection={onStartConnection} />}
          >
            <SettingRow label="Model" value={model.selectedModel} options={model.modelOptions} onChange={model.handleModelChange} wide />
            <SettingRow label="Language" value={model.language} options={model.languageOptions} onChange={model.handleLanguageChange} />
            <SettingRow label="Voice" value={model.selectedVoice} options={model.voiceOptions} onChange={model.handleVoiceChange} wide />
            {model.showFormat ? (
              <SettingRow label="Format" value={model.responseFormat} options={model.responseFormatOptions} onChange={model.handleResponseFormatChange} />
            ) : null}
            {model.showSpeed ? (
              <RangeSlider
                label="Speed"
                min={0.5}
                max={2}
                step={0.1}
                value={model.speed}
                valueLabel={`Speed ${model.speed.toFixed(1)}`}
                onChange={model.handleSpeedChange}
              />
            ) : null}
            {model.showTemperature ? (
              <RangeSlider
                label="Temperature"
                min={0}
                max={2}
                step={0.1}
                value={model.temperature}
                valueLabel={`Temperature ${model.temperature.toFixed(1)}`}
                onChange={model.handleTemperatureChange}
              />
            ) : null}
            {model.showTopP ? (
              <RangeSlider
                label="Top P"
                min={0}
                max={1}
                step={0.05}
                value={model.topP}
                valueLabel={`Top P ${model.topP.toFixed(2)}`}
                onChange={model.handleTopPChange}
              />
            ) : null}
            {model.showSeed ? (
              <label className="text-to-speech-seed-row setting-row" data-node-interactive>
                <span>Seed</span>
                <input
                  type="text"
                  value={model.seed ?? ''}
                  placeholder="Auto"
                  onChange={(event) => model.handleSeedChange(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              </label>
            ) : null}
          </CollapsibleSection>
          <PrimaryActionButton
            className="text-generation-button"
            icon={node.status === 'running' ? <Loader2 className="spin" size={17} /> : <Volume2 size={17} />}
            onClick={model.handleGenerate}
            disabled={node.status === 'running' || model.loading}
          >
            Generate Voice
          </PrimaryActionButton>
          <CollapsibleSection
            title="Result"
            className="text-node-section text-to-speech-result-section"
            open={resultOpen}
            onOpenChange={setResultOpen}
          >
            {model.history.items.length > 1 ? (
              <AudioResultVersionControl
                activeIndex={model.history.activeIndex}
                count={model.history.items.length}
                onChange={model.handleResultHistoryChange}
              />
            ) : null}
            <AudioResultPlayer assetId={model.activeAssetId} metadata={model.activeMetadata} />
          </CollapsibleSection>
          {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
        </>
      ) : null}
    </>
  );
}

function AudioResultVersionControl({
  activeIndex,
  count,
  onChange,
}: {
  activeIndex: number;
  count: number;
  onChange: (index: number) => void;
}) {
  const currentIndex = count <= 0 ? -1 : Math.min(Math.max(activeIndex, 0), count - 1);

  return (
    <div className="text-generation-version-row" data-node-interactive>
      <span>Version</span>
      <div className="text-generation-version-controls">
        <button type="button" aria-label="Previous voice version" title="Previous" onClick={() => onChange((currentIndex - 1 + count) % count)}>
          <ChevronLeft size={14} />
        </button>
        <strong>{currentIndex + 1}/{count}</strong>
        <button type="button" aria-label="Next voice version" title="Next" onClick={() => onChange((currentIndex + 1) % count)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function AudioResultPlayer({
  assetId,
  metadata,
}: {
  assetId?: string;
  metadata?: {
    mimeType?: string;
    model?: string;
    sizeBytes?: number;
    voice?: string;
  };
}) {
  const url = useAssetUrl(assetId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);

  useEffect(() => {
    setDuration(0);
    setPlaying(false);
    setTime(0);
  }, [url]);

  if (!url || !assetId) {
    return <div className="text-to-speech-empty-result">Generated audio will appear here.</div>;
  }

  const handleToggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const handleSeek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = nextTime;
    setTime(nextTime);
  };

  return (
    <div className="text-to-speech-player" data-node-interactive>
      <audio
        ref={audioRef}
        src={url}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      />
      <div className="text-to-speech-player-row">
        <button type="button" className="text-to-speech-play-button" aria-label={playing ? 'Pause audio' : 'Play audio'} onClick={() => void handleToggle()}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="text-to-speech-time">{formatAudioTime(time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(time, Math.max(duration, 0.01))}
          className="text-to-speech-track"
          onChange={(event) => handleSeek(Number(event.target.value))}
          onPointerDown={(event) => event.stopPropagation()}
        />
        <span className="text-to-speech-time">{formatAudioTime(duration)}</span>
      </div>
      <div className="text-to-speech-meta">
        <span>{metadata?.model ?? 'Unknown model'}</span>
        <span>{metadata?.voice ? `Voice ${metadata.voice}` : null}</span>
        <span>{formatBytes(metadata?.sizeBytes)}</span>
      </div>
    </div>
  );
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function formatBytes(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return '0 KB';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
