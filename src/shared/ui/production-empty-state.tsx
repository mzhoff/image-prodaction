'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useId } from 'react';
import styles from './production-empty-state.module.css';

export type ProductionEmptyKind = 'stories' | 'storyboard' | 'timeline' | 'library' | 'flows' | 'projects' | 'usage';
type EmptyAction = { label: string } & ({ href: string } | { onClick: () => void });
const copy: Record<ProductionEmptyKind, { title: string; description: string }> = {
  usage: { title: 'Здесь будет ваша статистика', description: 'Пополните баланс и начните создавать.' },
  stories: { title: 'Здесь начнётся ваша история', description: 'Разложите замысел на кадры или соберите монтаж из готовых материалов.' },
  storyboard: { title: 'От идеи — к первым кадрам', description: 'Расскажите замысел. Соавтор поможет превратить его в сценарий и раскадровку.' },
  timeline: { title: 'Соберите моменты в историю', description: 'Объедините видео, изображения и звук в одном монтаже.' },
  library: { title: 'Место для ваших материалов', description: 'Загруженные файлы и результаты генераций соберутся здесь.' },
  flows: { title: 'Начните со своего первого Flow', description: 'Свяжите шаги в один процесс — и возвращайтесь к нему с новыми идеями.' },
  projects: { title: 'Соберите всё вокруг одной идеи', description: 'Проект объединяет Flows, раскадровки, монтажи и связанные материалы.' },
};

/** Decorative transparent art is always contained in full, including reflections and caustics. */
export function ProductionEmptyState({ kind, title, description, action, secondaryAction, compact = false }: {
  kind: ProductionEmptyKind; title?: string; description?: string; action?: EmptyAction; secondaryAction?: EmptyAction; compact?: boolean;
}) {
  const tUi = useTranslations();
  const ui_copy = useUiCatalog(copy, tUi);
  const headingId = useId();
  return <section className={styles.empty} data-compact={compact || undefined} data-empty-kind={kind} aria-labelledby={headingId}>
    <img className={styles.art} src={`/empty-states/${kind}.webp`} alt="" width={768} height={768} decoding="async" draggable={false} />
    <div className={styles.copy}><h2 id={headingId}>{title ?? ui_copy[kind].title}</h2><p>{description ?? ui_copy[kind].description}</p></div>
    {action || secondaryAction ? <div className={styles.actions}>{action ? <Action value={action} /> : null}{secondaryAction ? <Action value={secondaryAction} secondary /> : null}</div> : null}
  </section>;
}

function Action({ value, secondary = false }: { value: EmptyAction; secondary?: boolean }) {
  const className = `${styles.action} ${secondary ? styles.secondary : ''}`;
  return 'href' in value ? <Link className={className} href={value.href}>{value.label}</Link>
    : <button className={className} type="button" onClick={value.onClick}>{value.label}</button>;
}
