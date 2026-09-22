import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@prodactionpro/ui-core/icons';
import { SectionHelpButton } from './section-help';

interface ProductionSectionLayoutProps {
  title: string;
  tools?: ReactNode;
  actions?: ReactNode;
  headerEnd?: ReactNode;
  back?: { href: string; label: string };
  navigation?: ReactNode;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Stable section chrome; only the controls and scrollable contents change by mode. */
export function ProductionSectionLayout({ title, tools, actions, headerEnd, back, navigation, controls, children, className = '' }: ProductionSectionLayoutProps) {
  return <div className={`production-section ${className}`}>
    <header className="production-section-header">
      <div className="production-section-title">
        {back ? <Link href={back.href} className="production-section-back" aria-label={back.label} title={back.label}><ArrowLeft size={18} /></Link> : null}
        <h1>{title}</h1>
      </div>
      <div className="production-section-actions">{tools}<SectionHelpButton />{actions}{headerEnd}</div>
    </header>
    {navigation ? <div className="production-section-modes">{navigation}</div> : null}
    {controls ? <div className="production-section-controls">{controls}</div> : null}
    <div className="production-section-body">{children}</div>
  </div>;
}
