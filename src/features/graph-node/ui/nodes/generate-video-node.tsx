'use client';
import type { PointerEvent } from 'react';
import { Clapperboard, Loader2, Plus, RefreshCw, Square } from '@prodactionpro/ui-core/icons';
import { getActiveAssetScope, getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import type { GenerateVideoNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getVideoModelDisplayName, validateVideoRequest, VIDEO_REFERENCE_LIMIT, type VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { ModelSettingRow } from '@/features/model-selector/ui/model-selector';
import { SettingRow } from '@/shared/ui/setting-row';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { collectVideoRequest } from '@/entities/production-graph/model/video-generation-inputs';
import { GenerationWaitingExperience } from '@/features/generation-waiting/ui/generation-waiting-experience';
import { getInputConnectionStatus } from '../../lib/input-connection-status';
import { useVideoModels } from '../../model/use-video-models';
import { useVideoExecution } from '../../model/use-video-execution';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { InputConnectionBadge } from '../input-connection-badge';
import { ImagePlate } from '../image-plate';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';
import { VideoModelLogo } from '../video-model-logo';
import { getVideoGenerationUserMessage } from '../../lib/video-generation-user-message';
import { AspectRatioSelector } from '@/features/aspect-ratio-selector/ui/aspect-ratio-selector';
import { getVideoOutputResolution } from '@/shared/media/output-resolution/video-output-resolution';
import './generate-video-node.css';

interface Props { node: ProductionNode; onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void }
interface ActiveVideoImageInput { id: string; label: string; referenceIndex?: number }
const modes = [{ value: 'text', label: 'Только текст' }, { value: 'frames', label: 'Первый / последний кадр' }, { value: 'references', label: 'Референсы' }] as const;
export function GenerateVideoNode({ node, onStartConnection }: Props) {
  const data = node.data as GenerateVideoNodeData;
  const nodes = useProductionGraphStore((state) => state.nodes);
  const edges = useProductionGraphStore((state) => state.edges);
  const assets = useProductionGraphStore((state) => state.assets);
  const update = useProductionGraphStore((state) => state.updateNodeData);
  const { models, error: catalogError, reload } = useVideoModels();
  const execution = useVideoExecution(node.id, data);
  const { isCollapsed, setCollapsed } = useNodeDisplayState(node.id);
  const model = models.find((item) => item.key === data.model);
  const busy = node.status === 'running';
  const locked = node.locked || Boolean(data.videoRequest) || busy;
  const modeOptions = model ? modes.filter((mode) => isVideoModeAvailable(mode.value, model)) : modes;
  const activeImageInputs = getActiveVideoImageInputs(data.mode, model);
  const settings = (patch: Partial<GenerateVideoNodeData>) => { if (!locked) update(node.id, patch); };
  let error = catalogError;
  try { error ||= validateVideoRequest(collectVideoRequest(node.id, data, { nodes, edges, assets }), model) ?? ''; }
  catch (failure) { error ||= failure instanceof Error ? failure.message : 'Проверьте входы.'; }
  const visibleError = getVideoGenerationUserMessage(data.message || error);
  const port = (id: string, label: string, kind: 'image' | 'text' | 'video', top?: number) => <PortButton nodeId={node.id} portId={id}
    side={id === 'video' ? 'output' : 'input'} kind={kind} label={label} onStartConnection={onStartConnection}
    className={top === undefined ? 'node-port-section' : undefined} style={top === undefined ? undefined : { top }} />;
  const imageRow = (id: string, label: string, index?: number) => {
    const status = getInputConnectionStatus(node.id, id, { nodes, edges, assets });
    return <div key={id} className="video-generation-input">
      {port(id, label, 'image')}<span>{label}</span><InputConnectionBadge status={status} />
      {index !== undefined ? <input aria-label={`Описание референса ${index + 1}`} disabled={locked} value={data.referenceDescriptions[index] ?? ''} maxLength={2000}
        placeholder="Что сохранить: герой, стиль, место…" onChange={(event) => {
          const values = [...data.referenceDescriptions]; values[index] = event.target.value; settings({ referenceDescriptions: values });
        }} /> : null}
    </div>;
  };
  const resultId = data.resultAssetIds[data.activeResultIndex] ?? data.resultAssetIds.at(-1);
  const scope = getActiveAssetScope();
  const waitingPhase = data.videoRequest?.jobId ? (execution.progress.startsWith('В очереди') ? 'queued' : 'running') : 'submitting';
  return <>
    <NodeTitle title={data.title} nodeType="generateVideo" muted action={<TextNodeTitleActions collapsed={isCollapsed} onCollapsedChange={setCollapsed} />} />
    {isCollapsed ? <div className="video-generation-collapsed">{port('prompt', 'Prompt', 'text', 20)}{port('video', 'Video', 'video', 20)}
      {activeImageInputs.map(({ id, label }, i) => <span key={id}>{port(id, label, 'image', 48 + i * 22)}</span>)}</div> : <>
      <div className="video-generation-body" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
        <fieldset disabled={locked} className="video-generation-settings">
          <legend>Settings</legend>
          <ModelSettingRow modality="video" disabled={locked} label="Model" value={data.model} options={models.map((item) => ({ value: item.key, label: getVideoModelDisplayName(item.key, item.label), icon: <VideoModelLogo modelKey={item.key} /> }))} wide onChange={(key) => {
            const next = models.find((item) => item.key === key); if (!next) return;
            settings({ model: key, duration: next.durations.includes(data.duration) ? data.duration : next.durations[0],
              resolution: next.resolutions.includes(data.resolution) ? data.resolution : next.resolutions[0],
              aspectRatio: next.aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : next.aspectRatios[0],
              mode: isVideoModeAvailable(data.mode, next) ? data.mode : 'text',
              generateAudio: next.audio && data.generateAudio, seed: next.seed ? data.seed : undefined });
          }} />
          <SettingRow label="Mode" value={data.mode} options={[...modeOptions]} onChange={(mode) => settings({ mode: mode as GenerateVideoNodeData['mode'] })} wide />
          {model ? <>
            <SettingRow label="Duration" value={String(data.duration)} options={model.durations.map((n) => ({ value: String(n), label: `${n} s` }))} onChange={(value) => settings({ duration: Number(value) })} />
            <SettingRow label="Resolution" value={data.resolution} options={model.resolutions.map((value) => ({ value, label: value }))} onChange={(resolution) => settings({ resolution })} />
            <AspectRatioSelector key={data.model} value={data.aspectRatio} availableRatios={model.aspectRatios}
              catalogRatios={models.flatMap((item) => item.aspectRatios)} disabled={locked}
              onChange={(aspectRatio) => settings({ aspectRatio })}
              getResolution={(ratio) => getVideoOutputResolution(model, ratio, data.resolution)} />
            {model.audio ? <SettingRow label="Audio" value={String(data.generateAudio)} options={[{ value: 'false', label: 'Без звука' }, { value: 'true', label: 'Со звуком' }]} onChange={(value) => settings({ generateAudio: value === 'true' })} /> : null}
            {model.seed ? <label className="video-seed">Seed<input type="number" min={0} max={2147483647} placeholder="Случайный" aria-label="Video seed" value={data.seed ?? ''} onChange={(event) => settings({ seed: event.target.value === '' ? undefined : Number(event.target.value) })} /></label> : null}
          </> : <button type="button" onClick={reload}>Обновить каталог</button>}
        </fieldset>
      </div>
      <CollapsibleSection title="Prompt" className="text-node-section" sidePort={port('prompt', 'Prompt', 'text')} dropTarget={{ nodeId: node.id, portId: 'prompt' }}>
        <textarea aria-label="Video prompt" data-text-field="prompt" className="prompt-box video-generation-prompt" disabled={locked} maxLength={20_000} value={data.prompt}
          placeholder="Сцена, движение героя и камеры, действие, атмосфера…" onPointerDown={(event) => event.stopPropagation()} onChange={(event) => settings({ prompt: event.target.value })} />
      </CollapsibleSection>
      <div className="video-generation-body" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
        {activeImageInputs.map(({ id, label, referenceIndex }) => imageRow(id, label, referenceIndex))}
        <div className="video-generation-actions">
          <ProTooltip label={node.locked ? 'Нода заблокирована' : !execution.hasScope ? 'Сохраните проект перед генерацией' : data.videoRequest ? 'Сначала завершите или отпустите текущий запрос' : visibleError || 'Создать видео — платная генерация'}>
            <PrimaryActionButton disabled={locked || !execution.hasScope || Boolean(error)} icon={busy ? <Loader2 size={15} className="spin" /> : <Clapperboard size={15} />} onClick={() => void execution.start(collectVideoRequest(node.id, data, { nodes, edges, assets }))}>Generate video</PrimaryActionButton>
          </ProTooltip>
          {data.videoRequest ? <>
            <ProTooltip label="Проверить состояние текущего запроса"><button className="video-generation-icon-button" type="button" aria-label="Проверить результат" disabled={busy} onClick={() => void execution.check()}><RefreshCw size={15} className={busy ? 'spin' : undefined} /></button></ProTooltip>
            {data.videoRequest.jobId ? <ProTooltip label="Отменить ожидание. Уже отправленный запрос может продолжиться у поставщика и быть оплачен."><button className="video-generation-icon-button" type="button" aria-label="Отменить ожидание" onClick={() => void execution.cancel()}><Square size={14} /></button></ProTooltip> : null}
            {!busy ? <ProTooltip label="Подготовить новый запрос. Новая генерация оплачивается отдельно."><button className="video-generation-icon-button" type="button" aria-label="Новый запрос" onClick={() => void execution.release()}><Plus size={16} /></button></ProTooltip> : null}
          </> : null}
        </div>
        {execution.progress ? <p className="video-generation-status" role="status">{execution.progress}</p> : null}
        {visibleError ? <p className="video-generation-status video-generation-error" role="alert">{visibleError}</p> : null}
      </div>
      <CollapsibleSection title="Result" className="text-node-section" sidePort={port('video', 'Video', 'video')}>
        <div className="video-generation-result" onPointerDown={(event) => event.stopPropagation()}>
          <ImagePlate
            activeIndex={data.activeResultIndex}
            assetId={resultId}
            assetIds={data.resultAssetIds}
            aspectRatio={formatVideoAspectRatio(data.aspectRatio)}
            loading={busy}
            outputPending={busy}
            mediaKind="video"
            navigationLabels={{ previous: 'Previous video', next: 'Next video' }}
            onActiveIndexChange={(activeResultIndex) => update(node.id, { activeResultIndex })}
            previewMedia={resultId && scope ? <video
              key={resultId}
              className="video-generation-preview"
              controls={!busy}
              playsInline
              poster={getRemoteAssetContentUrl(resultId, 'thumbnail')}
              preload="metadata"
              src={getRemoteAssetContentUrl(resultId)}
              onClick={(event) => event.stopPropagation()}
            /> : <div className="video-generation-placeholder" role="img" aria-label="Место для будущего видео"><Clapperboard size={28} aria-hidden="true" /></div>}
            renderLoadingOverlay={() => <GenerationWaitingExperience kind="video" phase={waitingPhase} seed={data.videoRequest?.jobId ?? data.videoRequest?.idempotencyKey ?? node.id} />}
            viewerMedia={resultId && scope ? <video
              className="image-viewer-media library-video-player"
              controls
              playsInline
              poster={getRemoteAssetContentUrl(resultId, 'thumbnail')}
              preload="metadata"
              src={getRemoteAssetContentUrl(resultId)}
            /> : undefined}
          />
        </div>
      </CollapsibleSection>
    </>}
  </>;
}

function isVideoModeAvailable(mode: GenerateVideoNodeData['mode'], model: VideoModelCapabilities) {
  if (mode === 'frames') return model.firstFrame;
  if (mode === 'references') return model.references;
  return true;
}

function getActiveVideoImageInputs(mode: GenerateVideoNodeData['mode'], model?: VideoModelCapabilities): ActiveVideoImageInput[] {
  if (mode === 'frames') return [
    { id: 'first-frame', label: 'First frame' },
    ...(model?.lastFrame === false ? [] : [{ id: 'last-frame', label: 'Last frame' }]),
  ];
  if (mode === 'references') return Array.from({ length: VIDEO_REFERENCE_LIMIT }, (_, referenceIndex) => ({
    id: `reference-${referenceIndex + 1}`,
    label: `Reference ${referenceIndex + 1}`,
    referenceIndex,
  }));
  return [];
}

function formatVideoAspectRatio(value: string) {
  const [width, height] = value.split(':').map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : '16 / 9';
}
