'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { BookOpen, Camera, MapPin } from '@prodactionpro/ui-core/icons';
import type { VideoDirectionSettings } from '@/shared/media/home-video-direction';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import { VIDEO_DIRECTION_LAYERS, type VideoDirectionLayer } from '../model/video-direction-editor';
import { VideoDirectionDialogShell } from './video-direction-dialog-shell';
import { VideoStoryFields, VideoSceneFields, VideoShotFields } from './video-direction-layers';
import styles from './video-direction.module.css';

export const VIDEO_LAYER_ICONS = { story: BookOpen, scene: MapPin, shot: Camera };

export function VideoDirectionDialog({ workspaceId, value, onChange, layer, onLayerChange, onClose, subjects, onSubjectsChange, coverAssetId, onCoverChange, disabled }: {
  workspaceId: string; value: VideoDirectionSettings; onChange: (value: VideoDirectionSettings) => void;
  layer: VideoDirectionLayer; onLayerChange: (value: VideoDirectionLayer) => void; onClose: () => void;
  subjects: HomeSubjectChoice[]; onSubjectsChange: (value: HomeSubjectChoice[]) => void;
  coverAssetId?: string; onCoverChange: (value?: string) => void; disabled: boolean;
}) {
  const tUi = useTranslations();
  const ui_VIDEO_DIRECTION_LAYERS = useUiCatalog(VIDEO_DIRECTION_LAYERS, tUi);
  return <VideoDirectionDialogShell title={tUi("Настройки сцены")} onClose={onClose}>
    <div className={styles.tabs} role="tablist" aria-label={tUi("Уровень настроек")}>{ui_VIDEO_DIRECTION_LAYERS.map((item, index) => {
      const Icon = VIDEO_LAYER_ICONS[item.id];
      return <button type="button" key={item.id} role="tab" id={`video-tab-${item.id}`} aria-controls={`video-panel-${item.id}`} aria-selected={layer === item.id}
        tabIndex={layer === item.id ? 0 : -1} onClick={() => onLayerChange(item.id)} onKeyDown={(event) => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
          if (next === null) return; event.preventDefault(); onLayerChange(ui_VIDEO_DIRECTION_LAYERS[next].id);
          (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
        }}><span className={styles.tabIcon}><Icon size={23} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>;
    })}</div>
    <div className={styles.body} role="tabpanel" id={`video-panel-${layer}`} aria-labelledby={`video-tab-${layer}`}>
      <fieldset disabled={disabled} className={styles.fields}>
        {layer === 'story' ? <VideoStoryFields {...{ workspaceId, value, onChange, subjects, onSubjectsChange, coverAssetId, onCoverChange }} />
          : layer === 'scene' ? <VideoSceneFields {...{ workspaceId, value, onChange, coverAssetId, onCoverChange }} /> : <VideoShotFields {...{ workspaceId, value, onChange, coverAssetId, onCoverChange }} />}
      </fieldset>
    </div>
    <footer className={styles.footer}><span>{tUi("Настройки применяются к следующей генерации")}</span><button className={styles.primary} type="button" onClick={onClose}>{tUi("Готово")}</button></footer>
  </VideoDirectionDialogShell>;
}
