'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { LoaderCircle, RotateCcw, UserRound, X, FileText } from '@prodactionpro/ui-core/icons';
import { useEffect, useState } from 'react';
import { isHeicImageFile } from '@/shared/lib/normalize-image-file';
import type { HomeAttachments } from '../model/use-home-image-submit';
import type { HomeSubjectChoice } from '../api/home-subject-api';

export function HomeImageAttachments({ controller, disabled, subjects, onRemoveSubject, compact = false }: {
  compact?: boolean; controller: HomeAttachments; disabled: boolean; subjects: HomeSubjectChoice[]; onRemoveSubject: (id: string) => void;
}) {
  const tUi = useTranslations();
  if (!controller.items.length && !subjects.length) return null;
  const groups = [
    { label: tUi("Герои"), items: subjects.filter((item) => !item.subjectType || ['person', 'character', 'animal'].includes(item.subjectType)) },
    { label: tUi("Локации"), items: subjects.filter((item) => item.subjectType === 'place') },
    { label: tUi("Объекты"), items: subjects.filter((item) => item.subjectType && ['object', 'product', 'vehicle'].includes(item.subjectType)) },
  ].filter((group) => group.items.length);
  return <div className="home-material-groups" aria-label={tUi("Материалы для генерации")}>
    {groups.map((group) => <section className="home-material-group" key={group.label} aria-label={group.label}>
      {!compact ? <h3>{group.label}</h3> : null}<ul className="home-image-attachments">
        {group.items.map((subject) => <li key={subject.id} title={subject.name}>
          {subject.imageAssetIds[0] ? <img src={`/api/assets/${encodeURIComponent(subject.imageAssetIds[0])}/content?variant=thumbnail`} alt={subject.name} draggable={false} />
            : <span className="home-material-fallback"><UserRound size={24} /><small>{subject.name}</small></span>}
          <button type="button" aria-label={tUi("Убрать {p1}", { p1: subject.name })} disabled={disabled} onClick={() => onRemoveSubject(subject.id)}><X size={12} /></button>
        </li>)}
      </ul>
    </section>)}
    {controller.items.length ? <section className="home-material-group" aria-label={tUi("Референсы")}>{!compact ? <h3>{tUi("Референсы")}</h3> : null}
      <ul className="home-image-attachments" aria-label={tUi("Прикреплённые материалы")}>
        {controller.items.map((item) => <li key={item.id} data-state={item.status} data-kind={item.file.type.startsWith('image/') ? 'image' : 'file'}>
          <ComposerFilePreview file={item.file} />
          <button type="button" aria-label={tUi("Убрать референс {p1}", { p1: item.file.name })} disabled={disabled}
            onClick={() => void controller.remove(item.id)}><X size={12} /></button>
          {item.status === 'uploading' || item.status === 'queued' ? <span className="home-reference-progress" role="status"><LoaderCircle size={17} />{item.status === 'queued' ? isHeicImageFile(item.file) ? tUi("Обработка HEIC…") : tUi("Подготовка…") : item.progress >= 1 ? tUi("Проверяем…") : tUi("Загрузка {p1}%", { p1: Math.round(item.progress * 100) })}</span> : null}
          {item.status === 'failed' ? <span className="home-reference-failed" role="alert" title={typeof (item.error) === 'string' ? tUi((item.error) as string) : (item.error)}>{tUi("Не загружен")}<button type="button" disabled={disabled} aria-label={tUi("Повторить загрузку {p1}", { p1: item.file.name })} onClick={() => void controller.retry(item.id)}><RotateCcw size={12} /></button></span> : null}
        </li>)}
      </ul>
      {controller.items.filter((item) => item.status === 'failed').map((item) => <p key={item.id} className="production-composer-file-hint" role="alert">{item.file.name}: {item.error || tUi("Не удалось загрузить файл. Повторите попытку.")}</p>)}
    </section> : null}
  </div>;
}

export function ComposerFilePreview({ file }: { file: File }) {
  const [localUrl, setLocalUrl] = useState<string>();
  useEffect(() => {
    if (!/^(image|audio|video)\//.test(file.type) || isHeicImageFile(file)) return;
    const url = URL.createObjectURL(file); setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (file.type.startsWith('image/') && !isHeicImageFile(file) && localUrl) return <img src={localUrl} alt={file.name} draggable={false} />;
  return <span className="production-file-preview">
    {file.type.startsWith('video/') && localUrl ? <video src={localUrl} controls preload="metadata" aria-label={file.name} />
      : file.type.startsWith('audio/') && localUrl ? <audio src={localUrl} controls preload="metadata" aria-label={file.name} /> : <FileText size={22} />}
    <small title={file.name}>{file.name}</small>
  </span>;
}
