'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import { ArrowRight, Check, CircleAlert, Folder, Link2, LoaderCircle, Play, Route, RotateCcw } from '@prodactionpro/ui-core/icons';
import { useCallback, useState } from 'react';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { PipelinePicker } from '@/features/pipeline-selection/ui/pipeline-picker';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { usePipelinePlaygroundModel, type PipelinePlaygroundModel } from '../model/use-pipeline-playground-model';
import { PipelineInputField } from './pipeline-playground-inputs';
import { PipelineResult } from './pipeline-playground-result';

export function PipelinePlaygroundPage({ initialEndpoint = '' }: { initialEndpoint?: string }) {
  const { activeWorkspace } = useWorkspaceShell();
  return <WorkspacePlayground key={activeWorkspace?.id ?? 'loading'} workspaceId={activeWorkspace?.id} initialEndpoint={initialEndpoint} />;
}

function WorkspacePlayground({ initialEndpoint, workspaceId }: { initialEndpoint: string; workspaceId?: string }) {
  const tUi = useTranslations();
  const updateEndpointUrl = useCallback((endpoint: string) => {
    // Update a shareable URL without navigating or remounting the input form.
    window.history.replaceState(null, '', `/playground?endpoint=${encodeURIComponent(endpoint)}`);
  }, []);
  const model = usePipelinePlaygroundModel(workspaceId ? initialEndpoint : '', updateEndpointUrl, workspaceId);
  const [pickerOpen, setPickerOpen] = useState(false);
  return <ProductionSectionLayout title="Playground" back={{ href: '/flows', label: tUi("Вернуться во Flows") }} className="playground-page">
    <div className="playground-content">
      <div className="playground-intro"><p>{tUi("Пайплайн — готовый процесс из вашего Flow. Добавляйте разные материалы, запускайте и сравнивайте результаты.")}</p></div>
      <PipelineConnection model={model} onChoose={() => setPickerOpen(true)} workspaceReady={Boolean(workspaceId)} />
      <div className="playground-workbench">
        <PipelineInputs model={model} />
        <PipelineResult descriptor={model.descriptor} error={typeof (model.executionError) === 'string' ? tUi((model.executionError) as string) : (model.executionError)} run={model.run} onRefresh={model.refreshRun} />
      </div>
    </div>
    <PipelinePicker open={pickerOpen} workspaceId={workspaceId} selectedPublicId={model.descriptor?.publicId} onClose={() => setPickerOpen(false)}
      onSelect={(pipeline) => { setPickerOpen(false); void model.connectPipeline(`/v1/pipelines/${encodeURIComponent(pipeline.endpointPublicId)}/runs`); }} />
  </ProductionSectionLayout>;
}

function PipelineConnection({ model, onChoose, workspaceReady }: { model: PipelinePlaygroundModel; onChoose(): void; workspaceReady: boolean }) {
  const tUi = useTranslations();
  const [linkOpen, setLinkOpen] = useState(false);
  return <section className="playground-connect-card" aria-labelledby="playground-connect-title">
    <div className="playground-connection-row">
      <div className="playground-pipeline-identity"><span className="playground-pipeline-icon">{model.connectionPending ? <LoaderCircle className="playground-spinner" size={24} /> : <Route size={24} />}</span>
        <div><h2 id="playground-connect-title">{model.connectionPending ? tUi("Подключаем pipeline…") : model.descriptor?.name ?? tUi("С чего начнём?")}</h2>
          <p>{model.descriptor ? <><span className="playground-connected"><Check size={12} />{tUi("Готов к тесту")}</span>  {' '}{tUi("· Версия")}{' '} {model.descriptor.version}</> : tUi("Сохранённый pipeline из проекта или ссылка на него.")}</p></div></div>
      <div className="playground-connection-actions">
        <button type="button" className="playground-button playground-button-primary" disabled={!workspaceReady || model.busy} onClick={onChoose}>
          <Folder size={16} />{model.descriptor ? tUi("Выбрать другой") : tUi("Выбрать из проектов")}<ArrowRight size={15} /></button>
        <button type="button" className="playground-button" aria-expanded={linkOpen} aria-controls="playground-link-input" disabled={model.busy}
          onClick={() => setLinkOpen((open) => !open)}><Link2 size={16} />{tUi("По ссылке")}</button>
      </div>
    </div>
    {linkOpen ? <form id="playground-link-input" className="playground-endpoint-form" onSubmit={(event) => { event.preventDefault(); void model.connectPipeline(model.endpoint); }}>
      <label><span className="playground-sr-only">{tUi("Ссылка на pipeline")}</span><Link2 size={16} />
        <PuiInput aria-describedby={model.connectionError ? 'playground-connection-error' : undefined} disabled={model.busy}
          onChange={(event) => model.changeEndpoint(event.target.value)} placeholder={tUi("Вставьте ссылку на pipeline")} spellCheck={false} inputMode="url" value={model.endpoint} /></label>
      <button className="playground-button" disabled={model.connectionPending || model.busy || !model.endpoint.trim()} type="submit">
        {model.connectionPending ? <LoaderCircle className="playground-spinner" size={16} /> : <ArrowRight size={16} />}{tUi("Загрузить")}</button>
    </form> : null}
    {model.connectionError ? <p className="playground-message playground-message-error" id="playground-connection-error" role="alert"><CircleAlert size={16} />{typeof (model.connectionError) === 'string' ? tUi((model.connectionError) as string) : (model.connectionError)}</p> : null}
  </section>;
}

function PipelineInputs({ model }: { model: PipelinePlaygroundModel }) {
  const tUi = useTranslations();
  const fields = model.descriptor?.inputs ?? [];
  const required = fields.filter((field) => field.required);
  const filled = required.filter((field) => !model.inputBuild.errors[field.name]).length;
  return <section className="playground-input-card" aria-labelledby="playground-input-title">
    <div className="playground-section-heading"><div><span className="playground-eyebrow">INPUT</span><h2 id="playground-input-title">{tUi("Материалы для запуска")}</h2><p>{tUi("Только то, что нужно этому pipeline.")}</p></div>
      {model.descriptor && required.length ? <span className="playground-readiness">{filled} / {required.length}</span> : null}</div>
    {!model.descriptor ? <div className="playground-placeholder"><Folder size={26} /><strong>{tUi("Сначала выберите pipeline")}</strong><span>{tUi("Здесь появятся нужные ему поля и места для файлов.")}</span></div>
      : fields.length === 0 ? <div className="playground-placeholder"><Check size={26} /><strong>{tUi("Всё готово")}</strong><span>{tUi("Для этого pipeline дополнительные материалы не нужны.")}</span></div>
      : <div className="playground-fields">{fields.map((field) => <PipelineInputField key={`${model.descriptor?.publicId}:${field.name}`} field={field}
        draft={model.drafts[field.name]} disabled={model.busy}
        error={model.uploadErrors[field.name] ?? (!model.uploadingFields.has(field.name) && model.drafts[field.name] !== undefined ? model.inputBuild.errors[field.name] : undefined)}
        onChange={(value) => model.changeDraft(field.name, value)} onUpload={(files) => void model.uploadFiles(field, files)}
        uploading={model.uploadingFields.has(field.name)} pendingNames={model.uploadingNames[field.name]} />)}</div>}
    <div className="playground-execute-row"><span>{model.busy ? tUi("Выполняем pipeline. Результат появится справа.") : model.uploadingFields.size ? tUi("Подготавливаем файлы…")
      : model.descriptor && !model.inputBuild.ready ? tUi("Добавьте материалы в обязательные поля.") : tUi("Запуск использует AI-бюджет рабочего пространства.")}</span>
      <button className="playground-execute-button" disabled={model.executeDisabled} onClick={() => void model.executePipeline()} type="button">
        {model.busy ? <LoaderCircle className="playground-spinner" size={17} /> : model.run?.status === 'succeeded' ? <RotateCcw size={17} /> : <Play size={17} />}
        {model.executionPending ? tUi("Запускаем…") : model.runActive ? tUi("Выполняется…") : model.run?.status === 'succeeded' ? tUi("Запустить ещё раз") : tUi("Запустить pipeline")}
      </button></div>
  </section>;
}
