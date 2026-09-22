import { PREFERRED_ANALYSIS_MODEL_IDS } from '@/shared/api/openrouter-models';
import type { AssistantMode, ToolCallRecord } from '@prodactionpro/chat-domain';
import {
  createChatToolRendererRegistry,
} from '@prodactionpro/chat-ui';
import {
  PIPELINE_BUILD_PRESENTATION,
  PIPELINE_UPDATE_PRESENTATION,
} from '@/modules/chat-assistant/contracts/image-production-tools';
import { DESIGN_ELEMENT_SELECTION_TOOL } from '@/modules/chat-assistant/contracts/design-element-selection';
import { ASSISTANT_QUESTION_TOOL } from '@/modules/chat-assistant/contracts/assistant-question';
import { AssistantQuestionToolCard } from './assistant-question-tool-card';
import { DesignElementSelectionToolCard } from './design-element-selection-tool-card';
import { PipelineBuildConfirmation, PipelineBuildResult } from './pipeline-build-tool-card';

export function createAllowedModels(model: string): Record<AssistantMode, string[]> {
  return {
    'general-chat': [],
    'knowledge-base': [model],
    'product-copilot': [...new Set([model, ...PREFERRED_ANALYSIS_MODEL_IDS])],
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
export const TOOL_CALL_PRESENTATION = {
  completedRead: 'hidden' as const,
  completedWrite: 'summary' as const,
  failed: 'details' as const,
  pending: 'details' as const,
  rawDetails: 'hidden' as const,
  resolve: (toolCall: ToolCallRecord) => {
    if (toolCall.toolName === ASSISTANT_QUESTION_TOOL && toolCall.status === 'completed'
      && toolCall.output?.action === 'assistant-question-answered') return 'hidden' as const;
    if ([DESIGN_ELEMENT_SELECTION_TOOL, ASSISTANT_QUESTION_TOOL].includes(toolCall.toolName) && toolCall.status === 'completed') return 'details' as const;
    if (['failed', 'rejected', 'cancelled', 'expired'].includes(toolCall.status)) return 'details' as const;
    if (toolCall.status !== 'completed') return 'details' as const;
    return toolCall.riskLevel === 'read' ? 'hidden' as const : 'summary' as const;
  },
};
export const TOOL_RENDERER_REGISTRY = createChatToolRendererRegistry({
  byToolName: {
    [ASSISTANT_QUESTION_TOOL]: { renderResult: (context) => <AssistantQuestionToolCard {...context} /> },
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
