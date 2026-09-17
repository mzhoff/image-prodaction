'use client';

import { Button } from '@prodactionpro/ui-core/button';
import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { Sparkles, X } from '@prodactionpro/ui-core/icons';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { timelineFrameUrl } from '../api/timeline-api';
import { formatTimelineTime, timelineUndescribedShots } from '../model/timeline-node-values';
import type { TimelineNodeModel } from '../model/use-timeline-node-model';
import { TimelineDescription } from './timeline-description';
import { TimelineMedia } from './timeline-media';
import './timeline-fullscreen.css';

export function TimelineFullscreen({ model, onClose, nodeId }: { model: TimelineNodeModel; onClose: () => void; nodeId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRow = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => { activeRow.current?.scrollIntoView({ block: 'nearest' }); }, [model.activeShotIndex]);
  const { analysis, workspaceId } = model;
  if (!analysis || !workspaceId) return null;
  const remaining = timelineUndescribedShots(analysis.shots).length;
  return createPortal(<dialog ref={dialog} className="timeline-fullscreen-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}>
    <header className="timeline-fullscreen-header"><div><h2 id={titleId}>Timeline Handoff</h2><p>Фрагментов: {analysis.shots.length}. Проверьте границы и стоп-кадры перед созданием описаний.</p></div>
      <Button size="sm" appearance="solid" intent="neutral" disabled={model.locked} onClick={() => void model.start('describe', undefined, remaining > 0)}>
        <Sparkles data-icon="inline-start" />{remaining > 0 ? `Описать оставшиеся (${remaining})` : 'Обновить все описания'}
      </Button>
      <IconButton size="sm" icon={<X />} aria-label="Закрыть редактор Timeline" onClick={onClose} autoFocus />
    </header>
    {model.progress || model.data.message ? <div className="timeline-fullscreen-status" role="status">{model.data.message || model.progress}
      {model.data.request?.jobId ? <Button size="sm" onClick={() => void model.cancel()}>Отменить обработку</Button> : null}</div> : null}
    <div className="timeline-fullscreen-table" role="table" aria-label="Фрагменты и описания">
      <div role="row" className="timeline-fullscreen-heading"><span role="columnheader">Видео и стоп-кадры</span><span role="columnheader">Описание</span></div>
      {analysis.shots.map((shot, index) => {
        const selected = model.activeShotIndex === index;
        const first = shot.frames[0]!;
        return <section key={shot.id} ref={selected ? activeRow : undefined} role="row" className="timeline-fullscreen-row" data-active={selected}>
          <div role="cell"><h3><Button size="sm" appearance={selected ? 'soft' : 'ghost'} aria-pressed={selected} onClick={() => model.select(index)}>Фрагмент {index + 1}</Button>
            <span>{formatTimelineTime(shot.startMs)} – {formatTimelineTime(shot.endMs)} · {((shot.endMs - shot.startMs) / 1000).toFixed(2)} с</span></h3>
            {selected ? <TimelineMedia key={shot.id} analysis={analysis} shot={shot} workspaceId={workspaceId} nodeId={nodeId}
              disabled={model.locked} previewMode={model.data.previewMode} onPreviewMode={(previewMode) => model.settings({ previewMode })} onEdit={model.edit}
              onSelectShot={model.select} onFullscreen={onClose} fullscreen />
              : <button type="button" className="timeline-fullscreen-row-preview" aria-label={`Открыть фрагмент ${index + 1}`} onClick={() => model.select(index)}>
                <img loading="lazy" src={first.assetId ? getRemoteAssetContentUrl(first.assetId) : timelineFrameUrl(workspaceId, analysis.sourceAssetId, first.timeMs)} alt={`Фрагмент ${index + 1}`} /><span>Открыть видео и редактировать кадры</span>
              </button>}
          </div>
          <div role="cell"><TimelineDescription shot={shot} model={model} /></div>
        </section>;
      })}
    </div>
  </dialog>, document.body);
}
