'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import type { ReactNode } from 'react';
import { AlertCircle, Check, LoaderCircle, X } from '@prodactionpro/ui-core/icons';
import { cn } from '@/shared/lib/cn';
import { formatRemainingTime } from './process-indicator-values';
import './process-indicator.css';

export interface ProcessIndicatorProps {
  title: string;
  description?: string;
  label: string;
  state?: 'running' | 'success' | 'error';
  completed?: number;
  total?: number;
  countLabel?: string;
  progressLabel?: string;
  estimatedRemainingMs?: number | null;
  onDismiss?: () => void;
  dismissLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Producers supply measured progress and optional estimates. */
export function ProcessIndicator({ title, description, label, state = 'running', completed, total,
  countLabel, progressLabel, estimatedRemainingMs, onDismiss, dismissLabel,
  actions, children, className }: ProcessIndicatorProps) {
  const tUi = useTranslations();
  dismissLabel ??= tUi("Закрыть статус");
  const Icon = state === 'error' ? AlertCircle : state === 'success' ? Check : LoaderCircle;
  const determinate = Number.isFinite(total) && total! > 0 && Number.isFinite(completed);
  const remaining = state === 'running' ? formatRemainingTime(estimatedRemainingMs) : undefined;
  return <section className={cn('process-indicator', className)} aria-label={label} data-state={state} data-snapshot-exclude>
    <div className="process-indicator-header">
      <span className={cn('process-indicator-icon', state === 'running' && 'process-indicator-spinner')} aria-hidden="true"><Icon size={20} /></span>
      <div className="process-indicator-copy" role="status" aria-live="polite" aria-atomic="true">
        <div className="process-indicator-title">{title}</div>
        {description ? <div className="process-indicator-description">{description}</div> : null}
      </div>
      {countLabel ? <span className="process-indicator-count">{countLabel}</span> : null}
      {onDismiss ? <button type="button" className="process-indicator-close" aria-label={dismissLabel} onClick={onDismiss}><X size={16} /></button> : null}
    </div>
    <progress aria-label={progressLabel || label} aria-valuetext={countLabel}
      max={determinate ? total : undefined} value={determinate ? Math.min(total!, Math.max(0, completed!)) : undefined} />
    {remaining ? <p className="process-indicator-estimate">{tUi(remaining)}</p> : null}
    {children}
    {actions ? <div className="process-indicator-actions">{actions}</div> : null}
  </section>;
}
