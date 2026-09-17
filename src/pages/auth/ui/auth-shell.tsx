import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthThemeSwitch } from '@/shared/ui/theme-control';
import { ArrowLeft } from '@prodactionpro/ui-core/icons';
import { ReverieLogo } from '@/shared/ui/reverie-logo';

interface AuthShellProps {
  ariaLabel: string;
  children: ReactNode;
}

export function AuthShell({ ariaLabel, children }: AuthShellProps) {
  return (
    <main className="auth-page">
      <aside className="auth-promo" aria-label="Возможности продукта">
        <div className="auth-promo-content">
          <h1>Мечтайте. Способ найдётся.</h1>
          <p>Профессиональные инструменты для креаторов — от первой идеи до готового визуала.</p>
        </div>
      </aside>

      <section className="auth-form-area" aria-label={ariaLabel}>
        <AuthThemeSwitch />
        <div className="auth-form-shell">
          <div className="auth-topline">
            <Link className="auth-back-link" href="/">
              <ArrowLeft size={16} aria-hidden="true" />
              Вернуться на сайт
            </Link>
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
