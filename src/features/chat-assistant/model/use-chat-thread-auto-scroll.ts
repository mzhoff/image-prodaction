'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { isChatThreadNearBottom } from './chat-scroll-position';

export function useChatThreadAutoScroll(messageCount: number) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowLatestRef = useRef(true);

  const followLatest = useCallback(() => {
    shouldFollowLatestRef.current = true;
    scrollThreadToBottom(findThread(rootRef.current));
  }, []);

  useLayoutEffect(() => {
    const thread = findThread(rootRef.current);
    if (!thread) return undefined;

    const handleScroll = () => {
      shouldFollowLatestRef.current = isChatThreadNearBottom(thread);
    };
    const followOnResize = () => {
      if (shouldFollowLatestRef.current) scrollThreadToBottom(thread);
    };
    const observer = new ResizeObserver(followOnResize);
    observer.observe(thread.querySelector('.cm-message-stack') ?? thread);
    thread.addEventListener('scroll', handleScroll, { passive: true });
    followOnResize();

    return () => {
      observer.disconnect();
      thread.removeEventListener('scroll', handleScroll);
    };
  }, [messageCount]);

  return { followLatest, rootRef };
}

function findThread(root: HTMLElement | null) {
  return root?.querySelector<HTMLElement>('.cm-thread') ?? null;
}

function scrollThreadToBottom(thread: HTMLElement | null) {
  if (thread) thread.scrollTop = thread.scrollHeight;
}
