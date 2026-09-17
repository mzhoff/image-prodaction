'use client';

import { Sparkles } from '@prodactionpro/ui-core/icons';
import { useEffect, useRef } from 'react';
import { AssistantFloatingButton } from '@/shared/ui/assistant-floating-button';
import { findAssistantPetCharacter } from '../model/assistant-pet-characters';
import type { AssistantNotice, AssistantPetEmotion } from '../model/assistant-pet-contract';
import { useAssistantLauncherPreference } from '../model/use-assistant-launcher-preference';
import { useAssistantPetNotice } from '../model/assistant-pet-notices';
import { RoverVector } from './rover-vector';

interface AssistantPetLauncherProps {
  className?: string;
  notice?: AssistantNotice | null;
  onClick?: () => void;
  size?: 'canvas' | 'workspace';
}

export function AssistantPetLauncher({ className = '', notice, onClick, size = 'workspace' }: AssistantPetLauncherProps) {
  const { preference } = useAssistantLauncherPreference();
  const character = findAssistantPetCharacter(preference.characterId);
  const fixed = className.includes('assistant-floating-button-fixed');
  const petNotice = useAssistantPetNotice();
  const activeNotice = notice ?? petNotice;

  if (preference.presentation === 'button') {
    return (
      <div className={`assistant-launcher-slot ${fixed ? 'assistant-launcher-slot-fixed' : ''}`}>
        {activeNotice ? <AssistantNoticeBubble notice={activeNotice} /> : null}
        <AssistantFloatingButton className={className} onClick={onClick} />
      </div>
    );
  }

  const emotion = activeNotice?.status === 'error' || activeNotice?.status === 'warning'
    ? 'warning'
    : activeNotice?.status === 'success'
      ? 'celebrate'
      : 'idle';
  const animation = character.animations[emotion];

  return (
    <div className={`assistant-pet-slot assistant-pet-slot-${size} ${fixed ? 'assistant-pet-slot-fixed' : ''}`}>
      {activeNotice ? <AssistantNoticeBubble notice={activeNotice} /> : null}
      <button
        type="button"
        className={`assistant-pet-launcher assistant-pet-launcher-${size} ${className}`}
        data-snapshot-exclude
        aria-label={`Открыть ассистента — ${character.name}`}
        onClick={onClick}
      >
        <AssistantPetVisual
          animationUrl={animation?.lottieUrl}
          emotion={emotion}
          fallbackImageUrl={character.fallbackImageUrl}
          renderKind={character.renderKind}
        />
      </button>
    </div>
  );
}

function AssistantNoticeBubble({ notice }: { notice: AssistantNotice }) {
  return (
    <div
      className={`assistant-notice assistant-notice-${notice.status ?? 'info'}`}
      role={notice.status === 'error' ? 'alert' : 'status'}
    >
      {notice.status ? <Sparkles className="assistant-notice-icon" size={14} aria-hidden="true" /> : null}
      <span>
        <strong>{notice.title}</strong>
        {notice.subtitle ? <small>{notice.subtitle}</small> : null}
      </span>
    </div>
  );
}

function AssistantPetVisual({ animationUrl, emotion, fallbackImageUrl, renderKind }: {
  animationUrl?: string;
  emotion: AssistantPetEmotion;
  fallbackImageUrl: string;
  renderKind?: 'image' | 'rover-v1';
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animationUrl || !container.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let animation: import('lottie-web').AnimationItem | undefined;
    let active = true;
    void import('lottie-web').then(({ default: lottie }) => {
      if (!active || !container.current) return;
      animation = lottie.loadAnimation({
        container: container.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: animationUrl,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      animation?.destroy();
    };
  }, [animationUrl]);

  if (animationUrl) return <div className="assistant-pet-lottie" aria-hidden="true" ref={container} />;
  if (renderKind === 'rover-v1') return <RoverVector emotion={emotion} />;
  return <img className={`assistant-pet-image assistant-pet-emotion-${emotion}`} src={fallbackImageUrl} alt="" />;
}
