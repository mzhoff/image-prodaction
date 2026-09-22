'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { LanguageControl } from '@/shared/i18n/language-control';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthThemeSwitch } from '@/shared/ui/theme-control';
import { ArrowLeft } from '@prodactionpro/ui-core/icons';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import { AuthPromoGallery } from './auth-promo-gallery';
import './auth-atmosphere.css';

interface AuthShellProps {
  ariaLabel: string;
  children: ReactNode;
  backAction?: ReactNode;
}

export function AuthShell({ ariaLabel, children, backAction }: AuthShellProps) {
  const tUi = useTranslations();
  return (
    <main className="auth-page">
      <aside className="auth-promo" aria-label={tUi("Возможности продукта")}>
        <div className="auth-promo-content">
          <h1><span className="auth-dream-accent">{tUi("Мечтайте.")}</span><br />{tUi("Способ найдётся.")}</h1>
          <p>{tUi("Профессиональные инструменты для креаторов — от первой идеи до готового визуала.")}</p>
        </div>
        <AuthPromoGallery />
      </aside>

      <section className="auth-form-area" aria-label={ariaLabel}>
        <div className="auth-preference-controls"><LanguageControl /><AuthThemeSwitch /></div>
        <div className="auth-form-shell">
          <div className="auth-topline">
            {backAction ?? <Link className="auth-back-link" href="/">
              <ArrowLeft size={16} aria-hidden="true" />
              {tUi("Вернуться на сайт")}</Link>}
            <Link className="auth-shell-logo reverie-logo-link" href="/" aria-label="Reverie">
              <ReverieLogo />
            </Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
