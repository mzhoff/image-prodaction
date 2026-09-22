'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import Link from 'next/link';

export function LibraryNavigation({ section }: { section: string | null | undefined }) {
  const tUi = useTranslations();
  const items = [
    { key: '', label: tUi("Медиа"), href: '/library' },
    { key: 'subjects', label: tUi("Персонажи"), href: '/library?section=subjects' },
    { key: 'styles', label: tUi("Стили"), href: '/library?section=styles' },
    { key: 'pipelines', label: tUi("Сохранённые flows"), href: '/library?section=pipelines' },
    { key: 'projects', label: tUi("По проектам"), href: '/library?section=projects' },
  ];
  const active = items.some((item) => item.key === section) ? section : '';
  return <nav className="production-section-navigation" aria-label={tUi("Разделы Library")}>
    {items.map((item) => <Link key={item.key} href={item.href}
      aria-current={active === item.key ? 'page' : undefined}>{item.label}</Link>)}
  </nav>;
}
