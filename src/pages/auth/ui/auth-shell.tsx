import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

interface AuthShellProps {
  ariaLabel: string;
  children: ReactNode;
}

export function AuthShell({ ariaLabel, children }: AuthShellProps) {
  return (
    <main className="auth-page">
      <aside className="auth-promo" aria-label="Возможности продукта">
        <div className="auth-promo-content">
          <span className="auth-promo-kicker">
            <span />
            Доступ в рабочее пространство
          </span>
          <h1>Вход в пространство, где pipeline превращает идею в готовый визуал.</h1>
          <p>
            Аккаунт и серверная сессия защищают ваши документы, файлы и рабочее
            пространство между устройствами.
          </p>
        </div>
        <div className="auth-promo-stack">
          <div className="auth-metric-card">
            <div>
              <span>Операционный эффект</span>
              <strong>+340%</strong>
            </div>
            <div className="auth-bars" aria-hidden="true">
              {[20, 28, 35, 46, 52, 61, 74, 82, 94, 86, 98, 100].map((value, index) => (
                <i key={index} style={{ height: `${value}%` }} />
              ))}
            </div>
          </div>
          <div className="auth-note-card">
            <Sparkles size={18} />
            <div>
              <strong>Готово под командную работу</strong>
              <span>Workspace, документы и файлы привязаны к защищённому аккаунту.</span>
            </div>
          </div>
        </div>
      </aside>

      <section className="auth-form-area" aria-label={ariaLabel}>
        <div className="auth-form-shell">
          <div className="auth-topline">
            <Link className="auth-logo" href="/" aria-label="Reverie">
              <img className="auth-logo-default" src="/brand/reverie-logo-default.webp" alt="" />
              <img className="auth-logo-hover" src="/brand/reverie-logo-hover.webp" alt="" />
            </Link>
            <Link className="auth-home-link" href="/">В продукт</Link>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
