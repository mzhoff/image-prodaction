'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useState, type RefObject } from 'react';
import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { ArrowUpToLine, ChevronLeft, ChevronRight, Pause, Play, Redo2, Undo2 } from '@prodactionpro/ui-core/icons';
import { lastTimelineFrame, timelineFrameStep, timelineSceneStep, timelineTimecode } from '../model/timeline-navigation';
import styles from './timeline-transport.module.css';

export interface TimelineHistory { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void }

export function TimelineTransport({ clock, playing, duration, frameRate, sceneStarts, playable, disabled, history, onSeek, onPlay }: {
  clock: RefObject<{ timeMs: number; running: boolean }>; playing: boolean; duration: number; frameRate: number;
  sceneStarts: number[]; playable: boolean; disabled: boolean; history: TimelineHistory; onSeek(time: number): void; onPlay(): void;
}) {
  const tUi = useTranslations();
  const [time, setTime] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => { setTime(Math.round(clock.current.timeMs * frameRate / 1000) * 1000 / frameRate); frame = requestAnimationFrame(tick); };
    tick(); return () => cancelAnimationFrame(frame);
  }, [clock, frameRate]);
  const atStart = !playable || time < 0.01, atEnd = !playable || time >= lastTimelineFrame(duration, frameRate) - 0.01;
  return <div className={styles.transport} role="group" aria-label={tUi("Управление воспроизведением и историей")}>
    <div className={styles.buttons}>
      <IconButton size="xs" icon={<Undo2 />} aria-label={tUi("Отменить изменение")} title={tUi("Отменить изменение")} disabled={disabled || !history.canUndo} onClick={history.undo} />
      <IconButton size="xs" icon={<Redo2 />} aria-label={tUi("Повторить изменение")} title={tUi("Повторить изменение")} disabled={disabled || !history.canRedo} onClick={history.redo} />
      <span className={styles.separator} />
      <IconButton size="xs" icon={<ArrowUpToLine style={{ transform: 'rotate(-90deg)' }} />} aria-label={tUi("В начало")} title={tUi("В начало таймлайна")} disabled={atStart} onClick={() => onSeek(0)} />
      <IconButton size="xs" icon={<span className={styles.sceneIcon} style={{ maskImage: 'url(/figma/timeline-handoff/shot-start.svg)' }} />} aria-label={tUi("Предыдущая сцена")} title={tUi("К предыдущей границе сцены")} disabled={atStart} onClick={() => onSeek(timelineSceneStep(clock.current.timeMs, -1, sceneStarts, duration, frameRate))} />
      <IconButton size="xs" icon={<ChevronLeft />} aria-label={tUi("Предыдущий кадр")} title={tUi("На один кадр назад")} disabled={atStart} onClick={() => onSeek(timelineFrameStep(clock.current.timeMs, -1, duration, frameRate))} />
      <IconButton size="xs" intent="neutral" appearance="solid" icon={playing ? <Pause /> : <Play />} aria-label={playing ? tUi("Пауза") : tUi("Воспроизвести")} title={playing ? tUi("Пауза") : tUi("Воспроизвести")} disabled={!playable} onClick={onPlay} />
      <IconButton size="xs" icon={<ChevronRight />} aria-label={tUi("Следующий кадр")} title={tUi("На один кадр вперёд")} disabled={atEnd} onClick={() => onSeek(timelineFrameStep(clock.current.timeMs, 1, duration, frameRate))} />
      <IconButton size="xs" icon={<span className={styles.sceneIcon} style={{ maskImage: 'url(/figma/timeline-handoff/shot-end.svg)' }} />} aria-label={tUi("Следующая сцена")} title={tUi("К следующей границе сцены")} disabled={atEnd} onClick={() => onSeek(timelineSceneStep(clock.current.timeMs, 1, sceneStarts, duration, frameRate))} />
      <IconButton size="xs" icon={<ArrowUpToLine style={{ transform: 'rotate(90deg)' }} />} aria-label={tUi("В конец")} title={tUi("К последнему кадру таймлайна")} disabled={atEnd} onClick={() => onSeek(lastTimelineFrame(duration, frameRate))} />
    </div>
    <output className={styles.clock} aria-label={tUi("Позиция воспроизведения")} aria-live="off">{timelineTimecode(time, frameRate)}<span> / {timelineTimecode(duration, frameRate)}</span></output>
  </div>;
}
