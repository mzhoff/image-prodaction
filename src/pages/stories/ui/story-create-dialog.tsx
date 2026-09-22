'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from '@prodactionpro/ui-core/icons';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import { BrandSelect } from '@/shared/ui/brand-select';
import { createStorySnapshot, settingsForFormat, STORY_FORMATS } from '@/modules/story-projects/core/story-presets';
import type { StoryProject, StoryWrite } from '@/modules/story-projects/contracts/story-project';
import { createStory } from '../model/story-api';
import { DurationChoices, FormatCards, GenreCards, RatioChoices } from './story-settings';

export function StoryCreateDialog({ workspaceId, folders, onClose, onCreated, initialFolderId = null, initial, onConfigure, allowBlank = false }: {
  allowBlank?: boolean;
  initial?: StoryProject; onConfigure?: (input: StoryWrite) => Promise<void>;
  workspaceId: string; folders: StudioFolder[]; onClose: () => void; onCreated?: (story: StoryProject) => void; initialFolderId?: string | null;
}) {
  const tUi = useTranslations();
  const ui_STORY_FORMATS = useUiCatalog(STORY_FORMATS, tUi);
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0); const [settings, setSettings] = useState(() => initial?.snapshot.settings ?? settingsForFormat('free'));
  const [name, setName] = useState(initial?.name === 'Новая история' ? '' : initial?.name ?? ''); const [folderId, setFolderId] = useState(initial?.folderId ?? initialFolderId ?? '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const preset = ui_STORY_FORMATS.find((item) => item.value === settings.format)!;
  return <dialog ref={dialog} className="story-dialog story-create-wizard" aria-labelledby="story-create-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose}>
    <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; if (step < 2) { setStep(step + 1); return; } setBusy(true); setError('');
      try { const input = { name: name.trim() || 'Новая история', folderId: folderId || null, snapshot: initial ? { ...initial.snapshot, settings } : createStorySnapshot(settings) };
        if (onConfigure) await onConfigure(input); else { const result = await createStory(workspaceId, input); onCreated?.(result.story); } }
      catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось создать историю.")); } finally { setBusy(false); }
    }}>
      <header className="story-wizard-header"><div><span className="story-eyebrow">{tUi("НОВАЯ ИСТОРИЯ")}</span><h2 id="story-create-title">{[tUi("Что будем создавать?"), tUi("Какое настроение?"), tUi("Последние штрихи")][step]}</h2><p>{[tUi("Выберите отправную точку. Всё можно изменить по ходу."), tUi("Один формат — множество способов рассказать историю."), tUi("Задайте ритм и дайте истории имя.")][step]}</p></div><button type="button" aria-label={tUi("Закрыть")} onClick={onClose} disabled={busy}><X size={18} /></button></header>
      <nav className="story-wizard-tabs" aria-label={tUi("Шаги создания")}>{[tUi("Формат"), tUi("Настроение"), tUi("Детали")].map((title, index) => <button type="button" key={title} aria-current={step === index ? 'step' : undefined} disabled={busy} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{title}</button>)}</nav>
      <fieldset disabled={busy} className="story-wizard-body">
        {step === 0 ? <><FormatCards settings={settings} onSelect={(format) => setSettings({ ...settingsForFormat(format), genre: settings.genre, language: settings.language })} /><p className="story-wizard-hint">{preset.guidance}</p></> : step === 1 ? <GenreCards value={settings.genre} onChange={(genre) => setSettings({ ...settings, genre })} /> : <div className="story-final-details">
          <input autoFocus aria-label={tUi("Название истории")} className="story-name-input" placeholder={tUi("Название вашей истории")} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          <section><h3>{tUi("Холст")}</h3><RatioChoices value={settings.aspectRatio} onChange={(aspectRatio) => setSettings({ ...settings, aspectRatio })} /></section>
          <section><h3>{tUi("Ритм истории")}</h3><DurationChoices value={settings.targetDurationSeconds} onChange={(targetDurationSeconds) => setSettings({ ...settings, targetDurationSeconds })} /></section>
          <div className="story-detail-menus"><BrandSelect label={tUi("Папка проекта")} value={folderId} options={[{ value: '', label: tUi("Без папки") }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={setFolderId} /><BrandSelect label={tUi("Язык истории")} value={settings.language} options={[tUi("Русский"), 'English', 'Español', 'Deutsch', 'Français'].map((value) => ({ value, label: value }))} onChange={(language) => setSettings({ ...settings, language })} /></div>
        </div>}
      </fieldset>
      {error ? <p role="alert" className="story-error">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      <footer><button type="button" className="story-wizard-skip" onClick={onClose} disabled={busy}>{allowBlank ? tUi("Начать с чистого листа") : tUi("Продолжить без изменений")}</button>{step > 0 ? <button type="button" onClick={() => setStep(step - 1)} disabled={busy}><ArrowLeft size={14} />{tUi("Назад")}</button> : null}<button className="story-primary" disabled={busy || settings.targetDurationSeconds < 5 || settings.targetDurationSeconds > 7200}>{busy ? tUi("Сохраняем…") : step < 2 ? tUi("Продолжить") : tUi("Применить настройки")}<ArrowRight size={14} /></button></footer>
    </form>
  </dialog>;
}
