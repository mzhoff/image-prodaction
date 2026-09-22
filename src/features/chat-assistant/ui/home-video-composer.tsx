'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useChatRuntime, useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import { Clock, LoaderCircle, Sparkles, Square, Volume2 } from '@prodactionpro/ui-core/icons';
import { useEffectEvent, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ModelSelector } from '@/features/model-selector/ui/model-selector';
import { loadVideoModels } from '@/shared/api/video-model-catalog';
import { DarkSelect } from '@/shared/ui/dark-select';
import { validateVideoRequest, type VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { buildHomeVideoIntentRequest, DEFAULT_VIDEO_CAMERA, type HomeVideoIntent, type VideoCameraSettings } from '@/shared/media/home-video-intent';
import { mergeVideoDirectionSubjectImages } from '@/shared/media/home-video-direction';
import { DEFAULT_HOME_VIDEO_SELECTION, resolveHomeVideoSelection, type HomeVideoSelection } from '../model/home-video-selection';
import { useHomeVideoMaterials } from '../model/use-home-video-materials';
import type { VideoSlotBindings } from '../model/home-video-materials';
import type { HomeAttachments } from '../model/use-home-image-submit';
import type { useHomeVideoSubmit } from '../model/use-home-video-submit';
import { useHomeVideoSettings } from './home-video-settings';
import { ProductionComposerFrame } from './production-composer-frame';

export function useHomeVideoComposer({ workspaceId, attachments, draft, setDraft, submission, prefix, camera, setCamera, bindings, setBindings }: {
  workspaceId: string; attachments: HomeAttachments; draft: HomeVideoSelection; setDraft: (value: HomeVideoSelection) => void;
  submission: ReturnType<typeof useHomeVideoSubmit>; prefix: ReactNode;
  camera: VideoCameraSettings; setCamera: (value: VideoCameraSettings) => void;
  bindings: VideoSlotBindings; setBindings: Dispatch<SetStateAction<VideoSlotBindings>>;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const runtime = useChatRuntime();
  const state = useChatRuntimeState();
  const [models, setModels] = useState<VideoModelCapabilities[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void loadVideoModels().then((value) => { if (active) { setModels(value); setCatalogError(value.length ? '' : tEffect("В каталоге пока нет доступных моделей видео.")); } })
      .catch(() => { if (active) setCatalogError(tEffect("Каталог видео недоступен. Попробуйте обновить его.")); });
    return () => { active = false; };
  }, [revision]);
  const { model, value } = resolveHomeVideoSelection(draft, models);
  const materials = useHomeVideoMaterials(attachments, model, bindings, setBindings);
  const busy = submission.preparing || ['loading', 'submitting', 'streaming'].includes(state.phase);
  const settings = useHomeVideoSettings({ workspaceId, attachments, materials, camera, disabled: busy,
    onReset: () => { setCamera(DEFAULT_VIDEO_CAMERA); setDraft(DEFAULT_HOME_VIDEO_SELECTION); } });
  const intent: HomeVideoIntent = { version: 1, slots: materials.slots, camera, direction: settings.direction };
  const disabled = busy || settings.resetting || !model || Boolean(catalogError);
  let referenceError = attachments.attachments.some((item) => item.kind !== 'image') ? tUi("Для видео нужны изображения. Остальные файлы можно обсудить в режиме «Текст».")
    : materials.unassigned.length && model ? tUi("Модель не принимает часть материалов. Выберите другую модель или уберите лишние вложения.") : '';
  let mode = 'text';
  if (!referenceError && model) {
    try {
      const request = mergeVideoDirectionSubjectImages(buildHomeVideoIntentRequest({ ...value, prompt: state.inputValue.trim() || 'Сцена', references: [] }, intent,
        (id) => `00000000-0000-4000-8000-${String(attachments.attachments.findIndex((item) => item.attachmentId === id) + 1).padStart(12, '0')}`),
        settings.subjects.map((subject) => ({ id: subject.id, name: subject.name, referenceAssetId: subject.imageAssetIds[0] })));
      mode = request.mode;
      referenceError = mode === 'references' && !model.references ? settings.subjects.some((subject) => subject.imageAssetIds[0])
        ? tUi("Эта модель не принимает фото героев. Выберите модель с референсами или уберите героев с фото во вкладке «История».")
        : tUi("Эта модель не поддерживает референсы. Выберите другую модель{p1}.", { p1: model.firstFrame ? ' или назначьте изображение первым кадром' : ' или уберите вложения' })
        : mode === 'frames' && !model.firstFrame ? tUi("Эта модель не принимает кадры. Выберите другую модель или уберите вложения.")
        : validateVideoRequest(request, model) ?? '';
    } catch (error) { referenceError = error instanceof Error ? error.message : tUi("Проверьте материалы для видео."); }
  }
  const canSubmit = !disabled && !attachments.isUploading && !attachments.hasFailures && !referenceError && Boolean(state.inputValue.trim());
  return { frame: <ProductionComposerFrame attachments={attachments} busy={busy || settings.resetting} inputDisabled={submission.preparing || settings.resetting} prefix={prefix}
      value={state.inputValue} onChange={(input) => runtime.setInputValue(input)} onSubmit={() => { if (canSubmit) void submission.submit(value, intent); }}
      formLabel={tUi("Генерация видео")} inputLabel={tUi("Описание видео")} placeholder={tUi("Опишите сцену, движение и настроение видео…")}
      materials={settings.tray}
      parameters={<>
        <ModelSelector modality="video" ariaLabel={tUi("Модель видео")} value={value.model} surface="liquid" className="home-image-model"
          options={models.map((item) => ({ value: item.key, label: item.label }))} disabled={disabled}
          onChange={(key) => setDraft(resolveHomeVideoSelection({ ...value, model: key }, models).value)} />
        {model?.resolutions.length ? <DarkSelect surface="liquid" ariaLabel={tUi("Качество видео")} value={value.resolution} disabled={disabled}
          options={model.resolutions.map((resolution) => ({ value: resolution, label: resolution }))} onChange={(resolution) => setDraft({ ...value, resolution })} /> : null}
        {model?.aspectRatios.length ? <DarkSelect surface="liquid" ariaLabel={tUi("Формат видео")} value={value.aspectRatio} disabled={disabled}
          options={model.aspectRatios.map((ratio) => ({ value: ratio, label: ratio, icon: <Square size={14} /> }))} onChange={(aspectRatio) => setDraft({ ...value, aspectRatio })} /> : null}
        {model?.durations.length ? <DarkSelect surface="liquid" ariaLabel={tUi("Длительность видео")} value={String(value.duration)} disabled={disabled}
          options={model.durations.map((duration) => ({ value: String(duration), label: tUi("{p1} с", { p1: duration }), icon: <Clock size={14} /> }))} onChange={(duration) => setDraft({ ...value, duration: Number(duration) })} /> : null}
        {model?.audio ? <DarkSelect surface="liquid" ariaLabel={tUi("Звук видео")} value={value.generateAudio ? 'on' : 'off'} disabled={disabled}
          options={[{ value: 'on', label: tUi("Со звуком"), icon: <Volume2 size={14} /> }, { value: 'off', label: tUi("Без звука"), icon: <Volume2 size={14} /> }]}
          onChange={(audio) => setDraft({ ...value, generateAudio: audio === 'on' })} /> : null}
      </>}
      tools={<>
        {settings.toggle}
        <button type="submit" className="home-image-generate" disabled={!canSubmit}>
          {busy ? <LoaderCircle size={18} className="home-generation-spinner" /> : <Sparkles size={18} />}<strong>{busy ? tUi("Подготовка…") : tUi("Создать")}</strong><small>{tUi("Видео")}</small>
        </button></>} />, notice: <>
    {materials.notice ? <p className="production-composer-notice" role="status">{typeof (materials.notice) === 'string' ? tUi((materials.notice) as string) : (materials.notice)}</p> : null}
    {referenceError ? <p className="home-video-reference-hint" role="status">{typeof (referenceError) === 'string' ? tUi((referenceError) as string) : (referenceError)}</p> : null}
    {catalogError ? <p className="home-image-error" role="alert">{typeof (catalogError) === 'string' ? tUi((catalogError) as string) : (catalogError)} <button type="button" onClick={() => setRevision((number) => number + 1)}>{tUi("Обновить каталог")}</button></p> : null}
    {submission.error ? <p className="home-image-error" role="alert">{typeof (submission.error) === 'string' ? tUi((submission.error) as string) : (submission.error)} <button type="button" onClick={submission.refresh}>{tUi("Обновить статус")}</button></p> : null}
    {settings.dialogs}
  </> };
}
