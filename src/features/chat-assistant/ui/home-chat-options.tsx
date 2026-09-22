import { createChatToolRendererRegistry } from '@prodactionpro/chat-ui';
import { HomeGenerationConfirmation, HomeGenerationResult } from './home-generation-card';
import type { HomeEditSelectionHandler } from '../api/home-result-media-api';

export const HOME_MODES = [
  { id: 'image-generation' as const, label: 'Изображение', description: 'Быстрая генерация с референсами.' },
  { id: 'general-chat' as const, label: 'Текст', description: 'Обсудить идею и подготовить промпт.' },
];

export function createHomeToolRenderers(workspaceId: string, onUseReference: (file: File) => Promise<void>, onEditSelection?: HomeEditSelectionHandler) {
  return createChatToolRendererRegistry({ byToolName: {
    home_generate_image: {
      renderConfirmation: (context) => <HomeGenerationConfirmation {...context} />,
      renderResult: (context) => <HomeGenerationResult {...context} workspaceId={workspaceId} onUseReference={onUseReference} onEditSelection={onEditSelection} />,
    },
  } });
}
