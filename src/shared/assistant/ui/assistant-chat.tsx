'use client';

import { useMemo, type ComponentProps } from 'react';
import { ChatModuleShell } from '@prodactionpro/chat-ui';
import { useTheme } from '@prodactionpro/ui-core/theme';
import { APPEARANCE, CHAT_STYLES, FONT_OPTIONS, ICON_OPTIONS, MESSAGE_PRESENTATION, RADIUS_OPTIONS, VISUAL_OPTIONS } from './assistant-chat-presentation';

type AppearanceProps = 'appearance' | 'chatStyleOptions' | 'fontOptions' | 'iconLibraryOptions' | 'messagePresentation'
  | 'radiusOptions' | 'visualProfileOptions' | 'onAppearanceChange' | 'showAppearanceSettings' | 'showAssistantSettings' | 'composerKeyboardPolicy';

/** Product-independent presentation. Modes, tools and authorization belong to the caller. */
export function AssistantChat(props: Omit<ComponentProps<typeof ChatModuleShell>, AppearanceProps>) {
  const { resolvedTheme } = useTheme();
  const appearance = useMemo(() => ({ ...APPEARANCE, visualProfile: `product-${resolvedTheme}` }), [resolvedTheme]);
  return <ChatModuleShell {...props} className={`assistant-chat ${props.className ?? ''}`} appearance={appearance} chatStyleOptions={CHAT_STYLES}
    fontOptions={FONT_OPTIONS} iconLibraryOptions={ICON_OPTIONS} radiusOptions={RADIUS_OPTIONS}
    visualProfileOptions={VISUAL_OPTIONS} messagePresentation={MESSAGE_PRESENTATION}
    composerKeyboardPolicy="focused" showAppearanceSettings={false} showAssistantSettings={false}
    onAppearanceChange={() => undefined} />;
}
