'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ReactNode } from 'react';
import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { ArrowUp, LoaderCircle, Square } from '@prodactionpro/ui-core/icons';
import type { HomeAttachments } from '../model/use-home-image-submit';
import { compactModelLabel } from './chat-attachment-presentation';
import { AssistantModelSelector } from './assistant-model-selector';
import './compact-assistant-composer.css';
import { HomeImageAttachments } from './home-image-attachments';
import { HomeLibraryReferencePicker } from './home-library-reference-picker';
import { ProductionComposerFrame } from './production-composer-frame';
import { HomeSubjectPicker } from './home-subject-picker';
import type { HomeSubjectChoice } from '../api/home-subject-api';
import { CHAT_ATTACHMENT_HINT, CHAT_MEDIA_ANALYSIS_NOTICE } from '@/modules/chat-assistant/contracts/composer-attachments';

export function useProductionTextComposer({ workspaceId, attachments, model, story = false, subjects = [], onSubjectsChange, saving = false, onSubmit, onCancel, prefix, parameters, compact = false, subjectControl }: {
  workspaceId: string; attachments: HomeAttachments; model: string; story?: boolean; onSubmit: () => Promise<void>; onCancel: () => void;
  prefix?: ReactNode; compact?: boolean; subjects?: HomeSubjectChoice[]; onSubjectsChange?: (subjects: HomeSubjectChoice[]) => void; saving?: boolean; parameters?: ReactNode;
  subjectControl?: ReactNode;
}) {
  const tUi = useTranslations();
  const runtime = useChatRuntime();
  const state = useChatRuntimeState();
  const busy = saving || ['loading', 'submitting', 'streaming'].includes(state.phase);
  const canSubmit = !busy && !attachments.isUploading && !attachments.hasFailures
    && Boolean(state.inputValue.trim() || attachments.attachments.length);
  const hasMedia = attachments.items.some((item) => /^(audio|video)\//.test(item.file.type));
  const subjectPicker = subjectControl ?? (onSubjectsChange ? <HomeSubjectPicker workspaceId={workspaceId} compact disabled={busy} selectedIds={subjects.map((item) => item.id)} onChange={(_ids, selected) => onSubjectsChange(selected)} /> : null);
  const libraryPicker = <HomeLibraryReferencePicker workspaceId={workspaceId} disabled={busy || !attachments.canAdd} variant={compact ? 'icon' : 'card'} count={attachments.items.length} onChoose={async (files) => { await attachments.addFiles(files); }} />;
  const modelControl = parameters ?? (compact ? <AssistantModelSelector model={model} disabled={busy} /> : <span className="production-composer-model" title={tUi("Модель пространства")}>{compactModelLabel(model)}</span>);
  return { frame: <ProductionComposerFrame prefix={prefix} compact={compact} attachments={attachments} busy={busy} inputDisabled={saving} value={state.inputValue} onChange={(value) => runtime.setInputValue(value)}
      onSubmit={() => { if (canSubmit) void onSubmit().catch(() => undefined); }}
      formLabel={story ? tUi("Диалог с соавтором") : tUi("Диалог с ассистентом")} inputLabel={story ? tUi("Сообщение соавтору") : tUi("Сообщение ассистенту")}
      placeholder={story ? tUi("Обсудим идею или напишем сцену…") : tUi("Что вы хотите создать?")}
      parameters={compact ? <>{libraryPicker}{subjectPicker}{modelControl}</> : modelControl}
      materials={<HomeImageAttachments compact={compact} controller={attachments} disabled={busy} subjects={subjects} onRemoveSubject={(id) => onSubjectsChange?.(subjects.filter((item) => item.id !== id))} />}
      tools={<>{!compact ? <>{subjectPicker}{libraryPicker}</> : null}
        {state.phase === 'streaming' ? <button type="button" className="home-image-generate" aria-label={tUi("Остановить ответ")} title={tUi("Остановить ответ")} onClick={onCancel}><Square size={16} /><strong>{tUi("Остановить")}</strong></button>
          : <button type="submit" className="home-image-generate" title={tUi("Отправить сообщение")} disabled={!canSubmit} aria-label={tUi("Отправить сообщение")}>
            {busy ? <LoaderCircle size={18} className="home-generation-spinner" /> : <ArrowUp size={18} />}<strong>{busy ? tUi("Подготовка…") : tUi("Отправить")}</strong><small>{story ? tUi("Соавтор") : tUi("Ассистент")}</small>
          </button>}</>} />, notice: hasMedia ? <p className="production-composer-notice" role="status">{CHAT_MEDIA_ANALYSIS_NOTICE}</p> : null };
}

export function ProductionTextComposer(props: Parameters<typeof useProductionTextComposer>[0]) {
  const tUi = useTranslations();
  const ui_CHAT_ATTACHMENT_HINT = useUiCatalog(CHAT_ATTACHMENT_HINT, tUi);
  const content = useProductionTextComposer(props);
  return <div className={`home-image-studio production-text-composer ${props.compact ? 'production-story-composer production-compact-composer' : ''}`}>
    {typeof (content.notice) === 'string' ? tUi((content.notice) as string) : (content.notice)}{content.frame}
    {!props.compact ? <p className="production-composer-file-hint">{props.story ? tUi("Расскажите, кто герой, чего он хочет и для кого эта история. Можно вставить текст, загрузить сценарий или добавить визуальный референс.") : ui_CHAT_ATTACHMENT_HINT}</p> : null}
  </div>;
}
