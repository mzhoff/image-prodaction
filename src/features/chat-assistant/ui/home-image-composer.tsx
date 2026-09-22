'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ReactNode } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { LoaderCircle, Sparkles, Square } from '@prodactionpro/ui-core/icons';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';
import { DarkSelect } from '@/shared/ui/dark-select';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { resolveHomeImageSelection, type HomeImageSelection } from '../model/home-image-selection';
import { type useHomeImageSubmit, type HomeAttachments } from '../model/use-home-image-submit';
import { HomeLibraryReferencePicker } from './home-library-reference-picker';
import { HomeSubjectPicker } from './home-subject-picker';
import { ProductionComposerFrame } from './production-composer-frame';
import { HomeImageAttachments } from './home-image-attachments';
import type { HomeSubjectChoice } from '../api/home-subject-api';

export function useHomeImageComposer({ workspaceId, attachments, draft, setDraft, subjects, setSubjects, submission, onCancel, prefix }: {
  workspaceId: string; attachments: HomeAttachments;
  draft: HomeImageSelection; setDraft: (value: HomeImageSelection) => void;
  subjects: HomeSubjectChoice[]; setSubjects: (value: HomeSubjectChoice[]) => void;
  submission: ReturnType<typeof useHomeImageSubmit>;
  onCancel: () => void; prefix: ReactNode;
}) {
  const tUi = useTranslations();
  const runtime = useChatRuntime();
  const state = useChatRuntimeState();
  const catalog = useOpenRouterModels();
  const { submit, preparing, error } = submission;
  const selection = resolveHomeImageSelection(draft, catalog.generationModels ?? catalog.imageModels);
  const busy = preparing || ['loading', 'submitting', 'streaming'].includes(state.phase);
  const unavailable = !selection.model || Boolean(catalog.imageCatalogError);
  const canSubmit = !busy && !unavailable && !attachments.isUploading && !attachments.hasFailures
    && Boolean(state.inputValue.trim());
  const referenceLimit = Math.max(0, Math.min(3, (selection.model?.imageCapabilities?.maxReferences ?? 4) - subjects.filter((subject) => subject.imageAssetIds.length).length));
  const send = () => { if (canSubmit) void submit(selection.value, subjects); };

  return { frame: <ProductionComposerFrame attachments={attachments} busy={busy} inputDisabled={preparing}
      value={state.inputValue} onChange={(value) => runtime.setInputValue(value)} onSubmit={send}
      formLabel={tUi("Генерация изображения")} inputLabel={tUi("Описание изображения")} placeholder={tUi("Опишите изображение, которое хотите создать…")}
      prefix={prefix}
      materials={<HomeImageAttachments controller={attachments} disabled={busy} subjects={subjects} onRemoveSubject={(id) => setSubjects(subjects.filter((subject) => subject.id !== id))} />}
      parameters={<>
              <ModelSelector modality="image" ariaLabel={tUi("Модель изображения")} value={selection.value.model}
                options={(catalog.generationModels ?? catalog.imageModels).map((model) => ({ value: model.id, label: model.label }))}
                disabled={busy || catalog.loading || unavailable} surface="liquid" className="home-image-model"
                onChange={(model) => setDraft(resolveHomeImageSelection({ ...selection.value, model }, catalog.generationModels ?? catalog.imageModels).value)} />
              {selection.aspectRatios.some((ratio) => ratio !== 'auto') ? <DarkSelect surface="liquid" ariaLabel={tUi("Формат изображения")} value={selection.value.aspectRatio}
                options={selection.aspectRatios.map((value) => ({ value, label: value === 'auto' ? tUi("Авто") : value, icon: <Square size={15} /> }))}
                disabled={busy || unavailable} onChange={(aspectRatio) => setDraft({ ...selection.value, aspectRatio })} /> : null}
              {selection.sizes.some((size) => size !== 'auto') ? <DarkSelect surface="liquid" ariaLabel={tUi("Размер изображения")} value={selection.value.size}
                options={selection.sizes.map((value) => ({ value, label: value === 'auto' ? tUi("Авто") : value }))}
                disabled={busy || unavailable} onChange={(size) => setDraft({ ...selection.value, size })} /> : null}
      </>}
      tools={<>

            <HomeSubjectPicker compact workspaceId={workspaceId} selectedIds={subjects.map((subject) => subject.id)} onChange={(_ids, items) => setSubjects(items)} disabled={busy} />
            <HomeLibraryReferencePicker workspaceId={workspaceId} disabled={busy || !attachments.canAdd} variant="card"
              count={attachments.items.length} maxCount={referenceLimit} onChoose={async (files) => { await attachments.addFiles(files); }} />
            {busy && state.phase === 'streaming' ? <button type="button" className="home-image-generate" onClick={onCancel}><Square size={16} /><strong>{tUi("Остановить")}</strong></button>
              : <button type="submit" className="home-image-generate" disabled={!canSubmit}>
                {busy ? <LoaderCircle size={18} className="home-generation-spinner" /> : <Sparkles size={18} />}
                <strong>{busy ? tUi("Подготовка…") : tUi("Создать")}</strong><small>{tUi("Изображение")}</small></button>}
      </>} />, notice: <>
    {unavailable ? <p className="home-image-error" role="alert">{tUi("Каталог моделей недоступен. Обновите страницу и попробуйте ещё раз.")}</p> : null}
    {error ? <p className="home-image-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
  </> };
}
