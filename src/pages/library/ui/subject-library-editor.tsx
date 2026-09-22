'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import { TextareaControl as PuiTextarea } from '@prodactionpro/ui-core/textarea-control';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffectEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Save, Upload, X } from '@prodactionpro/ui-core/icons';
import { createUuidV7 } from '@/shared/lib/id';
import { BrandSelect } from '@/shared/ui/brand-select';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { emptySubjectProfile, profileFields, subjectProfileFields, type LibrarySubjectProfile, type SubjectProfileFields } from '@/entities/production-graph/model/subject-profile';
import { fetchSubjectProfile, saveLibrarySubject, uploadSubjectReference } from '@/entities/production-graph/api/subject-library-api';
import { rememberLibrarySubject } from '@/entities/production-graph/api/use-subject-library';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { createSubjectCanvas } from '../model/create-subject-canvas';

const typeOptions = [
  { value: 'person', label: 'Человек' }, { value: 'character', label: 'Персонаж' }, { value: 'product', label: 'Продукт' },
  { value: 'object', label: 'Объект' }, { value: 'vehicle', label: 'Транспорт' }, { value: 'animal', label: 'Животное' }, { value: 'place', label: 'Место' },
];
const preserveOptions = [{ value: 'strict', label: 'Строго' }, { value: 'balanced', label: 'Сбалансированно' }, { value: 'flexible', label: 'Гибко' }];
const textFields = [
  ['identitySummary', 'Внешность и описание', 'Кто это? Возраст, лицо, телосложение, узнаваемые особенности.'],
  ['immutableTraits', 'Неизменные признаки', 'Идентичность, форма лица, силуэт, особые отметины — то, что необходимо сохранить.'],
  ['mutableAttributes', 'Изменяемые признаки', 'Одежда, поза, эмоции, освещение и другие допустимые изменения.'],
  ['negativeConstraints', 'Ограничения', 'Что нельзя изменять или добавлять.'],
  ['notes', 'Заметки', 'Дополнительный контекст для паспорта.'],
] as const;

export function SubjectLibraryEditor({ workspaceId, subjectId, navigation }: { workspaceId: string; subjectId: string; navigation?: ReactNode }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const ui_typeOptions = useUiCatalog(typeOptions, tUi);
  const ui_preserveOptions = useUiCatalog(preserveOptions, tUi);
  const ui_textFields = useUiCatalog(textFields, tUi);
  const router = useRouter();
  const [id] = useState(() => subjectId === 'new' ? createUuidV7() : subjectId);
  const [profile, setProfile] = useState<LibrarySubjectProfile | null>(null);
  const [fields, setFields] = useState<SubjectProfileFields>(emptySubjectProfile);
  const [savedFields, setSavedFields] = useState(JSON.stringify(emptySubjectProfile));
  const [loading, setLoading] = useState(subjectId !== 'new');
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingCanvas = useRef<{ id: string; revision: number } | null>(null);
  const inFlight = useRef(false);
  const dirty = JSON.stringify(fields) !== savedFields;
  useEffect(() => {
    if (subjectId === 'new') return;
    const controller = new AbortController();
    fetchSubjectProfile(workspaceId, subjectId, controller.signal).then((result) => {
      setProfile(result); setFields(profileFields(result)); setSavedFields(JSON.stringify(profileFields(result)));
    }).catch((caught: unknown) => { if (!controller.signal.aborted) { setLoadFailed(true); setError(caught instanceof Error ? caught.message : tEffect("Паспорт недоступен.")); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [subjectId, workspaceId]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
      if (!window.confirm(tEffect("В паспорте есть несохранённые изменения. Покинуть страницу?"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const change = <K extends keyof SubjectProfileFields>(key: K, value: SubjectProfileFields[K]) => setFields((current) => ({ ...current, [key]: value }));
  const save = async () => {
    const parsed = subjectProfileFields.safeParse(fields);
    if (!parsed.success) throw new Error(tUi("Укажите имя (до 120 символов), до 10 000 символов на поле и до 24 референсов."));
    const result = await saveLibrarySubject(workspaceId, id, profile?.revision ?? 0, parsed.data);
    setProfile(result); setFields(profileFields(result)); setSavedFields(JSON.stringify(profileFields(result)));
    rememberLibrarySubject(result); setNotice(tUi("Паспорт сохранён. Его можно загрузить в любом Subject Builder этого Workspace."));
    return result;
  };
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : tUi("Не удалось выполнить действие.")); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <ProductionSectionLayout title="Library" className="library-section" navigation={navigation}
    controls={<div className="production-section-context-heading">
      <Link className="studio-back" href="/library?section=subjects"><ArrowLeft size={16} />{tUi("Персонажи")}</Link>
      <h2>{profile ? profile.name : tUi("Новый персонаж")}</h2>
    </div>}>
    <div className="studio-organize-content">
      {loading ? <p role="status">{tUi("Загрузка паспорта…")}</p> : null}
      {error ? <p className="studio-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)} {loadFailed ? <button className="studio-button" onClick={() => window.location.reload()}>{tUi("Повторить")}</button> : null}</p> : null}
      {notice ? <p role="status">{typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}</p> : null}
      {!loading && !loadFailed ? <form className="studio-subject-form" onSubmit={(event) => { event.preventDefault(); void run(async () => {
        const saved = await save();
        if (subjectId === 'new') window.history.replaceState(null, '', `/library?section=subjects&subject=${saved.id}`);
      }); }}>
        <fieldset disabled={busy}>
          <div className="studio-form-fields">
            <label>{tUi("Имя")}<PuiInput required maxLength={120} value={fields.name} onChange={(event) => change('name', event.target.value)} placeholder={tUi("Имя персонажа")} /></label>
            <BrandSelect label={tUi("Тип персонажа")} value={fields.subjectType} options={ui_typeOptions} onChange={(value) => change('subjectType', value as SubjectProfileFields['subjectType'])} />
            <BrandSelect label={tUi("Сохранение идентичности")} value={fields.preserveStrength} options={ui_preserveOptions} onChange={(value) => change('preserveStrength', value as SubjectProfileFields['preserveStrength'])} />
            {ui_textFields.map(([key, label, placeholder]) => <label key={key}>{label}<PuiTextarea rows={key === 'identitySummary' ? 5 : 3} maxLength={10000}
              value={fields[key]} onChange={(event) => change(key, event.target.value)} placeholder={placeholder} /></label>)}
          </div>
          <aside className="studio-subject-references"><h2>{tUi("Референсы")}{' '} <span>{fields.imageAssetIds.length}/24</span></h2>
            <p className="studio-hint">{tUi("Оригиналы и миниатюры хранятся в Library. Первые четыре изображения используются в слотах канонических ракурсов Subject Builder.")}</p>
            <div className="studio-reference-grid">{fields.imageAssetIds.map((assetId, index) => <div key={assetId}>
              <img src={getRemoteAssetContentUrl(assetId, 'thumbnail')} alt={tUi("Референс {p1}", { p1: index + 1 })} draggable={false} />
              <button type="button" className="studio-button" aria-label={tUi("Убрать референс {p1}", { p1: index + 1 })} onClick={() => change('imageAssetIds', fields.imageAssetIds.filter((item) => item !== assetId))}><X size={14} /></button>
            </div>)}</div>
            <label className="studio-button studio-upload"><Upload size={16} />{tUi("Добавить изображения")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={fields.imageAssetIds.length >= 24}
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]; event.target.value = '';
                void run(async () => {
                  if (files.length + fields.imageAssetIds.length > 24) throw new Error(tUi("Можно добавить до 24 референсов."));
                  for (const file of files) {
                    const asset = await uploadSubjectReference(workspaceId, file);
                    setFields((current) => ({ ...current, imageAssetIds: [...current.imageAssetIds, asset.id] }));
                  }
                });
              }} /></label>
            <p className="studio-hint">{tUi("Описание по фотографии, генерация ракурсов и другие AI-инструменты доступны в Subject Builder. Открытие канваса не запускает платную генерацию.")}</p>
            {profile ? <details><summary>{tUi("Готовый паспорт")}</summary><pre className="studio-passport">{profile.passportText}</pre></details> : null}
          </aside>
        </fieldset>
        <div className="studio-form-actions">
          <button className="workspace-create-button" type="submit" disabled={busy || !fields.name.trim()}><Save size={16} />{busy ? tUi("Сохраняем…") : tUi("Сохранить персонажа")}</button>
          <button className="studio-button" type="button" disabled={busy || !fields.name.trim()} onClick={() => void run(async () => {
            const saved = dirty || !profile ? await save() : profile;
            const canvasId = await createSubjectCanvas(saved, pendingCanvas);
            router.push(`/projects/${canvasId}`);
          })}>{tUi("Открыть в Subject Builder")}</button>
          <span className="studio-hint">{dirty ? tUi("Есть несохранённые изменения") : profile ? tUi("Версия {p1}", { p1: profile.revision }) : ''}</span>
        </div>
      </form> : null}
    </div>
  </ProductionSectionLayout>;
}
