'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@/shared/auth/client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { SectionHelpContext } from '@/shared/ui/section-help';
import { OnboardingDialog } from '@/shared/ui/onboarding-dialog';
import { sectionGuideForRoute, sectionGuideStorageKey, type SectionGuideId } from '../model/section-guide';
import { SECTION_GUIDE_LABELS, sectionGuideScenario } from './section-guide-catalog';
import { homeGuideScenario, skipHintScenario } from './home-guide-scenario';
import { homeGuideWelcome } from './home-guide-welcome';
import { canvasGuideScenario } from './canvas-guide-scenario';
import './section-onboarding.css';
import { useJourney } from '@/shared/analytics/use-journey';

type OpenGuide = { section: SectionGuideId; route: string; user: string; serial: number; automatic: boolean };

export function SectionOnboardingProvider({ children }: { children: ReactNode }) {
  const tUi = useTranslations();
  const journey = useJourney('tour');
  const journeyRef = useRef(journey); journeyRef.current = journey;
  const owner = useId();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user.id;
  const mode = params?.get('type') ?? params?.get('create') ?? null;
  const view = params?.get('view') ?? null;
  const route = `${pathname}:${mode ?? ''}:${view ?? ''}`;
  const section = sectionGuideForRoute(pathname, mode, view);
  const [active, setActive] = useState<OpenGuide | null>(null);
  const [hint, setHint] = useState<OpenGuide | null>(null);
  const shown = useRef(new Set<string>());
  const serial = useRef(0);
  const isOpen = Boolean(active && active.route === route && active.user === user);
  const isHintOpen = Boolean(hint && hint.route === route && hint.user === user);

  const open = useCallback((id?: string, automatic = false) => {
    const selected = id ?? section;
    if (!selected || !(selected in SECTION_GUIDE_LABELS) || !user) return;
    shown.current.add(sectionGuideStorageKey(user, selected as SectionGuideId));
    journeyRef.current.restart();
    journeyRef.current.event('ip_tour_opened', { section: selected, source: automatic ? 'automatic' : 'help' });
    journeyRef.current.event('ip_tour_step_viewed', { section: selected, step: 1 });
    setHint(null);
    setActive({ section: selected as SectionGuideId, route, user, serial: ++serial.current, automatic });
  }, [route, section, user]);

  const close = useCallback((showReturnHint = false) => {
    if (active) {
      try { localStorage.setItem(sectionGuideStorageKey(active.user, active.section), 'seen'); } catch { /* Private browsing: remember this session in memory. */ }
    }
    setHint(showReturnHint && active?.automatic ? active : null);
    setActive(null);
  }, [active]);

  useEffect(() => {
    if (!section || !user || isOpen || isHintOpen) return;
    const key = sectionGuideStorageKey(user, section);
    if (shown.current.has(key)) return;
    try { if (localStorage.getItem(key) === 'seen') return; } catch { /* Storage can be unavailable. */ }
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown.current.has(key) || document.visibilityState !== 'visible') return;
        const trigger = document.querySelector(`[data-section-help="${section}"][data-section-help-owner="${owner}"]`);
        if (!trigger?.getClientRects().length) return;
        const blockingDialog = [...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')]
          .some((dialog) => !dialog.hasAttribute('data-section-guide-surface') || !dialog.contains(trigger));
        if (blockingDialog) return;
        // Never interrupt a user who has already started typing or editing.
        const focused = document.activeElement;
        if (focused?.matches('input, textarea, [contenteditable="true"]')) return;
        open(section, true);
      }, 900);
    };
    const observer = new MutationObserver(attempt);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
    document.addEventListener('visibilitychange', attempt);
    attempt();
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', attempt); };
  }, [section, user, isOpen, open, owner, isHintOpen]);

  const scenario = useMemo(() => {
    if (!active) return null;
    const guide = sectionGuideScenario(active.section, tUi);
    if (active.section === 'canvas') return canvasGuideScenario(guide, tUi);
    if (active.section === 'home' && pathname === '/' && !mode) return homeGuideScenario({ ...guide, steps: homeGuideWelcome(tUi).steps }, tUi);
    if (active.section !== 'usage') return guide;
    const steps = guide.steps.map((step) => step.id === 'budgets' ? { ...step,
      supplementaryAction: <button className="section-guide-link" type="button" onClick={() => { close(); router.push('/settings/providers'); }}>{tUi('Открыть лимиты ↗')}</button>,
    } : step);
    return { ...guide, steps: [steps[0]!, ...steps.slice(1)] as typeof guide.steps };
  }, [active, close, router, pathname, mode, tUi]);
  const api = useMemo(() => ({ section, owner, label: tUi(section ? SECTION_GUIDE_LABELS[section] : 'Помощь по разделу'), open }), [section, open, owner, tUi]);

  return <SectionHelpContext.Provider value={api}>{children}
    {scenario && active ? <OnboardingDialog key={`${active.serial}-${scenario.id}`} open={isOpen} scenario={scenario}
      resolveTarget={(key) => key === 'help' ? document.querySelector(`[data-section-help="${active.section}"][data-section-help-owner="${owner}"]`)
        : key === 'canvas-assistant' ? document.querySelector('.canvas-shell [data-assistant-window][data-open="true"]') ?? document.querySelector('.canvas-shell .assistant-floating-button')
          : document.querySelector(`[data-onboarding-target="${key}"]`)}
      onStepChange={(detail) => { journeyRef.current.step(); journeyRef.current.event('ip_tour_step_viewed', { section: active.section, step: detail.toStepNumber }); }}
      onComplete={(detail) => { journeyRef.current.event('ip_tour_completed', { section: active.section, step: detail.stepNumber }); journeyRef.current.finish(); close(); }}
      onSkip={(detail) => { journeyRef.current.event('ip_tour_skipped', { section: active.section, step: detail.stepNumber }); journeyRef.current.finish(); close(active.section !== 'home' && scenario.steps.length > 1); }} /> : null}
    {hint && hint.route === route && hint.user === user ? <OnboardingDialog open scenario={skipHintScenario(tUi)}
      resolveTarget={() => document.querySelector(`[data-section-help="${hint.section}"][data-section-help-owner="${owner}"]`)}
      onComplete={() => setHint(null)} onSkip={() => setHint(null)} /> : null}
  </SectionHelpContext.Provider>;
}
