'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { cloneElement, type ReactNode } from 'react';
import { CHAT_ATTACHMENT_HINT } from '@/modules/chat-assistant/contracts/composer-attachments';
import { useHomeImageComposer } from './home-image-composer';
import { useHomeVideoComposer } from './home-video-composer';
import { useProductionTextComposer } from './production-text-composer';
import type { HomeComposerMode } from './home-composer-mode-switch';

/** Keep the form, textarea, uploads and mode rail mounted across mode changes. */
export function HomeComposer({ mode, image, video, text, notice }: {
  mode: HomeComposerMode;
  image: Parameters<typeof useHomeImageComposer>[0];
  video: Parameters<typeof useHomeVideoComposer>[0];
  text: Parameters<typeof useProductionTextComposer>[0];
  notice?: ReactNode;
}) {
  const tUi = useTranslations();
  const ui_CHAT_ATTACHMENT_HINT = useUiCatalog(CHAT_ATTACHMENT_HINT, tUi);
  const imageContent = useHomeImageComposer(image);
  const videoContent = useHomeVideoComposer(video);
  const textContent = useProductionTextComposer(text);
  const content = { image: imageContent, video: videoContent, text: textContent }[mode];
  return <div className="home-image-studio home-unified-composer" data-onboarding-target="home-composer" data-mode={mode}>
    {typeof (notice) === 'string' ? tUi((notice) as string) : (notice)}{typeof (content.notice) === 'string' ? tUi((content.notice) as string) : (content.notice)}
    {cloneElement(content.frame, { mode })}
    <div className="home-image-footnote production-composer-footer">
      <span>{ui_CHAT_ATTACHMENT_HINT}</span><span>{tUi("Enter — отправить · Shift + Enter — новая строка")}</span>
    </div>
  </div>;
}
