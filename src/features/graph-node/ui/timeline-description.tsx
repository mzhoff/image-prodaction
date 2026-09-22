'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { MAX_TIMELINE_DESCRIPTION_CHARACTERS, timelineShotFingerprint, type TimelineShot } from '@/shared/media/timeline-contracts';
import { PromptBox } from '@/shared/ui/prompt-box';
import type { TimelineNodeModel } from '../model/use-timeline-node-model';

export function TimelineDescription({ shot, model, hideAction = false }: { shot: TimelineShot; model: TimelineNodeModel; hideAction?: boolean }) {
  const tUi = useTranslations();
  const stale = Boolean(shot.description && shot.describedFingerprint && shot.describedFingerprint !== timelineShotFingerprint(shot));
  return <div className="timeline-description" data-node-interactive onPointerDown={(event) => event.stopPropagation()}>
    <PromptBox ariaLabel={tUi("Описание фрагмента")} value={shot.description} readonly={model.locked} onChange={(text) => model.describeText(shot.id, text)} placeholder={tUi("Описание сцены появится здесь. Его можно отредактировать.")} />
    <div className="timeline-description-footer"><span>{Array.from(shot.description).length}/{MAX_TIMELINE_DESCRIPTION_CHARACTERS}</span>
      {!hideAction ? <button type="button" disabled={model.locked} onClick={() => void model.start('describe', shot.id)}>{tUi("Описать этот фрагмент")}</button> : null}</div>
    {stale ? <p className="timeline-hint" role="status">{tUi("Кадры или границы изменились. Проверьте описание.")}</p> : null}
  </div>;
}
