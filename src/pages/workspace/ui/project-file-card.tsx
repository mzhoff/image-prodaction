'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { FileText, Film, ImageIcon, Mic, Route } from '@prodactionpro/ui-core/icons';
import type { ProjectFileItem } from '../model/project-container-items';
import styles from './project-container.module.css';

const labels = { flow: 'Flow', story: 'Storyboard', timeline: 'Timeline', image: 'Изображение', video: 'Видео', audio: 'Аудио' };
const icons = { flow: Route, story: FileText, timeline: Film, image: ImageIcon, video: Film, audio: Mic };

export function ProjectFileCard({ item }: { item: ProjectFileItem }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const ui_labels = useUiCatalog(labels, tUi);
  const Icon = icons[item.kind];
  return <article className={styles.card}>
    <Link href={item.href} className={styles.cardLink} draggable={false}>
      <span className={styles.preview}>
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" draggable={false} /> : <Icon size={32} strokeWidth={1.25} />}
        <span className={styles.kind}>{ui_labels[item.kind]}</span>
      </span>
      <span className={styles.identity}><strong>{item.name}</strong><time dateTime={item.updatedAt}>
        {new Date(item.updatedAt).toLocaleDateString(language, { day: 'numeric', month: 'short' })}</time></span>
    </Link>
  </article>;
}
