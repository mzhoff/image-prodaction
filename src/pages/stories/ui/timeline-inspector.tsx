'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useState } from 'react';
import type { TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import type { MontageSlot } from '@/modules/story-projects/contracts/timeline-production';
import { timelineVideoPositions, timelineVideoLanes, reorderPrimaryClips, PRIMARY_VIDEO_TRACK } from '@/modules/story-projects/core/timeline-video';
import { normalizeAudioLanes, timelineAudioLanes } from '@/modules/story-projects/core/timeline-track-editing';
import { placeTimelineClip } from '@/modules/story-projects/core/timeline-placement';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { TimelineSelection } from '../model/timeline-selection';
import styles from './timeline-workspace.module.css';

export function TimelineInspector({ snapshot, slots, selection, onUnlink, onExtractAudio, onChange, onVideoChange, onResizeVideo, onResizeAudio, onResizeSlot, onError }: {
  onExtractAudio(id: string): void; onUnlink(kind: 'video' | 'audio', id: string): void; snapshot: TimelineSnapshot; slots?: MontageSlot[]; selection: TimelineSelection;
  onChange(value: TimelineSnapshot): void; onVideoChange(clips: TimelineSnapshot['clips']): void;
  onResizeVideo(id: string, duration: number): void; onResizeAudio(id: string, duration: number): void;
  onResizeSlot(index: number, duration: number): void; onError(message: string): void;
}) {
  const tUi = useTranslations();
  const video = selection?.kind === 'video' ? snapshot.clips.find((clip) => clip.id === selection.id) : undefined;
  const videoTrack = selection?.kind === 'videoTrack' ? snapshot.videoTracks?.find((track) => track.id === selection.id) : undefined;
  const primary = [...snapshot.clips].filter((clip) => !clip.trackId).sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  const moveVideo = (id: string, track: string, at: number) => { try { const placed = placeTimelineClip(snapshot, 'video', id, track, at); if (placed) onChange(placed.snapshot); } catch (error) { onError(error instanceof Error ? error.message : tUi("Не удалось переместить клип.")); } };
  const audio = selection?.kind === 'audio' ? snapshot.audioClips?.find((clip) => clip.id === selection.id) : undefined;
  const slot = selection?.kind === 'grid' ? slots?.find((item) => item.id === selection.id) : undefined;
  const track = selection?.kind === 'track' ? timelineAudioLanes(snapshot).find((item) => item.id === selection.id) : undefined;
  const audioChange = (patch: Partial<NonNullable<TimelineSnapshot['audioClips']>[number]>) => onChange({ ...snapshot, audioClips: snapshot.audioClips?.map((clip) => clip.id === audio?.id ? { ...clip, ...patch } : clip) });
  const moveAudio = (trackId: string, startMs: number) => { if (!audio) return; try { const placed = placeTimelineClip(snapshot, 'audio', audio.id, trackId, startMs); if (placed) onChange(placed.snapshot); } catch (error) { onError(error instanceof Error ? error.message : tUi("Не удалось переместить звук.")); } };
  return <div className={styles.inspector} aria-label={tUi("Свойства выбранного фрагмента")}>
    {video ? <><h2>{tUi("Клип")}{' '} {(video.trackId ? snapshot.clips.filter((clip) => clip.trackId === video.trackId) : primary).indexOf(video) + 1}</h2><p className={styles.hint}>{tUi("Меняется диапазон в исходнике. Сам файл остаётся целым.")}</p>
      <BrandSelect label={tUi("Видеодорожка")} value={video.trackId ?? PRIMARY_VIDEO_TRACK} options={timelineVideoLanes(snapshot).map((track) => ({ value: track.id, label: track.name }))} onChange={(track) => moveVideo(video.id, track, timelineVideoPositions(snapshot).find((clip) => clip.id === video.id)!.startMs)} />
      <TimeField label={tUi("Положение видео, сек.")} value={timelineVideoPositions(snapshot).find((clip) => clip.id === video.id)!.startMs} min={0} onChange={(at) => moveVideo(video.id, video.trackId ?? PRIMARY_VIDEO_TRACK, at)} />
      <TimeField label={tUi("Начало в исходнике, сек.")} value={video.sourceInMs} min={0} disabled={video.kind === 'image'} onChange={(sourceInMs) => onVideoChange(snapshot.clips.map((clip) => clip.id === video.id ? { ...clip, sourceInMs } : clip))} />
      <TimeField label={tUi("Длительность клипа, сек.")} value={video.durationMs} min={0.1} onChange={(value) => onResizeVideo(video.id, value)} />
      <label className={styles.checkbox}><input type="checkbox" checked={snapshot.lockedClipIds?.includes(video.id) ?? false} onChange={(event) => onChange({ ...snapshot, lockedClipIds: event.target.checked ? [...(snapshot.lockedClipIds ?? []), video.id] : snapshot.lockedClipIds?.filter((id) => id !== video.id) })} />{tUi("Закрепить для автомонтажа")}</label>
      {!video.trackId ? <div className={styles.buttons}><button type="button" disabled={primary.indexOf(video) === 0} onClick={() => onVideoChange(reorderPrimaryClips(snapshot.clips, video.id, primary.indexOf(video) - 1))}>{tUi("← Раньше")}</button><button type="button" disabled={primary.indexOf(video) === primary.length - 1} onClick={() => onVideoChange(reorderPrimaryClips(snapshot.clips, video.id, primary.indexOf(video) + 1))}>{tUi("Позже →")}</button></div> : null}
      {video.kind === 'video' && !video.sourceAudioMuted ? <button type="button" onClick={() => onExtractAudio(video.id)}>{tUi("Отделить звук на аудиодорожку")}</button> : null}
      <button type="button" onClick={() => onVideoChange(snapshot.clips.filter((clip) => clip.id !== video.id))}>{tUi("Убрать клип")}</button>
    </> : null}
    {audio ? <><h2>{tUi("Аудиофрагмент")}</h2><BrandSelect label={tUi("Аудиодорожка")} value={audio.trackId ?? audio.id} onChange={(id) => moveAudio(id, audio.startMs)} options={timelineAudioLanes(snapshot).map((item) => ({ value: item.id, label: item.name }))} />
      <TimeField label={tUi("На таймлайне, сек.")} value={audio.startMs} min={0} onChange={(startMs) => moveAudio(audio.trackId ?? audio.id, startMs)} />
      <TimeField label={tUi("Начало аудио в исходнике, сек.")} value={audio.sourceInMs} min={0} onChange={(sourceInMs) => audioChange({ sourceInMs })} />
      <TimeField label={tUi("Длительность аудио, сек.")} value={audio.durationMs} min={0.1} onChange={(value) => onResizeAudio(audio.id, value)} />
      <label>{tUi("Громкость ·")}{' '} {Math.round(audio.gain * 100)}%<input type="range" min={0} max={1} step={0.05} value={Math.min(1, audio.gain)} onChange={(event) => audioChange({ gain: Number(event.target.value) })} /></label>
      <BrandSelect label={tUi("Назначение звука")} value={audio.role ?? 'effect'} onChange={(role) => audioChange({ role: role as 'music' | 'voice' | 'effect' })} options={[{ value: 'music', label: tUi("Музыка") }, { value: 'voice', label: tUi("Голос") }, { value: 'effect', label: tUi("Звуки") }]} />
      <button type="button" onClick={() => { const next = normalizeAudioLanes(snapshot); onChange({ ...next, audioClips: next.audioClips?.filter((clip) => clip.id !== audio.id) }); }}>{tUi("Убрать аудио с дорожки")}</button>
    </> : null}
    {slot && slots ? <><h2>{tUi("Ячейка")}{' '} {slots.indexOf(slot) + 1}</h2><p className={styles.hint}>{tUi("Это место для будущего кадра. При изменении границы соседняя ячейка подстроится; общая длина останется прежней.")}</p>
      <TimeField label={tUi("Длительность ячейки, сек.")} value={slot.durationMs} min={0.1} disabled={Boolean(slot.lockedClipId || !slots[slots.indexOf(slot) + 1] || slots[slots.indexOf(slot) + 1]?.lockedClipId)} onChange={(value) => onResizeSlot(slots.indexOf(slot), value)} />
      <p>{slot.lockedClipId ? tUi("Закреплённый клип защищён.") : tUi("После проверки ритма нажмите «Запустить AI-автомонтаж».")}</p></> : null}
    {track ? <><h2>{tUi("Аудиодорожка")}</h2><label>{tUi("Название")}<input key={track.id} aria-label={tUi("Название аудиодорожки")} maxLength={80} defaultValue={track.name} onBlur={(event) => { const next = normalizeAudioLanes(snapshot); const name = event.target.value.trim() || track.name; onChange({ ...next, audioTracks: next.audioTracks?.map((item) => item.id === track.id ? { ...item, name } : item) }); }} /></label>
      <p className={styles.hint}>{tUi("Порядок можно менять перетаскиванием названия или стрелками рядом с дорожкой.")}</p><button type="button" onClick={() => { const next = normalizeAudioLanes(snapshot); onChange({ ...next, audioTracks: next.audioTracks?.filter((item) => item.id !== track.id), audioClips: next.audioClips?.filter((clip) => clip.trackId !== track.id) }); }}>{tUi("Удалить дорожку со звуком")}</button></> : null}
    {videoTrack ? <><h2>{tUi("Видеодорожка")}</h2><label>{tUi("Название")}<input key={videoTrack.id} aria-label={tUi("Название видеодорожки")} maxLength={80} defaultValue={videoTrack.name} onBlur={(event) => { const name = event.target.value.trim() || videoTrack.name; onChange({ ...snapshot, videoTracks: snapshot.videoTracks?.map((track) => track.id === videoTrack.id ? { ...track, name } : track) }); }} /></label>
      <p className={styles.hint}>{tUi("Верхние дорожки перекрывают нижние. Пустые участки показывают кадры снизу. Переносите клипы мышью или через их свойства.")}</p>
      <button type="button" disabled={snapshot.clips.some((clip) => clip.trackId === videoTrack.id)} onClick={() => onChange({ ...snapshot, videoTracks: snapshot.videoTracks?.filter((track) => track.id !== videoTrack.id) })}>{tUi("Удалить пустую видеодорожку")}</button></> : null}
    {!video && !audio && !slot && !track && !videoTrack ? <><h2>{tUi("Свойства")}</h2><p className={styles.hint}>{tUi("Выберите кадр, аудиофрагмент или ячейку ритма на шкале времени.")}</p></> : null}
    {(video && snapshot.audioClips?.some((clip) => clip.linkedVideoClipId === video.id)) || audio?.linkedVideoClipId ? <button type="button" onClick={() => onUnlink(video ? 'video' : 'audio', video?.id ?? audio!.id)}>{tUi("Открепить звук от видео")}</button> : null}
    <label>{tUi("Звук исходных видео ·")}{' '} {Math.round((snapshot.sourceAudioGain ?? 1) * 100)}%<input type="range" min={0} max={1} step={0.05} value={Math.min(1, snapshot.sourceAudioGain ?? 1)} onChange={(event) => onChange({ ...snapshot, sourceAudioGain: Number(event.target.value) })} /></label>
  </div>;
}

function TimeField({ label, value, min, disabled, onChange }: { label: string; value: number; min: number; disabled?: boolean; onChange(value: number): void }) {
  const [text, setText] = useState(String(value / 1000));
  useEffect(() => setText(String(value / 1000)), [value]);
  const apply = () => { const number = Number(text); if (text.trim() && Number.isFinite(number) && number >= min) onChange(Math.round(number * 1000)); setText(String(value / 1000)); };
  return <label>{label}<input type="number" step={0.01} min={min} value={text} disabled={disabled} onChange={(event) => setText(event.target.value)} onBlur={apply} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
