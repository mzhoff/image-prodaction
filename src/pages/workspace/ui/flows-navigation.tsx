'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import Link from 'next/link';

export function FlowsNavigation({ active }: { active: 'documents' | 'published' }) {
  const tUi = useTranslations();
  const items = [
    { id: 'documents', href: '/flows', label: tUi("Мои flows") },
    { id: 'published', href: '/pipelines', label: tUi("Опубликованные") },
  ];
  return <nav className="production-section-navigation" aria-label={tUi("Разделы Flows")}>
    {items.map((item) => <Link key={item.id} href={item.href} aria-current={active === item.id ? 'page' : undefined}>{item.label}</Link>)}
  </nav>;
}
