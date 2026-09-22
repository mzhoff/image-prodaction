'use client';
import { getBehaviorAttribution, trackBehavior } from '@/shared/analytics/client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useRef, useState } from 'react';
import type { BudgetAmount, ProductionPlan } from '@/shared/billing/catalog';
export function useTelegramHandoff(workspaceId: string | undefined, plan: ProductionPlan, amountUsd: BudgetAmount) {
  const tUi = useTranslations();
  const attempts = useRef(new Map<string, string>()), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [resultKey, setResultKey] = useState('');
  const key = JSON.stringify([workspaceId, plan, amountUsd]);
  const open = async () => {
    if (inFlight.current || !workspaceId) return;
    trackBehavior('ip_topup_telegram_clicked', { amount_usd: amountUsd });
    inFlight.current = true; setBusy(true); setError(''); setUrl('');
    setResultKey(key);
    const requestId = attempts.current.get(key) ?? crypto.randomUUID();
    attempts.current.set(key, requestId);
    // Open in the click gesture; an async popup would be blocked by browsers.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const analyticsContext = await getBehaviorAttribution();
      const response = await fetch('/api/billing/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, workspaceId, plan, amountUsd, analyticsContext }) });
      const result = await response.json().catch(() => null);
      if (response.status === 401) throw new Error(tUi("Войдите в аккаунт и повторите пополнение."));
      if (!response.ok || typeof result?.telegramUrl !== 'string') throw new Error(result?.message || tUi("Не удалось открыть Telegram. Повторите попытку."));
      trackBehavior('ip_topup_handoff_created', { amount_usd: amountUsd });
      setUrl(result.telegramUrl);
      if (tab && !tab.closed) tab.location.replace(result.telegramUrl);
    } catch (error) {
      trackBehavior('ip_topup_handoff_failed', { amount_usd: amountUsd });
      tab?.close();
      setError(error instanceof Error ? error.message : tUi("Не удалось открыть Telegram. Повторите попытку."));
    } finally { inFlight.current = false; setBusy(false); }
  };
  return { open, busy, error: resultKey === key ? error : '', url: resultKey === key ? url : '' };
}
