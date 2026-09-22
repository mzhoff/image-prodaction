'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import {
  VIDEO_TIME_OF_DAY_OPTIONS, VIDEO_LIGHTING_OPTIONS, VIDEO_TEMPERATURE_OPTIONS,
  VIDEO_FRAMING_OPTIONS, VIDEO_ANGLE_OPTIONS, VIDEO_FOCUS_OPTIONS, type VideoDirectionSettings,
} from '@/shared/media/home-video-direction';
import { VIDEO_OPTICS_OPTIONS, VIDEO_MOVEMENT_OPTIONS, VIDEO_SPEED_OPTIONS } from '@/shared/media/video-cinematic-catalog';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import { inheritedVideoStyle, type VideoDirectionLayer } from '../model/video-direction-editor';
import { HomeSubjectPicker } from './home-subject-picker';
import { DirectionText, DirectionChoice, VideoStyleFields } from './video-direction-fields';
import { VideoStyleLibrary } from './video-style-library';
import styles from './video-direction.module.css';

interface Props {
  workspaceId: string; value: VideoDirectionSettings; onChange: (value: VideoDirectionSettings) => void;
  subjects: HomeSubjectChoice[]; onSubjectsChange: (value: HomeSubjectChoice[]) => void;
  coverAssetId?: string; onCoverChange: (value?: string) => void;
}

export function VideoStoryFields({ workspaceId, value, onChange, subjects, onSubjectsChange, coverAssetId, onCoverChange }: Props) {
  const tUi = useTranslations();
  const story = value.story;
  const update = (patch: Partial<typeof story>) => onChange({ ...value, story: { ...story, ...patch } });
  return <>
    <DirectionText label={tUi("О чём история")} value={story.description} onChange={(description) => update({ description })} multiline
      placeholder={tUi("Замысел, события, настроение и связь между сценами")} />
    <section className={styles.section}><h3>{tUi("Герои")}</h3>
      <HomeSubjectPicker workspaceId={workspaceId} selectedIds={story.subjectIds} onChange={(subjectIds, selected) => { update({ subjectIds }); onSubjectsChange(selected); }} />
      {subjects.length ? <div className={styles.heroes}>{subjects.map((subject) => <span key={subject.id}>
        {subject.imageAssetIds[0] ? <img src={`/api/assets/${encodeURIComponent(subject.imageAssetIds[0])}/content?variant=thumbnail`} alt="" draggable={false} /> : null}
        <strong>{subject.name}</strong><button type="button" aria-label={tUi("Убрать героя {p1}", { p1: subject.name })} onClick={() => {
          update({ subjectIds: story.subjectIds.filter((id) => id !== subject.id) }); onSubjectsChange(subjects.filter((item) => item.id !== subject.id));
        }}>×</button>
      </span>)}</div> : null}
      <p className={styles.hint}>{tUi("Описание и фото героя дополняют запрос. Фото занимают общие слоты референсов выбранной модели.")}</p>
    </section>
    <section className={styles.section}><h3>{tUi("Стиль истории")}</h3><p className={styles.hint}>{tUi("Наследуется всеми сценами и кадрами, пока вы не зададите исключение.")}</p>
      <VideoStyleFields value={story.style} onChange={(style) => update({ style })} />
      <VideoStyleLibrary workspaceId={workspaceId} value={story.style} coverAssetId={coverAssetId} onChange={(style, cover) => { update({ style }); onCoverChange(cover); }} />
    </section>
  </>;
}

type LayerProps = Pick<Props, 'value' | 'onChange' | 'workspaceId' | 'coverAssetId' | 'onCoverChange'>;

export function VideoSceneFields({ value, onChange, ...library }: LayerProps) {
  const tUi = useTranslations();
  const scene = value.scene;
  const update = (patch: Partial<typeof scene>) => onChange({ ...value, scene: { ...scene, ...patch } });
  return <>
    <DirectionText label={tUi("Что происходит в сцене")} value={scene.description} onChange={(description) => update({ description })} multiline placeholder={tUi("Действие, окружение, атмосфера")} />
    <DirectionText label={tUi("Локация")} value={scene.location} onChange={(location) => update({ location })} placeholder={tUi("Где происходит действие: место и его особенности")} />
    <div className={styles.fieldGrid}>
      <DirectionChoice label={tUi("Время суток")} value={scene.timeOfDay} options={VIDEO_TIME_OF_DAY_OPTIONS} onChange={(timeOfDay) => update({ timeOfDay })} />
      <DirectionChoice label={tUi("Характер света")} value={scene.lighting} options={VIDEO_LIGHTING_OPTIONS} onChange={(lighting) => update({ lighting })} />
      <DirectionChoice label={tUi("Температура света")} value={scene.temperature} options={VIDEO_TEMPERATURE_OPTIONS} onChange={(temperature) => update({ temperature })} />
    </div>
    <DirectionText label={tUi("Источники света")} value={scene.lightSources} onChange={(lightSources) => update({ lightSources })} multiline
      placeholder={tUi("Можно смешивать: дневной свет из окна слева, тёплая лампа справа, неон на заднем плане")} />
    <VideoStyleOverride {...library} value={value} onChange={onChange} layer="scene" />
  </>;
}

export function VideoShotFields({ value, onChange, ...library }: LayerProps) {
  const tUi = useTranslations();
  const ui_VIDEO_OPTICS_OPTIONS = useUiCatalog(VIDEO_OPTICS_OPTIONS, tUi);
  const ui_VIDEO_MOVEMENT_OPTIONS = useUiCatalog(VIDEO_MOVEMENT_OPTIONS, tUi);
  const ui_VIDEO_SPEED_OPTIONS = useUiCatalog(VIDEO_SPEED_OPTIONS, tUi);
  const shot = value.shot;
  const update = (patch: Partial<typeof shot>) => onChange({ ...value, shot: { ...shot, ...patch } });
  return <>
    <DirectionText label={tUi("Описание кадра")} value={shot.description} onChange={(description) => update({ description })} multiline placeholder={tUi("Что показать и на чём сосредоточить внимание")} />
    <div className={styles.fieldGrid}>
      <DirectionChoice label={tUi("Крупность")} value={shot.framing} options={VIDEO_FRAMING_OPTIONS} onChange={(framing) => update({ framing })} />
      <DirectionChoice label={tUi("Ракурс")} value={shot.angle} options={VIDEO_ANGLE_OPTIONS} onChange={(angle) => update({ angle })} />
      <DirectionChoice label={tUi("Оптика")} value={shot.optics} options={ui_VIDEO_OPTICS_OPTIONS} onChange={(optics) => update({ optics })} />
      <DirectionChoice label={tUi("Фокус")} value={shot.focus} options={VIDEO_FOCUS_OPTIONS} onChange={(focus) => update({ focus })} />
      <DirectionChoice label={tUi("Движение камеры")} value={shot.movement} options={ui_VIDEO_MOVEMENT_OPTIONS} onChange={(movement) => update({ movement })} />
      {shot.movement !== 'static' ? <DirectionChoice label={tUi("Темп движения")} value={shot.speed} options={ui_VIDEO_SPEED_OPTIONS} onChange={(speed) => update({ speed })} /> : null}
    </div>
    <VideoStyleOverride {...library} value={value} onChange={onChange} layer="shot" />
  </>;
}

function VideoStyleOverride({ value, onChange, layer, workspaceId, coverAssetId, onCoverChange }: LayerProps & { layer: Exclude<VideoDirectionLayer, 'story'> }) {
  const tUi = useTranslations();
  const override = value[layer].styleOverride;
  const inherited = inheritedVideoStyle(value, layer);
  return <section className={styles.section}>
    <label className={styles.check}><input type="checkbox" checked={Boolean(override)} onChange={(event) => {
      const next = { ...value[layer] };
      if (event.target.checked) next.styleOverride = { ...inherited }; else { delete next.styleOverride; onCoverChange(undefined); }
      onChange({ ...value, [layer]: next });
    }} />{tUi("Свой стиль")}{' '} {layer === 'scene' ? tUi("для этой сцены") : tUi("для этого кадра")}</label>
    {override ? <><VideoStyleFields value={{ ...inherited, ...override }} onChange={(styleOverride) => onChange({ ...value, [layer]: { ...value[layer], styleOverride } })} />
      <VideoStyleLibrary workspaceId={workspaceId} value={{ ...inherited, ...override }} coverAssetId={coverAssetId} onChange={(styleOverride, cover) => {
        onChange({ ...value, [layer]: { ...value[layer], styleOverride } }); onCoverChange(cover);
      }} /></>
      : <p className={styles.hint}>{tUi("Используется стиль")}{' '} {layer === 'shot' && value.scene.styleOverride ? tUi("сцены") : tUi("истории")}.</p>}
  </section>;
}
