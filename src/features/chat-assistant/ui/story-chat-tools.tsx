'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useStoryAuthoring } from './story-authoring-provider';
import { canAutoSaveStory } from '../model/story-interactions';
import { createChatToolRendererRegistry, type ChatToolRendererContext } from '@prodactionpro/chat-ui';
import { Check, LoaderCircle } from '@prodactionpro/ui-core/icons';
import { STORY_BLUEPRINT_TOOL, STORY_QUESTION_TOOL, STORY_SCENES_TOOL, STORY_CHARACTERS_TOOL } from '@/modules/chat-assistant/contracts/story-authoring';
import { StoryQuestionCard } from './story-question';
import { StoryCharactersInvitation } from './story-character-chat';

function BlueprintProgress({ toolCall }: ChatToolRendererContext) {
  const tUi = useTranslations();
  const authoring = useStoryAuthoring();
  const title = toolCall.toolName === STORY_CHARACTERS_TOOL ? tUi("Паспорта героев") : toolCall.toolName === STORY_SCENES_TOOL ? tUi("Раскадровка") : 'Blueprint';
  const saved = toolCall.status === 'completed';
  if (!saved && !canAutoSaveStory(toolCall, authoring.storyId, authoring.revision)) return <p className="story-blueprint-progress">{tUi("Документ изменился. Отправьте соавтору правки, чтобы обновить blueprint.")}</p>;
  return <><p className="story-blueprint-progress" role="status">{saved ? <Check size={15} /> : <LoaderCircle size={15} className="home-generation-spinner" />}{saved ? `${title} ${title === 'Blueprint' ? tUi("сохранён") : title === 'Раскадровка' ? tUi("сохранена") : tUi("сохранены")}` : tUi("Собираю {p1}…", { p1: title.toLowerCase() })}</p>{saved && toolCall.toolName !== STORY_SCENES_TOOL ? <StoryCharactersInvitation /> : null}</>;
}
export const STORY_TOOL_RENDERERS = createChatToolRendererRegistry({ byToolName: {
  [STORY_CHARACTERS_TOOL]: { renderConfirmation: (context) => <BlueprintProgress {...context} />, renderResult: (context) => <BlueprintProgress {...context} /> },
  [STORY_QUESTION_TOOL]: { renderResult: (context) => <StoryQuestionCard {...context} /> },
  [STORY_SCENES_TOOL]: { renderConfirmation: (context) => <BlueprintProgress {...context} />, renderResult: (context) => <BlueprintProgress {...context} /> },
  [STORY_BLUEPRINT_TOOL]: { renderConfirmation: (context) => <BlueprintProgress {...context} />, renderResult: (context) => <BlueprintProgress {...context} /> },
} });
