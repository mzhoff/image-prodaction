'use client';
import { useEffect, useRef } from 'react';
import { JourneyClock } from './journey-clock';
import { trackBehavior } from './client';
import type { BehaviorEvent, BehaviorParams } from './contracts';

export function useJourney(name: 'login' | 'questionnaire' | 'tour', disabled = false, scope = '') {
  const clock = useRef<JourneyClock | null>(null);
  useEffect(() => {
    if (disabled) return;
    let storage: Storage | undefined;
    try { storage = sessionStorage; } catch { /* Optional. */ }
    clock.current ??= new JourneyClock(`reverie.analytics.${name}.v1:${scope}`, storage);
    const update = () => clock.current?.visible(document.visibilityState === 'visible' && document.hasFocus());
    update();
    const heartbeat = setInterval(() => clock.current?.metrics(), 5000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update); window.addEventListener('blur', update);
    return () => {
      clock.current?.visible(false); clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update); window.removeEventListener('blur', update);
    };
  }, [name, disabled, scope]);
  return {
    event(event: BehaviorEvent, params: BehaviorParams = {}) {
      if (!disabled) trackBehavior(event, { ...clock.current?.metrics(), ...params });
    },
    restart() { clock.current?.clear(); clock.current = new JourneyClock(`reverie.analytics.${name}.v1:${scope}`); clock.current.visible(document.visibilityState === 'visible' && document.hasFocus()); },
    step() { clock.current?.step(); },
    finish() { clock.current?.clear(); },
  };
}
