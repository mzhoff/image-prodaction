'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useState } from 'react';
import { SlidersHorizontal } from '@prodactionpro/ui-core/icons';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { StoryProject, StorySettings } from '@/modules/story-projects/contracts/story-project';
import { STORY_FORMATS, STORY_GENRES } from '@/modules/story-projects/core/story-presets';
import { DurationChoices, RatioChoices } from './story-settings';

export function StoryBlueprintDocument({ story, folders, onChange }: { story: StoryProject; folders: StudioFolder[]; onChange: (story: StoryProject) => void }) {
  const tUi = useTranslations();
  const ui_STORY_FORMATS = useUiCatalog(STORY_FORMATS, tUi);
  const ui_STORY_GENRES = useUiCatalog(STORY_GENRES, tUi);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, blueprint } = story.snapshot;
  const setSettings = (patch: Partial<StorySettings>) => onChange({ ...story, snapshot: { ...story.snapshot, settings: { ...settings, ...patch } } });
  const field = (key: keyof typeof blueprint, label: string, rows: number, placeholder: string) => <label key={key}>{label}<textarea rows={rows} maxLength={20_000} value={blueprint[key]} placeholder={placeholder} onChange={(e) => onChange({ ...story, snapshot: { ...story.snapshot, blueprint: { ...blueprint, [key]: e.target.value } } })} /></label>;
  return <div className="story-blueprint-document"><header><div><span className="story-eyebrow">BLUEPRINT</span><h2>{tUi("Сначала — история.")}</h2></div><button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={15} />{tUi("Настройки")}</button></header>
      <div className="story-blueprint-tags"><span>{ui_STORY_FORMATS.find((item) => item.value === settings.format)?.label}</span><span>{ui_STORY_GENRES.find((item) => item.value === settings.genre)?.label}</span><span>{settings.targetDurationSeconds}  {' '}{tUi("сек")}</span></div>
      {settingsOpen ? <section className="story-blueprint-settings"><BrandSelect label={tUi("Формат")} value={settings.format} options={ui_STORY_FORMATS} onChange={(format) => setSettings({ format: format as StorySettings['format'] })} /><BrandSelect label={tUi("Жанр")} value={settings.genre} options={ui_STORY_GENRES} onChange={(genre) => setSettings({ genre: genre as StorySettings['genre'] })} />
        <BrandSelect label={tUi("Папка проекта")} value={story.folderId ?? ''} options={[{ value: '', label: tUi("Без папки") }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={(folderId) => onChange({ ...story, folderId: folderId || null })} />
        <RatioChoices value={settings.aspectRatio} onChange={(aspectRatio) => setSettings({ aspectRatio })} /><DurationChoices value={settings.targetDurationSeconds} onChange={(targetDurationSeconds) => setSettings({ targetDurationSeconds })} />
        <label>{tUi("Язык")}<input aria-label={tUi("Язык истории")} value={settings.language} maxLength={40} onChange={(e) => setSettings({ language: e.target.value })} /></label></section> : null}
      <section className="story-blueprint-paper story-fields"><div className="story-field-pair">{field('purpose', tUi("Замысел"), 3, tUi("Что зритель почувствует или сделает?"))}{field('audience', tUi("Для кого"), 3, tUi("Кому мы рассказываем эту историю?"))}</div>
        {field('script', tUi("Сценарий"), 15, tUi("Всё начинается с…"))}{field('visualStyle', tUi("Визуальный мир"), 4, tUi("Атмосфера, свет, цвет и детали, которые делают историю вашей."))}</section>
    </div>;
}
