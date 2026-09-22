'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useState } from 'react';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { BrandSelect } from '@/shared/ui/brand-select';
import { settingsForFormat } from '@/modules/story-projects/core/story-presets';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import { loadStories } from '@/pages/stories/model/story-api';
import { DurationChoices, FormatCards, GenreCards, RatioChoices } from '@/pages/stories/ui/story-settings';
import type { CreationDraft, DocumentCreationKind } from '../model/create-draft';
import styles from './production-create.module.css';

export function CreationSettings({ kind, draft, onChange, folders, workspaceId }: { kind: DocumentCreationKind; draft: CreationDraft; onChange: (draft: CreationDraft) => void; folders: StudioFolder[]; workspaceId: string }) {
  const tUi = useTranslations();
  const [tab, setTab] = useState<'format' | 'mood' | 'details'>('format');
  const [stories, setStories] = useState<StorySummary[]>([]), [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (kind !== 'timeline') return;
    const controller = new AbortController();
    void loadStories(workspaceId, controller.signal).then(({ stories: items }) => { if (!controller.signal.aborted) { setStories(items); setLoadError(false); } }).catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [kind, workspaceId]);
  const common = <div className={styles.details}><label>{tUi("Название")}<input maxLength={120} placeholder={kind === 'storyboard' ? tUi("Новая история") : kind === 'timeline' ? tUi("Новый монтаж") : tUi("Новый Flow")} value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label>
    <BrandSelect label={tUi("Проект")} value={draft.folderId} options={[{ value: '', label: tUi("Без проекта") }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={(folderId) => onChange({ ...draft, folderId })} /></div>;
  if (kind === 'flow') return <section className={styles.settings}><h2>{tUi("Начните со своей задачи")}</h2><p>{tUi("Опишите, что должен делать Flow. Ассистент поможет собрать процесс из нод.")}</p>{common}</section>;
  if (kind === 'timeline') return <section className={styles.settings}><h2>{tUi("Какой монтаж соберём?")}</h2><p>{tUi("Выберите отправную точку и расскажите, что должно получиться.")}</p>
    <div className={styles.presets} role="group" aria-label={tUi("Формат монтажа")}>{[
      { label: tUi("Широкий экран"), description: tUi("Фильм, презентация, YouTube"), ratio: '16:9' },
      { label: tUi("Вертикальное видео"), description: tUi("Короткий ролик для соцсетей"), ratio: '9:16' },
      { label: tUi("Квадрат"), description: tUi("Публикация или слайд-шоу"), ratio: '1:1' },
    ].map((preset) => <button key={preset.ratio} type="button" aria-pressed={draft.ratio === preset.ratio} onClick={() => onChange({ ...draft, ratio: preset.ratio as CreationDraft['ratio'] })}>
      <span className={styles.ratioArt}><i style={{ aspectRatio: preset.ratio.replace(':', '/') }} /></span><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</div>
    {common}<div className={styles.details}><BrandSelect label={tUi("Частота кадров")} value={String(draft.frameRate)} options={[24, 25, 30, 50, 60].map((fps) => ({ value: String(fps), label: `${fps} fps` }))} onChange={(fps) => onChange({ ...draft, frameRate: Number(fps) as CreationDraft['frameRate'] })} />
      <BrandSelect label={tUi("Раскадровка")} value={draft.storyboardId} options={[{ value: '', label: tUi("Самостоятельный монтаж") }, ...stories.map((story) => ({ value: story.id, label: story.name }))]} onChange={(storyboardId) => onChange({ ...draft, storyboardId })} /></div>
    {loadError ? <p role="status">{tUi("Не удалось загрузить раскадровки. Можно начать самостоятельный монтаж.")}</p> : null}</section>;
  return <section className={styles.settings}>
    <div className={styles.intro}><h2>{tUi("Всё начинается с истории")}</h2><p>{tUi("Выберите формат и настроение. Затем расскажите идею соавтору.")}</p></div>
    <nav className={styles.tabs} aria-label={tUi("Настройки новой истории")}>{([{ id: 'format', label: tUi("Формат") }, { id: 'mood', label: tUi("Настроение") }, { id: 'details', label: tUi("Детали") }] as const).map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {tab === 'format' ? <FormatCards settings={draft.story} onSelect={(format) => onChange({ ...draft, story: { ...settingsForFormat(format), genre: draft.story.genre, language: draft.story.language } })} />
      : tab === 'mood' ? <GenreCards value={draft.story.genre} onChange={(genre) => onChange({ ...draft, story: { ...draft.story, genre } })} />
      : <div className={styles.sections}>{common}<section><h3>{tUi("Холст")}</h3><RatioChoices value={draft.story.aspectRatio} onChange={(aspectRatio) => onChange({ ...draft, story: { ...draft.story, aspectRatio } })} /></section>
        <section><h3>{tUi("Ритм истории")}</h3><DurationChoices value={draft.story.targetDurationSeconds} onChange={(targetDurationSeconds) => onChange({ ...draft, story: { ...draft.story, targetDurationSeconds } })} /></section>
        <BrandSelect label={tUi("Язык истории")} value={draft.story.language} options={[tUi("Русский"), 'English', 'Español', 'Deutsch', 'Français'].map((value) => ({ value, label: value }))} onChange={(language) => onChange({ ...draft, story: { ...draft.story, language } })} /></div>}
  </section>;
}
