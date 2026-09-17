'use client';

import { Button } from '@prodactionpro/ui-core/button';
import { SliderField } from '@prodactionpro/ui-core/slider';
import { Clapperboard, X } from '@prodactionpro/ui-core/icons';
import { useState, type PointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { TIMELINE_MODEL_OPTIONS } from '@/shared/api/timeline-models';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { ProcessIndicator } from '@/shared/ui/process-indicator';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { SettingRow } from '@/shared/ui/setting-row';
import { useNodeDisplayState } from '../model/use-node-display-state';
import { useTimelineNodeModel } from '../model/use-timeline-node-model';
import { NodeTitle, TextNodeTitleActions } from './node-title';
import { PortButton } from './port-button';
import { TimelineDescription } from './timeline-description';
import { TimelineFullscreen } from './timeline-fullscreen';
import { TimelineMedia } from './timeline-media';
import './timeline-node-shell.css';

interface Props { node: ProductionNode; onStartConnection: (nodeId: string, portId: string, event: PointerEvent<HTMLButtonElement>) => void }
const LANGUAGES = [{ value: 'system', label: 'Язык приложения' }, { value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' }, { value: 'de', label: 'Deutsch' }, { value: 'fr', label: 'Français' }];
const SENSITIVITY = [{ value: 0, label: 'Низкая' }, { value: 50, label: 'Обычная' }, { value: 100, label: 'Высокая' }];
const sensitivityValue = (threshold: number) => threshold >= 10 ? 60 - Math.min(60, threshold) : 50 + (10 - Math.max(1, threshold)) * 50 / 9;
const sensitivityThreshold = (value: number) => Math.round(value <= 50 ? 60 - value : 10 - (value - 50) * 9 / 50);
const STAGES = { reading: 'Читаем видео', indexing: 'Находим точные кадры', detecting: 'Ищем смены сцен', finalizing: 'Подготавливаем фрагменты' };

export function TimelineHandoffNode({ node, onStartConnection }: Props) {
  const model = useTimelineNodeModel(node);
  const { isCollapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [fullscreen, setFullscreen] = useState(false);
  const { analysis, shot, workspaceId, analysisProgress } = model;
  const inputEdge = useProductionGraphStore((state) => state.edges.find((edge) => edge.targetNodeId === node.id && edge.targetPortId === 'video'));
  const deleteEdge = useProductionGraphStore((state) => state.deleteEdge);
  const port = (id: 'video' | 'videoResult' | 'frames' | 'descriptions' | 'timeline', header = false) => <PortButton nodeId={node.id} portId={id}
    side={id === 'video' ? 'input' : 'output'} kind={id === 'frames' ? 'image' : id === 'descriptions' ? 'text' : id === 'timeline' ? 'json' : 'video'}
    label={id === 'video' ? 'Video' : id === 'videoResult' ? 'Fragments' : id === 'frames' ? 'Frames' : id === 'descriptions' ? 'Descriptions' : 'Timeline'}
    onStartConnection={onStartConnection} className={header ? undefined : 'node-port-section'}
    style={header ? { top: 20 + (id === 'video' ? 0 : ['videoResult', 'frames', 'descriptions', 'timeline'].indexOf(id) * 24) } : undefined} />;
  const analyzing = Boolean(model.data.request?.action === 'analyze');
  return <>
    <NodeTitle title={model.data.title} nodeType="timelineHandoff" muted action={<TextNodeTitleActions collapsed={isCollapsed} count={analysis ? String(analysis.shots.length) : undefined} onCollapsedChange={setCollapsed} />} />
    {isCollapsed ? <>{port('video', true)}{port('videoResult', true)}{port('frames', true)}{port('descriptions', true)}{port('timeline', true)}</> : <>
      <CollapsibleSection title="Video input" className="text-node-section timeline-input-section" sidePort={port('video')} dropTarget={{ nodeId: node.id, portId: 'video' }}>
        <div className="timeline-input-badge-row">
          {inputEdge ? <span className="timeline-input-badge" title={model.source?.name}>
            <span>{model.source?.name ?? 'Видео подключено'}</span>
            <button type="button" aria-label="Отключить видео" data-node-interactive
              onPointerDown={(event) => event.stopPropagation()} onClick={() => deleteEdge(inputEdge.id)}><X size={12} /></button>
          </span> : <span className="timeline-input-placeholder">Подключите видео</span>}
        </div>
      </CollapsibleSection>
      <div className="timeline-body" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
        <fieldset disabled={model.locked} className="timeline-settings timeline-analysis-settings">
          <SliderField label="Чувствительность" thumbAriaLabel="Чувствительность смены сцен" className="timeline-sensitivity"
            domain={{ min: 0, max: 100 }} step={1} value={sensitivityValue(model.data.threshold)}
            format={{ kind: 'semantic', mode: 'continuous', options: SENSITIVITY }} ticks={SENSITIVITY}
            showTicks={false} showScale disabled={model.locked}
            onValueChange={(value) => model.settings({ threshold: sensitivityThreshold(value) })} />
          <Button intent="neutral" appearance={analysis ? 'outline' : 'solid'} size="md"
            className="timeline-analyze-button" leadingIcon={<Clapperboard size={16} />}
            disabled={model.locked || !model.source || !workspaceId} onClick={() => void model.start('analyze')}>
            {analyzing ? 'Анализируем…' : analysis ? 'Анализировать снова' : 'Анализ'}
          </Button>
        </fieldset>
        {model.data.request ? <ProcessIndicator className="timeline-process" label="Обработка Timeline"
          title={analyzing ? 'Анализ видео' : 'Создаём описания'}
          description={analyzing && analysisProgress ? STAGES[analysisProgress.phase] : model.progress || 'Ожидаем начала обработки'}
          completed={analyzing ? analysisProgress?.processedMs : model.descriptionProgress?.completed} total={analyzing ? analysisProgress?.totalMs : model.descriptionProgress?.total}
          countLabel={analyzing && analysisProgress?.totalMs ? Math.min(99, Math.floor(analysisProgress.processedMs / analysisProgress.totalMs * 100)) + '%'
            : model.descriptionProgress ? model.descriptionProgress.completed + ' / ' + model.descriptionProgress.total : undefined}
          estimatedRemainingMs={analyzing ? analysisProgress?.estimatedRemainingMs : model.descriptionProgress?.estimatedRemainingMs}
          actions={<>
            {!model.busy ? <button type="button" onClick={() => void model.check()}>Проверить результат</button> : null}
            {model.data.request.jobId ? <button type="button" onClick={() => void model.cancel()}>Отменить</button> : null}
            {!model.busy && model.data.request.jobId ? <button type="button" onClick={() => void model.release()}>Завершить запрос</button> : null}
          </>} /> : null}
        {model.data.message ? <p className="timeline-hint timeline-warning" role="alert">{model.data.message}</p> : null}
      </div>
      {analyzing ? <div className="timeline-analysis-skeleton" aria-label="Подготавливаем предпросмотр" aria-busy="true">
        <div className="timeline-skeleton-player" /><div className="timeline-skeleton-toolbar" />
        <div className="timeline-skeleton-frames"><span /><span /><span /></div>
      </div> : null}
      {!analyzing && analysis && shot && workspaceId ? <>
        <div className="timeline-body timeline-output-scope" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
          <SettingRow label="Выходы" value={model.data.outputScope ?? 'selected'}
            options={[{ value: 'selected', label: 'Выбранный фрагмент' }, { value: 'all', label: 'Вся серия' }]}
            onChange={(value) => model.settings({ outputScope: value === 'all' ? 'all' : 'selected' })} wide />
        </div>
        <CollapsibleSection title="Фрагменты" className="text-node-section timeline-fragments-section" sidePort={port('videoResult')}>
          <div className="timeline-review">
            {!fullscreen ? <TimelineMedia key={shot.id} nodeId={node.id} analysis={analysis} shot={shot} workspaceId={workspaceId} disabled={model.locked}
              previewMode={model.data.previewMode} onPreviewMode={(previewMode) => model.settings({ previewMode })} onEdit={model.edit}
              onSelectShot={model.select} onFullscreen={() => setFullscreen(true)} framesSidePort={port('frames')} /> : null}
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Описания" className="text-node-section" sidePort={port('descriptions')}>
          <div className="timeline-review">
            <fieldset disabled={model.locked} className="timeline-settings">
              <SettingRow label="Пресет" value="simple" options={[{ value: 'simple', label: 'Простой' }]} onChange={() => undefined} />
              <SettingRow label="Модель" value={model.data.model} options={[...TIMELINE_MODEL_OPTIONS]} onChange={(value) => model.settings({ model: value })} wide />
              <SettingRow label="Язык" value={model.data.language || 'system'} options={LANGUAGES} onChange={(value) => model.settings({ language: value === 'system' ? undefined : value })} />
            </fieldset>
            <Button intent="neutral" appearance="soft" size="md" className="timeline-describe-current" disabled={model.locked}
              onClick={() => void model.start('describe', shot.id)}>Описать этот фрагмент</Button>
            <PrimaryActionButton disabled={model.locked} onClick={() => void model.start('describe')}>
              {'Создать все описания · ' + analysis.shots.length}
            </PrimaryActionButton>
            <TimelineDescription shot={shot} model={model} hideAction />
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="Timeline" className="text-node-section timeline-document-section" sidePort={port('timeline')} defaultOpen={false}>
          <p className="timeline-hint timeline-body">Вся серия: фрагменты, кадры и описания.</p>
        </CollapsibleSection>
        {model.outputs.busy ? <p className="timeline-hint timeline-body" role="status">Подготавливаем видео и кадры для выходов…</p> : null}
        {model.outputs.error ? <div className="timeline-warning timeline-output-error" role="alert">{model.outputs.error}
          <Button appearance="outline" intent="neutral" size="sm" onClick={model.outputs.retry}>Повторить</Button></div> : null}
      </> : null}
    </>}
    {fullscreen && analysis && workspaceId ? <TimelineFullscreen nodeId={node.id} model={model} onClose={() => setFullscreen(false)} /> : null}
  </>;
}
