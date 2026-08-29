import type { AssistantMode, ToolCallRecord } from '@prodactionpro/chat-domain';
import {
  createChatToolRendererRegistry,
  type ChatAppearanceSettings,
} from '@prodactionpro/chat-ui';
import {
  PIPELINE_BUILD_PRESENTATION,
  PIPELINE_UPDATE_PRESENTATION,
} from '@/modules/chat-assistant/contracts/image-production-tools';
import { DESIGN_ELEMENT_SELECTION_TOOL } from '@/modules/chat-assistant/contracts/design-element-selection';
import { DesignElementSelectionToolCard } from './design-element-selection-tool-card';
import { PipelineBuildConfirmation, PipelineBuildResult } from './pipeline-build-tool-card';

export function createAllowedModels(model: string): Record<AssistantMode, string[]> {
  return {
    'general-chat': [],
    'knowledge-base': [model],
    'product-copilot': [model],
    'mcp-agent': [],
    'image-generation': [],
    'document-assistant': [],
    debug: [],
  };
}

export const MODE_OPTIONS = [{
  id: 'product-copilot' as const,
  label: 'Copilot',
  description: 'Ответы по продукту и подтверждаемое создание пайплайнов.',
}];
export const APPEARANCE: ChatAppearanceSettings = {
  assistantBubble: false,
  chatStyle: 'compact',
  font: 'product',
  iconLibrary: 'lucide',
  radius: 'product',
  showAssistantAvatar: false,
  showUserAvatar: false,
  visualProfile: 'product-light',
};
export const CHAT_STYLES = [{ id: 'compact', label: 'Compact', description: 'Product side panel.' }];
export const FONT_OPTIONS = [{ id: 'product', label: 'Product', description: 'System UI font.', fontFamily: 'inherit' }];
export const ICON_OPTIONS = [{ id: 'lucide', label: 'Lucide', description: 'Product icon set.' }];
export const RADIUS_OPTIONS = [{
  id: 'product', label: 'Product', description: 'Image Production radius.',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px' },
}];
export const VISUAL_OPTIONS = [{
  id: 'product-light', label: 'Product light', description: 'Image Production light theme.',
  colorMode: 'light' as const, swatches: ['#ffffff', '#111111', '#f4f4f5'] as const,
}];
export const MESSAGE_PRESENTATION = {
  actionsVisibility: 'interaction' as const,
  metaPlacement: 'below-message' as const,
  showAssistantAuthor: false,
  showCopyAction: true,
  showMessageTime: true,
  showUserAuthor: false,
  sourcePresentation: 'compact' as const,
};
export const SCROLL_POLICY = {
  autoFollow: true, bottomThreshold: 56, jumpBehavior: 'smooth' as const, showJumpToLatest: true,
};
export const TOOL_CALL_PRESENTATION = {
  completedRead: 'hidden' as const,
  completedWrite: 'summary' as const,
  failed: 'details' as const,
  pending: 'details' as const,
  rawDetails: 'hidden' as const,
  resolve: (toolCall: ToolCallRecord) => {
    if (toolCall.toolName === DESIGN_ELEMENT_SELECTION_TOOL && toolCall.status === 'completed') return 'details' as const;
    if (['failed', 'rejected', 'cancelled', 'expired'].includes(toolCall.status)) return 'details' as const;
    if (toolCall.status !== 'completed') return 'details' as const;
    return toolCall.riskLevel === 'read' ? 'hidden' as const : 'summary' as const;
  },
};
export const TOOL_RENDERER_REGISTRY = createChatToolRendererRegistry({
  byToolName: {
    [DESIGN_ELEMENT_SELECTION_TOOL]: {
      renderResult: (context) => <DesignElementSelectionToolCard {...context} />,
    },
  },
  byPresentationType: {
    [PIPELINE_BUILD_PRESENTATION]: {
      renderConfirmation: (context) => <PipelineBuildConfirmation {...context} />,
      renderResult: (context) => <PipelineBuildResult {...context} />,
    },
    [PIPELINE_UPDATE_PRESENTATION]: {
      renderConfirmation: (context) => <PipelineBuildConfirmation {...context} />,
      renderResult: (context) => <PipelineBuildResult {...context} />,
    },
  },
});
