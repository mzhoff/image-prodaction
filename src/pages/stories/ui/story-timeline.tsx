'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Bot, LibraryBig, PanelRight, SlidersHorizontal, AudioLines, Layout, Film, AlignCenterVertical } from '@prodactionpro/ui-core/icons';
import { Slider } from '@prodactionpro/ui-core/slider';
import { timelineSeekTime } from '../model/timeline-navigation';
import { TimelineTransport, type TimelineHistory } from './timeline-transport';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import { createUuidV7 } from '@/shared/lib/id';
import { timelineSnapshotSchema, type TimelineDocument, type TimelineSnapshot } from '@/modules/story-projects/contracts/story-timeline';
import { appendTimelineClips, timelineVideoDuration, timelineVideoPositions, timelineVideoSegments, PRIMARY_VIDEO_TRACK } from '@/modules/story-projects/core/timeline-video';
import { timelineClipDurationLimit, timelineInsertionStart } from '@/modules/story-projects/core/timeline-placement';
import { splitTimelineClip } from '@/modules/story-projects/core/timeline-split';
import { timelineAssetName } from '../model/timeline-asset-name';
import { TimelineClipMenu } from './timeline-clip-menu';
import type { ClipMenuTarget } from '../model/timeline-selection';
import { TimelineSplitButton } from './timeline-split-button';
import { clipsFromScenes, normalizeAudioLanes, resizeMontageBoundary, timelineAudioLanes } from '@/modules/story-projects/core/timeline-track-editing';
import { useTimelineProductionLibrary, type TimelineLibraryAsset } from '../model/use-timeline-production-library';
import type { useMontageJob } from '../model/use-montage-job';
import { useTimelineScenes } from '../model/use-timeline-scenes';
import { loadStory, storyRequest } from '../model/story-api';
import { StoryTimelinePreview } from './story-timeline-preview';
import { TimelineAudioTracks } from './timeline-audio-tracks';
import { TimelineMediaLibrary } from './timeline-media-library';
import { TimelinePromoStart } from './timeline-promo-start';
import { TimelineProductionPanel } from './timeline-production-panel';
import { TimelineInspector } from './timeline-inspector';
import { TimelineTracks } from './timeline-tracks';
import type { TimelineSelection } from '../model/timeline-selection';
import { TimelineEmptyPlayback } from './timeline-clock';
import { TimelineAssistantPanel } from './timeline-assistant-panel';
import { TimelinePaneDivider } from './timeline-pane-divider';
import styles from './timeline-workspace.module.css';
import layoutStyles from './timeline-layout.module.css';
import { useTimelineShortcuts } from '../model/use-timeline-shortcuts';
import { prepareTimelineAudio } from '../model/timeline-audio-import';
import { synchronizeTimelineLinks, unlinkTimelineClip } from '@/modules/story-projects/core/timeline-linked-clips';
import { TimelineSideDivider } from './timeline-side-divider';

export function StoryTimeline({ timeline, onChange, onBusy, dirty, disabled, commit, accept, jobs, history, isNew, ensurePersisted }: {
  isNew?: boolean; ensurePersisted?: () => Promise<unknown>;
  history: TimelineHistory;
  jobs: ReturnType<typeof useMontageJob>;
  timeline: TimelineDocument; onChange(snapshot: TimelineSnapshot): void; onBusy(busy: boolean): void; dirty: boolean; disabled: boolean;
  commit(snapshot: TimelineSnapshot): Promise<TimelineDocument>; accept(timeline: TimelineDocument): void;
}) {
  const tUi = useTranslations();
  const language = useFormatLocale();
  const { snapshot } = timeline, clips = snapshot.clips;
  const library = useTimelineProductionLibrary(timeline.workspaceId), scenes = useTimelineScenes(timeline.id, timeline.workspaceId);
  const [selection, setSelection] = useState<TimelineSelection>(null), [previewId, setPreviewId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false), [seekRequest, setSeekRequest] = useState({ timeMs: 0 }), [scale, setScale] = useState(36);
  const [snapping, setSnapping] = useState(true);
  const importing = useRef<AbortController | null>(null);
  useEffect(() => () => importing.current?.abort(), []);
  const [tools, setTools] = useState<'properties' | 'music' | 'assistant'>(isNew ? 'assistant' : snapshot.production ? 'music' : 'properties');
  const [libraryOpen, setLibraryOpen] = useState(true), [toolsOpen, setToolsOpen] = useState(true), [trackHeight, setTrackHeight] = useState(36);
  const [libraryWidth, setLibraryWidth] = useState(250), [toolsWidth, setToolsWidth] = useState(320);
  const [layout, setLayout] = useState<'wide' | 'right' | 'columns'>('wide'), [tracksOpen, setTracksOpen] = useState(true), [assistantExpanded, setAssistantExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200), [expandedWidth, setExpandedWidth] = useState(520);
  useEffect(() => { if (!root.current) return; const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width)); observer.observe(root.current); return () => observer.disconnect(); }, []);
  const expanded = assistantExpanded && toolsOpen && tools === 'assistant';
  const effectiveLibraryWidth = Math.min(libraryWidth, Math.max(200, containerWidth - (toolsOpen ? 276 : 0) - 248));
  const effectiveToolsWidth = Math.min(expanded ? expandedWidth : toolsWidth, Math.max(260, containerWidth - (libraryOpen ? effectiveLibraryWidth + 8 : 0) - 248));
  function resizeSide(side: 'left' | 'right', value: number) {
    const available = root.current?.clientWidth ?? 1200;
    const other = side === 'left' ? (toolsOpen ? effectiveToolsWidth + 8 : 0) : (libraryOpen ? effectiveLibraryWidth + 8 : 0);
    const width = Math.max(side === 'left' ? 200 : 260, Math.min(720, available - other - 248, value));
    if (side === 'left') setLibraryWidth(width); else if (expanded) setExpandedWidth(width); else setToolsWidth(width);
  }

  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [metadata, setMetadata] = useState<Record<string, TimelineLibraryAsset>>({});
  const clock = useRef({ timeMs: 0, running: false });
  const positions = timelineVideoPositions(snapshot), segments = useMemo(() => timelineVideoSegments(snapshot), [snapshot]);
  const selected = segments.find((clip) => `${clip.id}:${clip.startMs}` === previewId) ?? segments[0];
  const videoDuration = timelineVideoDuration(snapshot);
  const [menu, setMenu] = useState<ClipMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const duration = Math.max(videoDuration, snapshot.production?.targetDurationMs ?? 0, ...(snapshot.audioClips ?? []).map((clip) => clip.startMs + clip.durationMs), jobs.slots?.at(-1) ? jobs.slots.at(-1)!.startMs + jobs.slots.at(-1)!.durationMs : 0, 5000);
  const assetFor = (id: string) => library.assets.find((asset) => asset.id === id) ?? metadata[id];
  const selectedAsset = selection?.kind === 'video' ? clips.find((clip) => clip.id === selection.id)?.assetId : selection?.kind === 'audio' ? snapshot.audioClips?.find((clip) => clip.id === selection.id)?.assetId : undefined;
  useEffect(() => {
    if (!selectedAsset) return; const abort = new AbortController();
    void storyRequest<{ asset: TimelineLibraryAsset }>(`/api/assets/${selectedAsset}`, { signal: abort.signal }).then(({ asset }) => { if (!abort.signal.aborted) setMetadata((current) => ({ ...current, [asset.id]: asset })); }).catch(() => undefined);
    return () => abort.abort();
  }, [selectedAsset]);
  function change(next: TimelineSnapshot) {
    setError(''); setPlaying(false);
    try {
      next = synchronizeTimelineLinks(snapshot, next);
      timelineSnapshotSchema.parse(next);
      for (const clip of [...next.clips, ...(next.audioClips ?? [])]) {
        const asset = assetFor(clip.assetId), sourceDuration = asset?.video?.durationSeconds ?? asset?.audio?.durationSeconds;
        if (sourceDuration && !('allowSilentTail' in clip && clip.allowSilentTail) && clip.sourceInMs + clip.durationMs > Math.floor(sourceDuration * 1000)) throw new Error(tUi("Фрагмент выходит за конец исходника. Уменьшите его длину или начало."));
      }
      const view = timelineVideoSegments(next), end = view.at(-1), at = Math.min(clock.current.timeMs, end ? end.startMs + end.durationMs : duration);
      const visible = view.find((clip) => at >= clip.startMs && at < clip.startMs + clip.durationMs) ?? end;
      if (visible) setPreviewId(`${visible.id}:${visible.startMs}`);
      setSeekRequest({ timeMs: visible ? Math.max(0, at - visible.startMs) : at });
      clock.current = { timeMs: at, running: false };
      onChange(next); return true;
    } catch (caught) { setError(caught instanceof Error && 'issues' in caught ? (caught as { issues: { message: string }[] }).issues[0]?.message : caught instanceof Error ? caught.message : tUi("Не удалось изменить монтаж.")); return false; }
  }
  function videoChange(next: TimelineSnapshot['clips']) {
    return change({ ...snapshot, clips: next, lockedClipIds: snapshot.lockedClipIds?.filter((id) => next.some((clip) => clip.id === id)) });
  }
  async function insertVideos(next: TimelineSnapshot, ids: string[], existing = false) {
    if (importing.current) return false;
    const abort = new AbortController(); importing.current = abort;
    onBusy(true); setNotice(tUi("Готовим отдельную звуковую дорожку…"));
    try {
      const prepared = await prepareTimelineAudio(next, ids, timeline.workspaceId, abort.signal);
      if (abort.signal.aborted) return false;
      setMetadata((current) => ({ ...current, ...Object.fromEntries(prepared.assets.map((asset) => [asset.id, asset])) }));
      if (existing && !prepared.snapshot.audioClips?.some((clip) => ids.includes(clip.linkedVideoClipId ?? ''))) { setNotice(tUi("В этом видео нет звука.")); return false; }
      const saved = change(prepared.snapshot); setNotice(''); return saved;
    } catch (caught) { if (!abort.signal.aborted) { setNotice(''); setError(caught instanceof Error ? caught.message : tUi("Не удалось добавить видео со звуком.")); } return false; }
    finally { importing.current = null; if (!abort.signal.aborted) onBusy(false); }
  }

  const quantize = (value: number) => Math.round(Math.round(value * (snapshot.frameRate ?? 30) / 1000) * 1000 / (snapshot.frameRate ?? 30));
  function resizeVideo(id: string, value: number) {
    const clip = clips.find((item) => item.id === id); if (!clip) return;
    const source = assetFor(clip.assetId)?.video?.durationSeconds;
    const length = Math.max(100, Math.min(timelineClipDurationLimit(snapshot, 'video', id), quantize(value), source ? Math.floor(source * 1000) - clip.sourceInMs : 600_000));
    videoChange(clips.map((item) => item.id === id ? { ...item, durationMs: length } : item));
  }
  function resizeAudio(id: string, value: number) {
    const clip = snapshot.audioClips?.find((item) => item.id === id); if (!clip) return;
    const source = clip.allowSilentTail ? undefined : assetFor(clip.assetId)?.audio?.durationSeconds;
    const next = snapshot.audioClips?.filter((item) => item.id !== id && (item.trackId ?? item.id) === (clip.trackId ?? clip.id) && item.startMs > clip.startMs).sort((a, b) => a.startMs - b.startMs)[0];
    const end = 7_200_000;
    const length = Math.max(100, Math.min(quantize(value), timelineClipDurationLimit(snapshot, 'audio', id), end - clip.startMs, next ? next.startMs - clip.startMs : Infinity, source ? Math.floor(source * 1000) - clip.sourceInMs : Infinity));
    change({ ...snapshot, audioClips: snapshot.audioClips?.map((item) => item.id === id ? { ...item, durationMs: length } : item) });
  }
  function resizeSlot(index: number, value: number) { if (!jobs.slots) return; jobs.editSlots(resizeMontageBoundary(jobs.slots, index, jobs.slots[index].startMs + value, snapshot.frameRate ?? 30)); }
  function select(value: TimelineSelection) {
    setPlaying(false); setSelection(value); setTools('properties'); setToolsOpen(true);
    if (value?.kind === 'video') seek(positions.find((clip) => clip.id === value.id)?.startMs ?? 0);
  }
  function seek(value: number) {
    setPlaying(false);
    const at = timelineSeekTime(value, duration, snapshot.frameRate ?? 30), clip = segments.find((item) => at >= item.startMs && at < item.startMs + item.durationMs) ?? segments.at(-1);
    setSeekRequest({ timeMs: clip ? at - clip.startMs : at });
    if (clip) setPreviewId(`${clip.id}:${clip.startMs}`); clock.current = { timeMs: at, running: false };
  }
  function play() {
    if (disabled || importing.current || (!segments.length && !snapshot.audioClips?.length)) return;
    if (playing) { setPlaying(false); return; }
    const end = segments.at(-1), limit = end ? end.startMs + end.durationMs : duration;
    seek(clock.current.timeMs >= limit ? 0 : clock.current.timeMs); setPlaying(true);
  }
  useTimelineShortcuts({ disabled, onPlay: play, history: { ...history, undo: () => { setPlaying(false); history.undo(); }, redo: () => { setPlaying(false); history.redo(); } } });
  const stop = useCallback(() => setPlaying(false), []);
  const complete = useCallback(() => { const index = segments.findIndex((clip) => clip.id === selected?.id && clip.startMs === selected.startMs); if (segments[index + 1]) { const next = segments[index + 1]; setPreviewId(`${next.id}:${next.startMs}`); setSeekRequest({ timeMs: 0 }); } else setPlaying(false); }, [segments, selected?.id, selected?.startMs]);
  function split(kind: 'video' | 'audio', id: string) {
    try { const at = clock.current.timeMs, next = splitTimelineClip(snapshot, kind, id, at, createUuidV7); if (change(next)) { const visible = timelineVideoSegments(next).find((clip) => at >= clip.startMs && at < clip.startMs + clip.durationMs); if (visible) { setPreviewId(`${visible.id}:${visible.startMs}`); setSeekRequest({ timeMs: at - visible.startMs }); } } } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось разрезать клип.")); }
  }
  function addVideoTrack() {
    const id = createUuidV7();
    if (change({ ...snapshot, videoTracks: [...(snapshot.videoTracks ?? []), { id, name: `Видео ${(snapshot.videoTracks?.length ?? 0) + 2}` }] })) select({ kind: 'videoTrack', id });
  }
  function addTrack() {
    const next = normalizeAudioLanes(snapshot), id = createUuidV7();
    change({ ...next, audioTracks: [...next.audioTracks!, { id, name: `Аудио ${next.audioTracks!.length + 1}` }] }); select({ kind: 'track', id });
  }
  async function addAsset(asset: TimelineLibraryAsset, trackId?: string, start = 0) {
    if (disabled || importing.current) return;
    setError('');
    if (asset.mediaKind === 'audio') {
      if (trackId === PRIMARY_VIDEO_TRACK || snapshot.videoTracks?.some((track) => track.id === trackId)) { setError(tUi("Для звука выберите аудиодорожку.")); return; }
      const next = normalizeAudioLanes(snapshot), id = createUuidV7();
      const lane = trackId ?? (selection?.kind === 'track' ? selection.id : next.audioTracks?.find((track) => !next.audioClips?.some((clip) => clip.trackId === track.id))?.id) ?? createUuidV7();
      const durationMs = Math.floor((asset.audio?.durationSeconds ?? 0) * 1000);
      const startMs = timelineInsertionStart(next, 'audio', lane, durationMs, quantize(start));
      if (durationMs < 100 || startMs === null) return;
      change({ ...next, audioTracks: next.audioTracks!.some((track) => track.id === lane) ? next.audioTracks : [...next.audioTracks!, { id: lane, name: `Аудио ${next.audioTracks!.length + 1}` }],
        audioClips: [...next.audioClips!, { id, trackId: lane, assetId: asset.id, startMs, sourceInMs: 0, durationMs, gain: 1, role: 'effect' }] }); select({ kind: 'audio', id });
    } else {
      const lane = trackId ?? (selection?.kind === 'videoTrack' ? selection.id : PRIMARY_VIDEO_TRACK);
      if (lane !== PRIMARY_VIDEO_TRACK && !snapshot.videoTracks?.some((track) => track.id === lane)) { setError(tUi("На аудиодорожку можно положить только звук.")); return; }
      if (asset.mediaKind === 'video' && !asset.video?.browserPlayable) { setError(tUi("Подготовьте браузерную версию видео в Library.")); return; }
      const id = createUuidV7(), durationMs = asset.mediaKind === 'video' ? Math.min(600_000, Math.floor((asset.video?.durationSeconds ?? 0) * 1000)) : 5000;
      const startMs = timelineInsertionStart(snapshot, 'video', lane, durationMs, quantize(start)); if (startMs === null) return;
      const next = { ...snapshot, clips: [...timelineVideoPositions(snapshot), { id, shotId: null, assetId: asset.id, kind: asset.mediaKind, sourceInMs: 0, durationMs, startMs, ...(lane !== PRIMARY_VIDEO_TRACK ? { trackId: lane } : {}) }] };
      const valid = timelineSnapshotSchema.safeParse(next);
      if (!valid.success) { setError(valid.error.issues[0].message); return; }
      if (await insertVideos(next, [id])) setSelection({ kind: 'video', id });
    }
  }
  async function importScenes() {
    if (!scenes.result) return;
    const next = clipsFromScenes(scenes.result, createUuidV7);
    if (clips.length + next.length > 500) { setError(tUi("На дорожке может быть не более 500 клипов.")); return; }
    if (!await insertVideos(appendTimelineClips(snapshot, next), next.map((clip) => clip.id))) return; if (next[0]) select({ kind: 'video', id: next[0].id }); scenes.clear();
  }
  async function importStoryboard() {
    if (!timeline.storyboardId) return; onBusy(true); setError('');
    try {
      const { story } = await loadStory(timeline.storyboardId, new AbortController().signal);
      const shots = story.snapshot.scenes.flatMap((scene) => scene.shots).filter((shot) => (shot.videoAssetId || shot.imageAssetId) && !clips.some((clip) => clip.shotId === shot.id));
      const next: TimelineSnapshot['clips'] = [];
      for (const shot of shots) {
        const { asset } = await storyRequest<{ asset: TimelineLibraryAsset }>(`/api/assets/${shot.videoAssetId ?? shot.imageAssetId}`);
        if (asset.mediaKind === 'audio' || (asset.mediaKind === 'video' && !asset.video?.browserPlayable)) throw new Error(tUi("Проверьте готовность видео в раскадровке."));
        next.push({ id: createUuidV7(), shotId: shot.id, assetId: asset.id, kind: asset.mediaKind, sourceInMs: 0, durationMs: Math.min(shot.durationMs, asset.video ? Math.floor(asset.video.durationSeconds * 1000) : shot.durationMs) });
      }
      await insertVideos(appendTimelineClips(snapshot, next), next.map((clip) => clip.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось перенести кадры.")); }
    finally { onBusy(false); }
  }
  return <div ref={root} className={styles.workspace} data-library-open={libraryOpen} data-tools-open={toolsOpen} style={{ '--track-height': `${trackHeight}%` } as CSSProperties} role="region" aria-label={tUi("Рабочее окно таймлайна")}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDrop={(event) => {
      if (!event.dataTransfer.files.length) return; event.preventDefault();
      if (library.busy) { setError(tUi("Дождитесь завершения текущей загрузки.")); return; }
      setLibraryOpen(true); void library.uploadMany(Array.from(event.dataTransfer.files));
    }}>
    <div className={styles.workspaceBar} aria-label={tUi("Панели редактора")}>
      <button type="button" aria-label={tUi("Материалы")} aria-expanded={libraryOpen} aria-controls="timeline-materials" onClick={() => setLibraryOpen(!libraryOpen)}><LibraryBig size={16} /><span>{tUi("Материалы")}</span></button>
      <button type="button" aria-label={tUi("Показать или скрыть таймлайн")} aria-expanded={tracksOpen} onClick={() => setTracksOpen(!tracksOpen)}><Film size={16} /></button>
      <ProTooltip label={layout === 'wide' ? tUi("Таймлайн во всю ширину") : layout === 'right' ? tUi("Правая панель на всю высоту") : tUi("Таймлайн между панелями")}><button type="button" aria-label={tUi("Изменить компоновку панелей")} onClick={() => setLayout(layout === 'wide' ? 'right' : layout === 'right' ? 'columns' : 'wide')}><Layout size={16} /></button></ProTooltip>
      <div className={styles.panelChoices}>{([{ id: 'properties', label: tUi("Свойства"), Icon: SlidersHorizontal }, { id: 'music', label: tUi("Промо под трек"), Icon: AudioLines }, { id: 'assistant', label: tUi("Ассистент"), Icon: Bot }] as const).map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={toolsOpen && tools === id} aria-controls="timeline-tools" onClick={() => { setTools(id); setToolsOpen(true); }}><Icon size={15} /><span>{label}</span></button>)}</div>
      <ProTooltip label={toolsOpen ? tUi("Скрыть инструменты") : tUi("Показать инструменты")}><button type="button" aria-label={toolsOpen ? tUi("Скрыть инструменты") : tUi("Показать инструменты")} aria-expanded={toolsOpen} aria-controls="timeline-tools" onClick={() => setToolsOpen(!toolsOpen)}><PanelRight size={16} /></button></ProTooltip>
    </div>
    <div className={layoutStyles.layout} data-layout={expanded ? 'right' : layout} data-tracks-open={tracksOpen} data-library-open={libraryOpen} data-tools-open={toolsOpen}
      style={{ '--library-width': `${effectiveLibraryWidth}px`, '--tools-width': `${effectiveToolsWidth}px`, '--track-height': `${trackHeight}%` } as CSSProperties}>
      <div id="timeline-materials" className={layoutStyles.library} hidden={!libraryOpen}><TimelineMediaLibrary library={library} scenes={scenes} onAdd={(asset) => addAsset(asset, undefined, clock.current.timeMs)} onImportScenes={importScenes} /></div>
      <TimelineSideDivider side="left" hidden={!libraryOpen} value={effectiveLibraryWidth} onChange={(value) => resizeSide('left', value)} />
      <section className={`${styles.stage} ${layoutStyles.stage}`} aria-label={tUi("Просмотр монтажа")}><div className={styles.stageTop}><span>{tUi("Просмотр")}</span><span>{snapshot.aspectRatio} · {snapshot.frameRate ?? 30} fps</span></div>
        <div className={styles.preview}>{selected ? <StoryTimelinePreview key={`${selected.id}:${selected.assetId}:${selected.startMs}`} clip={selected} ratio={snapshot.aspectRatio} playing={playing} onComplete={complete} onStop={stop} clockRef={clock} startMs={selected.startMs} seekRequest={seekRequest} gain={selected.sourceAudioMuted ? 0 : snapshot.sourceAudioGain ?? 1} />
          : snapshot.production ? <TimelinePromoStart timeline={timeline} library={library} jobs={jobs} commit={commit} accept={accept} disabled={disabled} /> : <div className={styles.empty}><img src={snapshot.production ? '/home/timeline-promo-glass.webp' : '/home/timeline-empty-glass.webp'} alt="" draggable={false} /><h2>{snapshot.production ? tUi("Соберём историю под музыку") : tUi("Ваш монтаж начинается здесь")}</h2><p>{snapshot.production ? tUi("Загрузите видео слева, выберите музыку справа и подготовьте ритм.") : tUi("Добавьте кадры из библиотеки или перетащите файлы с устройства.")}</p></div>}{!selected ? <TimelineEmptyPlayback clockRef={clock} playing={playing} durationMs={duration} onStop={stop} seekRequest={seekRequest} /> : null}</div>
        <TimelineTransport clock={clock} playing={playing} duration={segments.at(-1) ? segments.at(-1)!.startMs + segments.at(-1)!.durationMs : duration} frameRate={snapshot.frameRate ?? 30} sceneStarts={segments.map((clip) => clip.startMs)} playable={Boolean(selected || snapshot.audioClips?.length)} disabled={disabled} history={history} onSeek={seek} onPlay={play} />
      </section>
      <TimelineSideDivider side="right" hidden={!toolsOpen} value={effectiveToolsWidth} onChange={(value) => resizeSide('right', value)} />
      <aside id="timeline-tools" className={`${styles.tools} ${layoutStyles.tools}`} hidden={!toolsOpen} aria-label={tUi("Инструменты монтажа")}>
        <div hidden={tools !== 'properties'}><TimelineInspector onExtractAudio={(id) => { void insertVideos(snapshot, [id], true); }} snapshot={snapshot} onUnlink={(kind, id) => change(unlinkTimelineClip(snapshot, kind, id))} slots={jobs.slots} selection={selection} onChange={change} onVideoChange={videoChange} onResizeVideo={resizeVideo} onResizeAudio={resizeAudio} onResizeSlot={resizeSlot} onError={setError} /></div>
        <div hidden={tools !== 'music'}><TimelineProductionPanel key={snapshot.audioClips?.find((clip) => clip.role === 'music')?.assetId ?? 'empty'} timeline={timeline} dirty={dirty} disabled={disabled} commit={commit} accept={accept} edit={(next) => change(next.snapshot)} library={library} jobs={jobs} /></div>
        <div className={styles.assistantPane} hidden={tools !== 'assistant'}><TimelineAssistantPanel isNew={isNew} ensurePersisted={ensurePersisted} expanded={expanded} onExpandedChange={setAssistantExpanded} id={timeline.id} workspaceId={timeline.workspaceId} revision={timeline.revision} dirty={dirty} onClose={() => setToolsOpen(false)} /></div>
      </aside>
    <div className={layoutStyles.bottomDivider} hidden={!tracksOpen}><TimelinePaneDivider root={root} value={trackHeight} onChange={setTrackHeight} /></div>
    <section id="timeline-tracks" hidden={!tracksOpen} className={`${styles.lower} ${layoutStyles.lower}`} aria-label={tUi("Монтажная дорожка")}><div className={styles.toolbar}>
      <button type="button" onClick={addVideoTrack} disabled={(snapshot.videoTracks?.length ?? 0) >= 15}>{tUi("+ Видеодорожка")}</button>
      <TimelineSplitButton snapshot={snapshot} clock={clock} selection={selection} disabled={disabled || playing} onSplit={split} />
      <button type="button" onClick={addTrack} disabled={timelineAudioLanes(snapshot).length >= 32}>{tUi("+ Аудиодорожка")}</button>
      {timeline.storyboardId ? <button type="button" onClick={importStoryboard}>{tUi("Добавить из раскадровки")}</button> : null}
      <div className={styles.zoom}><span>{tUi("Масштаб")}</span><Slider thumbAriaLabel={tUi("Масштаб таймлайна")} thumbShape="rect" min={4} max={120} step={1} value={scale} onValueChange={setScale} getValueText={(value) => `${Math.round(value / 36 * 100)}%`} tooltip={{ formatValue: (value) => `${Math.round(value / 36 * 100)}%` }} /></div>
      <ProTooltip label={tUi("Магнитное выравнивание клипов")}><button type="button" className={styles.snapToggle} aria-label={tUi("Магнитное выравнивание клипов")} aria-pressed={snapping} onClick={() => setSnapping((value) => !value)}><AlignCenterVertical size={16} /></button></ProTooltip>
      {jobs.busy ? <button type="button" onClick={jobs.cancel}>{tUi("Остановить обработку")}</button> : null}
    </div>
    {error || jobs.error ? <p className={styles.error} role="alert">{typeof (error || jobs.error) === 'string' ? tUi((error || jobs.error) as string) : (error || jobs.error)}</p> : null}{notice ? <p className={styles.notice}>{typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}<button type="button" aria-label={tUi("Скрыть сообщение")} onClick={() => setNotice('')}>×</button></p> : null}{jobs.busy ? <p role="status" className={styles.notice}>{jobs.status}</p> : null}
    <TimelineTracks snapping={snapping} onScale={setScale} snapshot={snapshot} slots={jobs.slots} scale={scale} duration={duration} seekDuration={duration} selection={selection} clock={clock} playing={playing} onSelect={select} onChange={change} onResizeVideo={resizeVideo} onResizeAudio={resizeAudio} onResizeSlot={resizeSlot} onSeek={seek} onError={setError} onContextMenu={(target) => { setPlaying(false); setSelection({ kind: target.kind, id: target.id }); setMenu(target); }} nameFor={(id) => { const asset = assetFor(id); return asset ? timelineAssetName(asset, language, tUi) : tUi("Материал"); }} onAssetDrop={(id, track, at) => { const asset = assetFor(id); if (asset) addAsset(asset, track, at); }} />
    </section></div>
    {menu ? <TimelineClipMenu onExtractAudio={() => { void insertVideos(snapshot, [menu.id], true); }} onUnlink={() => change(unlinkTimelineClip(snapshot, menu.kind, menu.id))} target={menu} snapshot={snapshot} clock={clock} onClose={closeMenu} onSplit={() => split(menu.kind, menu.id)} onInspect={() => { setTools('properties'); setToolsOpen(true); }} onDelete={() => menu.kind === 'video' ? videoChange(clips.filter((clip) => clip.id !== menu.id)) : change({ ...normalizeAudioLanes(snapshot), audioClips: normalizeAudioLanes(snapshot).audioClips?.filter((clip) => clip.id !== menu.id) })} /> : null}
    <TimelineAudioTracks snapshot={snapshot} clock={clock} playing={playing} />
  </div>;
}
