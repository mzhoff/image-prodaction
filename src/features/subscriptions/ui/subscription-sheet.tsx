'use client';
import { trackBehavior } from '@/shared/analytics/client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@prodactionpro/ui-core/button';
import { X, CircleDollarSign, Layers } from '@prodactionpro/ui-core/icons';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import type { ProductionPlan, PublicBillingConfig, SubscriptionRequest } from '@/shared/billing/catalog';
import { useBillingWorkspaces } from '../model/use-billing-workspaces';
import { SubscriptionPlans } from './subscription-plans';
import { SubscriptionBudget } from './subscription-budget';
import styles from './subscription-sheet.module.css';

/** Full viewport, native top layer: usable above Canvas, settings and assistant dialogs. */
export function SubscriptionSheet({ request, config, onClose, onRequestChange }: {
  request: SubscriptionRequest; config: PublicBillingConfig; onClose: () => void;
  onRequestChange: (request: SubscriptionRequest) => void;
}) {
  const tUi = useTranslations();
  const ref = useRef<HTMLDialogElement>(null), scrollRef = useRef<HTMLDivElement>(null), titleId = useId();
  const tab = request.tab ?? 'budget';
  useEffect(() => {
    if (tab !== 'budget') return;
    const timer = setTimeout(() => trackBehavior('ip_topup_viewed'), 0);
    return () => clearTimeout(timer);
  }, [tab]);
  const [plan, setPlan] = useState<ProductionPlan>('start');
  const model = useBillingWorkspaces(request.workspaceId);
  useEffect(() => {
    if (!request.workspaceId && model.selectedId) onRequestChange({ tab, workspaceId: model.selectedId });
  }, [model.selectedId, request.workspaceId, tab, onRequestChange]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (focused?.isConnected) focused.focus(); };
  }, []);
  const switchTab = (next: 'plans' | 'budget') => onRequestChange({ tab: next, workspaceId: request.workspaceId ?? model.selectedId });
  // Isolate after child React handlers so keyboard controls (including Slider) still work.
  return createPortal(<dialog ref={ref} className={styles.sheet} aria-labelledby={titleId} onKeyDown={(event) => event.stopPropagation()} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className={styles.shell}>
      <header className={styles.header}><div className={styles.brand}><ReverieLogo /><h1 id={titleId}>{tUi("Тарифы и AI-бюджет")}</h1></div><span className={styles.pill}>{tUi("Закрытая бета")}</span><Button type="button" intent="neutral" appearance="soft" className={styles.close} aria-label={tUi("Закрыть тарифы")} onClick={onClose}><X size={20} /></Button></header>
      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label={tUi("Подписка и оплата")}><button type="button" aria-current={tab === 'plans' ? 'page' : undefined} onClick={() => switchTab('plans')}><Layers size={17} />{tUi("Тарифы")}</button><button type="button" aria-current={tab === 'budget' ? 'page' : undefined} onClick={() => switchTab('budget')}><CircleDollarSign size={17} />{tUi("AI-бюджет")}</button></nav>
        <label className={styles.workspace}>{tUi("Пространство")}<select aria-label={tUi("Пространство для пополнения")} disabled={model.loading || !!model.error} value={model.selectedId} onChange={(event) => onRequestChange({ tab, workspaceId: event.target.value })}>{!model.selectedId ? <option value="">{model.loading ? tUi("Загружаем…") : tUi("Выберите пространство")}</option> : null}{model.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
      </div>
      <div className={styles.scroll} ref={scrollRef}>
        {model.error ? <div className={styles.loadError} role="alert">{typeof (model.error) === 'string' ? tUi((model.error) as string) : (model.error)}<Button type="button" intent="neutral" appearance="soft" onClick={model.retry}>{tUi("Повторить")}</Button></div> : null}
        {tab === 'plans' ? <SubscriptionPlans selected={plan} onSelect={(value) => { setPlan(value); switchTab('budget'); }} />
          : <SubscriptionBudget key={model.selectedId} workspace={model.workspace} config={config} plan={plan} />}
      </div>
    </div>
  </dialog>, document.body);
}
