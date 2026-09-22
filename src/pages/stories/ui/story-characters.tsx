'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ImagePlus, LoaderCircle, Sparkles, Upload, UserRound, Undo2 } from '@prodactionpro/ui-core/icons';
import { SubjectDialog } from '@/features/chat-assistant/ui/home-subject-picker';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';
import { uploadSubjectReference } from '@/entities/production-graph/api/subject-library-api';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import { CHARACTER_CHOICES, isCharacterReady } from '@/modules/story-projects/core/character-passport';
import type { useStoryCharacters } from '../model/use-story-characters';
import { CharacterPassportControls } from './character-passport-controls';
import { StoryLegacyCharacters } from './story-legacy-characters';
import { CharacterQuickCreate } from './character-quick-create';

export function StoryCharacters({ story, authoring, disabled }: { story: StoryProject; authoring: ReturnType<typeof useStoryCharacters>; disabled: boolean }) {
  const tUi = useTranslations();
  const ui_CHARACTER_CHOICES = useUiCatalog(CHARACTER_CHOICES, tUi);
  const characters = story.snapshot.characters ?? [], selected = authoring.selected;
  const [model, setModel] = useState(DEFAULT_IMAGE_MODEL), catalog = useOpenRouterModels();
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false), fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const setTransferring = authoring.setTransferring;
  useEffect(() => { setTransferring(uploading); return () => setTransferring(false); }, [uploading, setTransferring]);
  const legacyIds = (story.snapshot.subjectIds ?? []).filter((id) => !characters.some((item) => item.source?.subjectId === id));
  const blocked = disabled || authoring.busy || uploading;
  const ready = characters.filter((item) => isCharacterReady(item, story.snapshot.blueprint.visualStyle)).length;
  const generated = authoring.generations.filter((item) => item.characterId === selected?.id);
  const pending = generated.some((item) => ['queued', 'running'].includes(item.status));
  const assetIds = [...new Set([...(selected?.references ?? []), ...generated.flatMap((item) => item.assetId ? [item.assetId] : [])])];
  const mainImage = selected?.selectedReference?.assetId ?? generated.find((item) => item.assetId)?.assetId ?? selected?.references[0];
  const upload = async (file?: File) => {
    if (!file || !selected || blocked || authoring.dirty || uploadLock.current) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) { setUploadError(tUi("Выберите JPG, PNG или WebP до 8 МБ.")); return; }
    uploadLock.current = true; setUploading(true); setUploadError('');
    try { const asset = await uploadSubjectReference(story.workspaceId, file); await authoring.change({ action: 'reference', characterId: selected.id, assetId: asset.id, select: false }); }
    catch (caught) { setUploadError(caught instanceof Error ? caught.message : tUi("Не удалось загрузить референс.")); }
    finally { uploadLock.current = false; setUploading(false); }
  };
  return <div className="story-characters">
    <header className="story-characters-header"><div><span className="story-character-eyebrow">{tUi("Образы вашей истории")}</span><h2>{selected ? selected.passport.name : tUi("Познакомимся с героями")}</h2><p>{selected ? ui_CHARACTER_CHOICES.role[selected.passport.role] : characters.length ? tUi("Готово {p1} из {p2}. Выберите героя, чтобы доработать образ.", { p1: ready, p2: characters.length }) : tUi("Соавтор предложит героев из лора. Вы выберете характер и внешний вид.")}</p></div>
      <div className="story-character-entry-actions"><button type="button" disabled={blocked || authoring.dirty || characters.length >= 12} onClick={() => setCreating(true)}>{tUi("Свой герой")}</button><button type="button" disabled={blocked || authoring.dirty || characters.length >= 12} onClick={() => authoring.setLibraryOpen(true)}><UserRound size={15} />{tUi("Из Library")}</button></div></header>
    {creating ? <CharacterQuickCreate busy={blocked} onClose={() => setCreating(false)} onCreate={(passport) => authoring.change({ action: 'save', character: { id: null, passport } })} /> : null}
    {authoring.error || uploadError ? <p className="story-character-error" role="alert">{typeof (authoring.error || uploadError) === 'string' ? tUi((authoring.error || uploadError) as string) : (authoring.error || uploadError)}<button type="button" disabled={blocked} onClick={authoring.refresh}>{tUi("Проверить ещё раз")}</button></p> : null}
    {!selected ? <>
      {legacyIds.length ? <StoryLegacyCharacters workspaceId={story.workspaceId} subjectIds={legacyIds} disabled={blocked} onImport={(subjectId) => void authoring.change({ action: 'import', subjectId })} /> : null}
      <div className="story-character-cards">{characters.map((character) => {
        const jobs = authoring.generations.filter((item) => item.characterId === character.id), working = jobs.some((item) => ['queued', 'running'].includes(item.status));
        const image = character.selectedReference?.assetId ?? jobs.find((item) => item.assetId)?.assetId ?? character.references[0];
        const done = isCharacterReady(character, story.snapshot.blueprint.visualStyle);
        return <button className="story-character-card" type="button" key={character.id} disabled={blocked} onClick={() => authoring.select(character.id)}>
          <span className="story-character-cover">{image ? <img src={`/api/assets/${image}/content?variant=thumbnail`} alt={character.passport.name} draggable={false} /> : <UserRound size={48} strokeWidth={1} />}{working ? <span className="story-character-cover-status"><LoaderCircle size={24} className="home-generation-spinner" />{tUi("Создаём образ…")}</span> : null}</span>
          <strong>{character.passport.name}</strong><span>{ui_CHARACTER_CHOICES.role[character.passport.role]}</span><small data-ready={done}>{done ? tUi("Герой готов") : character.selectedReference ? tUi("Образ требует проверки") : image ? tUi("Выберите образ") : tUi("Описание готово")}</small>
        </button>;
      })}<button type="button" className="story-character-add" disabled={blocked || characters.length >= 12 || !story.snapshot.blueprint.script.trim()} onClick={() => authoring.ask(characters.length ? "Предложи ещё одного подходящего героя для этой истории и сохрани его паспорт через story_save_characters." : "Подготовь паспорта главных героев по лору истории. Выбери атрибуты и сохрани через story_save_characters.")}><Sparkles size={30} strokeWidth={1.25} /><strong>{characters.length ? tUi("Предложить героя") : tUi("Создать по истории")}</strong><span>{tUi("Соавтор подготовит образ")}</span></button></div>
      <button type="button" className="story-characters-skip" disabled={blocked} onClick={() => void authoring.change({ action: 'skip', skipped: !story.snapshot.charactersSkipped })}>{story.snapshot.charactersSkipped ? tUi("Вернуть этап подготовки героев") : tUi("Продолжу раскадровку без подготовки героев")}</button>
    </> : <>
      <nav className="story-character-breadcrumb"><button type="button" disabled={blocked || authoring.dirty} onClick={() => authoring.select(undefined)}><ChevronLeft size={15} />{tUi("Все герои")}</button><span role="status">{isCharacterReady(selected, story.snapshot.blueprint.visualStyle) ? tUi("✓ Образ выбран") : selected.selectedReference ? tUi("Паспорт изменился — проверьте выбранный образ") : tUi("Выберите образ для раскадровки")}</span><button type="button" disabled={blocked || authoring.dirty || !selected.previousPassports.length} aria-label={tUi("Отменить последнюю правку паспорта")} onClick={() => void authoring.change({ action: 'undo', characterId: selected.id })}><Undo2 size={16} /></button></nav>
      <div className="story-character-passport"><section className="story-character-visual">
        <div className={`story-character-portrait ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files[0]); }}>
          {mainImage ? <img src={`/api/assets/${mainImage}/content`} alt={tUi("Образ: {p1}", { p1: selected.passport.name })} draggable={false} /> : <div><UserRound size={72} strokeWidth={1} /><p>{tUi("Описание уже есть.")}<br />{tUi("Давайте найдём его образ.")}</p></div>}
          {pending || uploading ? <div className="story-character-cover-status" role="status"><LoaderCircle size={28} className="home-generation-spinner" /><span>{uploading ? tUi("Загружаем референс…") : tUi("Создаём образ…")}</span></div> : null}
          {dragging ? <span className="story-character-drop-label">{tUi("Отпустите референс здесь")}</span> : null}
        </div>
        <div className="story-character-generation"><ModelSelector modality="image" ariaLabel={tUi("Модель для образа героя")} value={model} disabled={blocked || pending} options={catalog.imageModels.map((item) => ({ value: item.id, label: item.label }))} onChange={setModel} surface="liquid" />
          <button className="story-primary" type="button" disabled={blocked || authoring.dirty || pending} onClick={() => void authoring.generate(selected.id, model)}><Sparkles size={16} />{pending ? tUi("Создаём…") : mainImage ? tUi("Другой вариант") : tUi("Создать образ")}</button>
          <button type="button" disabled={blocked || authoring.dirty} onClick={() => fileInput.current?.click()}><Upload size={15} />{tUi("Свой референс")}</button><input hidden ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></div>
        {authoring.dirty ? <p className="story-character-hint">{tUi("Примените изменения, чтобы создать образ по новому паспорту.")}</p> : <p className="story-character-hint">{tUi("Один образ за запуск · 1:1 · 1K. Можно загрузить JPG, PNG или WebP до 8 МБ.")}</p>}
        {assetIds.length ? <div className="story-character-variants" aria-label={tUi("Варианты образа")}>{assetIds.map((assetId) => {
          const chosen = selected.selectedReference?.assetId === assetId && isCharacterReady(selected, story.snapshot.blueprint.visualStyle);
          const generation = generated.find((item) => item.assetId === assetId);
          const old = generation && (generation.characterRevision !== selected.revision || generation.visualStyle !== story.snapshot.blueprint.visualStyle);
          return <button type="button" key={assetId} aria-pressed={chosen} disabled={blocked || authoring.dirty} onClick={() => void authoring.change({ action: 'reference', characterId: selected.id, assetId, select: true })}><img src={`/api/assets/${assetId}/content?variant=thumbnail`} alt={tUi("Вариант героя")} draggable={false} /><span>{chosen ? <><Check size={12} />{tUi("Выбран")}</> : old ? tUi("Принять прежний") : tUi("Использовать")}</span></button>;
        })}</div> : null}
        {generated.filter((item) => ['failed', 'canceled'].includes(item.status)).slice(0, 1).map((item) => <p key={item.id} className="story-character-hint" role="status"><ImagePlus size={14} />{item.error || tUi("Генерация остановлена. Можно создать новый вариант.")}</p>)}
      </section><CharacterPassportControls key={`${selected.id}:${selected.revision}`} character={selected} visualStyle={story.snapshot.blueprint.visualStyle} busy={blocked} onDirty={authoring.setDirty} onSave={(passport) => authoring.change({ action: 'save', character: { id: selected.id, passport } })} /></div>
    </>}
    {authoring.libraryOpen ? <SubjectDialog workspaceId={story.workspaceId} selectedIds={[]} maxSubjects={1} disabled={blocked} onClose={() => authoring.setLibraryOpen(false)} onChange={(_ids, subjects) => { const subject = subjects[0]; if (subject) void authoring.change({ action: 'import', subjectId: subject.id }); authoring.setLibraryOpen(false); }} /> : null}
  </div>;
}
