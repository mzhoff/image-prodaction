'use client';

import { AudioLines, Loader2 } from 'lucide-react';
import type { PointerEvent } from 'react';
import type { AudioConvertNodeData, ProductionNode, SpeechToTextNodeData } from '@/entities/production-graph/model/types';
import { audioConvertOptionsSchema } from '@/shared/media/audio-contracts';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { SettingRow } from '@/shared/ui/setting-row';
import { useAudioNodeModel } from '../../model/use-audio-node-model';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { AudioPlayer } from '../audio-player';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface Props { node: ProductionNode; onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void }
const options = (values: readonly (number | string)[]) => values.map((value) => ({ value: String(value), label: String(value) }));

export function AudioNode({ node, onStartConnection }: Props) {
  const model = useAudioNodeModel(node);
  const { isCollapsed, setCollapsed } = useNodeDisplayState(node.id);
  const transcribe = node.type === 'speechToText';
  const inputId = transcribe ? 'audio' : 'source';
  const outputId = transcribe ? 'text' : 'audio';
  const data = node.data as SpeechToTextNodeData & AudioConvertNodeData;
  const port = (side: 'input' | 'output', header = false) => <PortButton nodeId={node.id}
    portId={side === 'input' ? inputId : outputId} side={side} kind={side === 'input' ? 'audio' : transcribe ? 'text' : 'audio'}
    label={side === 'input' ? 'Audio' : transcribe ? 'Text' : 'Audio'} onStartConnection={onStartConnection}
    className={header ? undefined : 'node-port-section'} style={header ? { top: 20 } : undefined} />;
  return <>
    <NodeTitle title={data.title} nodeType={node.type} muted action={<TextNodeTitleActions collapsed={isCollapsed} onCollapsedChange={setCollapsed} />} />
    {isCollapsed ? <>{port('input', true)}{port('output', true)}</> : <>
      <CollapsibleSection title="Audio input" className="text-node-section" sidePort={port('input')} dropTarget={{ nodeId: node.id, portId: inputId }}>
        <AudioPlayer assetId={model.source?.id} emptyLabel="Connect audio from Import, Voice or Audio Convert." />
      </CollapsibleSection>
      <fieldset disabled={node.status === 'running'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {transcribe ? <CollapsibleSection title="Settings" className="text-node-section">
          <SettingRow label="Model" value={data.model} options={[{ value: data.model, label: data.model }]} onChange={(value) => model.update({ model: value })} wide />
          <SettingRow label="Language" value={data.language || 'auto'} options={[{ value: 'auto', label: 'Detect automatically' }, { value: 'ru', label: 'Russian' }, { value: 'en', label: 'English' }]} onChange={(value) => model.update({ language: value === 'auto' ? undefined : value })} />
          <div className="node-note node-note-compact">Only speech is returned as text. Up to 30 minutes; long audio is processed in parts.</div>
        </CollapsibleSection> : <CollapsibleSection title="Settings" className="text-node-section">
          <SettingRow label="Format" value={data.format} options={options(['mp3', 'wav', 'flac', 'ogg'])} onChange={(value) => model.update({ format: audioConvertOptionsSchema.shape.format.parse(value), ...(value === 'ogg' && data.sampleRateHz === 44100 ? { sampleRateHz: 48000 } : {}) })} />
          {data.format === 'mp3' || data.format === 'ogg' ? <SettingRow label="Bitrate" value={String(data.bitrateKbps || 192)} options={options([64, 96, 128, 192, 256, 320])} onChange={(value) => model.update({ bitrateKbps: audioConvertOptionsSchema.shape.bitrateKbps.parse(Number(value)) })} /> : null}
          <SettingRow label="Sample rate" value={String(data.sampleRateHz || 'source')} options={[{ value: 'source', label: 'Automatic / keep original' }, ...options(data.format === 'ogg' ? [16000, 24000, 48000] : [16000, 24000, 44100, 48000])]} onChange={(value) => model.update({ sampleRateHz: value === 'source' ? undefined : audioConvertOptionsSchema.shape.sampleRateHz.parse(Number(value)) })} />
          <SettingRow label="Channels" value={String(data.channels || 'source')} options={[{ value: 'source', label: 'Keep original' }, { value: '1', label: 'Mono' }, { value: '2', label: 'Stereo' }]} onChange={(value) => model.update({ channels: value === 'source' ? undefined : audioConvertOptionsSchema.shape.channels.parse(Number(value)) })} />
        </CollapsibleSection>}
      </fieldset>
      <PrimaryActionButton className="text-generation-button" icon={node.status === 'running' ? <Loader2 size={16} className="spin" /> : <AudioLines size={16} />} disabled={node.status === 'running' || !model.source} onClick={() => void model.run()}>{transcribe ? 'Transcribe audio' : 'Convert audio'}</PrimaryActionButton>
      <CollapsibleSection title="Result" className="text-node-section" sidePort={port('output')}>
        {transcribe ? <textarea readOnly aria-label="Transcribed text" value={data.result || ''} placeholder="Transcription will appear here." style={{ width: '100%', minHeight: 120, resize: 'vertical' }} data-node-interactive onPointerDown={(event) => event.stopPropagation()} /> : <AudioPlayer assetId={model.resultAssetId} />}
      </CollapsibleSection>
      {data.message ? <div className="node-note node-note-compact" role="alert">{data.message}</div> : null}
    </>}
  </>;
}
