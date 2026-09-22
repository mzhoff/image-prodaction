'use client';

import type { ReactNode } from 'react';
import styles from './home-material-trigger.module.css';

export function HomeMaterialTrigger({ label, icon, count, disabled, onClick, expanded, ariaLabel, limit = 3 }: {
  label: string; icon: ReactNode; count: number; disabled?: boolean; onClick: () => void; expanded?: boolean; ariaLabel?: string; limit?: number;
}) {
  return <button type="button" className={`${styles.trigger} home-material-trigger`} disabled={disabled} data-selected={count > 0}
    aria-haspopup="dialog" aria-expanded={expanded} aria-label={ariaLabel ?? label} onClick={onClick}>
    <span className={styles.icon}>{icon}</span><small className={styles.count}>{count}/{limit}</small>
    <strong>{label}</strong>
  </button>;
}
