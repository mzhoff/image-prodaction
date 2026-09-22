'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { TimelineAssistantChat } from '@/features/chat-assistant/ui/timeline-assistant-chat';
import { AssistantPanel } from '@/widgets/assistant-shell/ui/assistant-panel';

export function TimelineAssistantPanel({ onClose, expanded, onExpandedChange, ...props }: Parameters<typeof TimelineAssistantChat>[0] & { onClose(): void; expanded: boolean; onExpandedChange(value: boolean): void }) {
  const tUi = useTranslations();
  return <AssistantPanel expanded={expanded} onExpandedChange={onExpandedChange} expandWithinLayout placement="docked" open onClose={onClose} title={tUi("Ассистент")} contextLabel={tUi("Монтаж")}>
    <TimelineAssistantChat {...props} />
  </AssistantPanel>;
}
