'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useEffectEvent, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronRight, Search, UserRound, X } from '@prodactionpro/ui-core/icons';
import { loadHomeSubjects, type HomeSubjectChoice } from '../api/home-subject-api';
import { HomeMaterialTrigger } from './home-material-trigger';
import styles from './home-subject-picker.module.css';

const MAX_SUBJECTS = 3;

export interface HomeSubjectPickerProps {
  workspaceId: string;
  selectedIds: string[];
  onChange: (ids: string[], subjects: HomeSubjectChoice[]) => void;
  disabled?: boolean;
  compact?: boolean;
  maxSubjects?: number;
}

export function HomeSubjectPicker({ workspaceId, selectedIds, onChange, disabled = false, compact = false }: HomeSubjectPickerProps) {
  const tUi = useTranslations();
  const [open, setOpen] = useState(false);
  const count = new Set(selectedIds).size;
  return <>
    {compact ? <HomeMaterialTrigger label={tUi("Герои")} icon={<UserRound />} count={count} disabled={disabled || !workspaceId}
      ariaLabel={tUi("Герои, выбрано {p1} из {p2}", { p1: count, p2: MAX_SUBJECTS })} expanded={open} onClick={() => setOpen(true)} /> : <button type="button" className={styles.trigger} disabled={disabled || !workspaceId}
      aria-label={compact ? tUi("Герои, выбрано {p1} из {p2}", { p1: count, p2: MAX_SUBJECTS }) : undefined}
      data-selected={count > 0} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className={styles.icon}><UserRound size={22} /></span>
      {compact ? <span className={styles.compactCount} aria-hidden="true">{count}/{MAX_SUBJECTS}</span> : null}
      <span className={styles.triggerCopy}><strong>{tUi("Герои")}</strong><small>{count ? tUi("Выбрано: {p1}", { p1: count }) : tUi("Выбрать из Library")}</small></span>
      <ChevronRight size={15} className={styles.chevron} />
    </button>}
    {open ? <SubjectDialog key={workspaceId} workspaceId={workspaceId} selectedIds={selectedIds}
      onChange={onChange} disabled={disabled} onClose={() => setOpen(false)} /> : null}
  </>;
}

export function SubjectDialog({ workspaceId, selectedIds, onChange, disabled, onClose, maxSubjects = MAX_SUBJECTS }: HomeSubjectPickerProps & { onClose: () => void }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [draft, setDraft] = useState(() => [...new Set(selectedIds)].slice(0, maxSubjects));
  const [subjects, setSubjects] = useState<HomeSubjectChoice[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSubjects([]);
    void loadHomeSubjects(workspaceId, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setSubjects(items); })
      .catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить героев. Проверьте подключение и повторите попытку.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, attempt]);
  const availableIds = new Set(subjects.map((subject) => subject.id));
  const selected = draft.filter((id) => availableIds.has(id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = subjects.filter((subject) => `${subject.name} ${subject.identitySummary}`.toLocaleLowerCase().includes(normalizedQuery));
  const unavailable = !loading && !error && selected.length < draft.length;
  const toggle = (id: string) => {
    if (disabled) return;
    if (selected.includes(id)) setDraft(selected.filter((value) => value !== id));
    else if (maxSubjects === 1) setDraft([id]);
    else if (selected.length < maxSubjects) setDraft([...selected, id]);
  };
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.panel}>
      <header><span className={styles.icon}><UserRound size={24} /></span>
        <div><h2 id={titleId}>{tUi("Герои")}</h2><p id={descriptionId}>{maxSubjects === 1 ? tUi("Выберите героя для истории. Его исходный паспорт останется в Library.") : tUi("Выберите до трёх героев. Описание и основное фото помогут сохранить узнаваемость.")}</p></div>
        <button type="button" className={styles.close} aria-label={tUi("Закрыть выбор героев")} onClick={onClose}><X size={18} /></button>
      </header>
      <label className={styles.search}><Search size={17} /><input autoFocus type="search" aria-label={tUi("Поиск героев")}
        placeholder={tUi("Имя или описание")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className={styles.results} aria-busy={loading}>
        {loading ? <p className={styles.state} role="status">{tUi("Загружаем героев…")}</p> : error ? <div className={styles.state} role="alert">
          <p>{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p><button type="button" className={styles.secondary} onClick={() => setAttempt((value) => value + 1)}>{tUi("Повторить")}</button>
        </div> : <>
          <div className={styles.grid}>{visible.map((subject) => {
            const checked = selected.includes(subject.id);
            const limited = maxSubjects !== 1 && !checked && selected.length >= maxSubjects;
            return <button type="button" role="checkbox" aria-checked={checked} key={subject.id}
              className={styles.card} data-selected={checked} disabled={disabled || limited}
              aria-label={subject.name} title={limited ? tUi("Можно выбрать до трёх героев. Сначала снимите один выбор.") : subject.name}
              onClick={() => toggle(subject.id)}>
              <SubjectCover subject={subject} />
              <span className={styles.selectionIcon} aria-hidden="true">{checked ? <Check size={14} /> : <UserRound size={14} />}</span>
              <span className={styles.subjectCopy}><strong>{subject.name}</strong><span>{subject.identitySummary || tUi("Профиль без краткого описания")}</span></span>
            </button>;
          })}</div>
          {!visible.length ? <div className={styles.state}>
            <UserRound size={28} /><strong>{query ? tUi("Герои не найдены") : tUi("В Library пока нет героев")}</strong>
            <p>{query ? tUi("Измените имя или описание в поиске.") : tUi("Создайте профиль с описанием и референсами, чтобы использовать его в генерациях.")}</p>
            {query ? <button type="button" className={styles.secondary} onClick={() => setQuery('')}>{tUi("Сбросить поиск")}</button>
              : <Link className={styles.secondary} href="/library?section=subjects" onClick={onClose}>{tUi("Открыть Library")}</Link>}
          </div> : null}
        </>}
      </div>
      {unavailable ? <p className={styles.notice} role="status">{tUi("Некоторые выбранные профили больше недоступны. Выберите доступных героев заново.")}</p> : null}
      <footer><div className={styles.selectionSummary}><span role="status">{tUi("Выбрано")}{' '} {loading ? draft.length : selected.length} / {maxSubjects}</span>
        <button type="button" disabled={disabled || draft.length === 0} onClick={() => setDraft([])}>{tUi("Очистить")}</button></div>
        <Link className={styles.libraryLink} href="/library?section=subjects" onClick={onClose}>Library</Link>
        <button type="button" className={styles.apply} disabled={disabled || loading || Boolean(error)} onClick={() => { onChange(selected, subjects.filter((subject) => selected.includes(subject.id))); onClose(); }}>{tUi("Готово")}</button>
      </footer>
    </div>
  </dialog>;
}

function SubjectCover({ subject }: { subject: HomeSubjectChoice }) {
  const firstImage = subject.imageAssetIds[0];
  const [failed, setFailed] = useState(false);
  return <span className={styles.cover}>{firstImage && !failed
    ? <img src={`/api/assets/${encodeURIComponent(firstImage)}/content?variant=thumbnail`} alt="" loading="lazy" onError={() => setFailed(true)} draggable={false} />
    : <UserRound size={38} strokeWidth={1.25} />}</span>;
}
