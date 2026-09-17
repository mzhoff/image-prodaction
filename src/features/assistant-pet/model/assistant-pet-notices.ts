'use client';

import { useEffect, useState } from 'react';
import type { AssistantNotice } from './assistant-pet-contract';

const EVENT = 'image-production:assistant-notice';

export function notifyAssistantNotice(notice: AssistantNotice) {
  window.dispatchEvent(new CustomEvent<AssistantNotice>(EVENT, { detail: notice }));
}

export function useAssistantPetNotice() {
  const [notice, setNotice] = useState<AssistantNotice | null>(null);
  useEffect(() => {
    let timeout: number | undefined;
    const receive = (event: Event) => {
      const next = (event as CustomEvent<AssistantNotice>).detail;
      if (!next?.title) return;
      if (timeout) window.clearTimeout(timeout);
      setNotice(next);
      timeout = window.setTimeout(() => { setNotice(null); timeout = undefined; }, 4_800);
    };
    window.addEventListener(EVENT, receive);
    return () => {
      if (timeout) window.clearTimeout(timeout);
      window.removeEventListener(EVENT, receive);
    };
  }, []);
  return notice;
}
