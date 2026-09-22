import { STORY_WRITING_TOOLS } from '../contracts/story-authoring';
import { ASSISTANT_QUESTION_TOOL } from '../contracts/assistant-question';
import { callAssistantQuestion } from './assistant-question-tool';
import { callStoryTool, prepareStoryBlueprint } from './story-authoring-tools';
import type { McpToolGateway, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import type { ConversationStore } from '@prodactionpro/chat-application';
import { requireWorkspaceMembership, WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';
import { getAssistantNodeCatalog } from '../core/node-catalog';
import { readImageGenerationModelCatalog } from './image-generation-model-catalog';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { DESIGN_ELEMENT_SELECTION_TOOL } from '../contracts/design-element-selection';
import {
  DOCUMENT_GRAPH_TOOL,
  KNOWLEDGE_SEARCH_TOOL,
  NODE_CATALOG_TOOL,
  PIPELINE_BUILD_TOOL,
  PIPELINE_UPDATE_TOOL,
} from '../contracts/image-production-tools';
import { readAssistantDocumentGraph } from './document-graph-tool';
import { searchAssistantKnowledge } from './knowledge-base';
import {
  executePipelineBuildProposal,
  preparePipelineBuildProposal,
} from './pipeline-action-service';
import {
  executePipelineUpdateProposal,
  preparePipelineUpdateProposal,
} from './pipeline-update-service';
import type { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge';
import { createDesignElementSelection } from './design-element-selection-service';
import { readDesignSelectionContinuation } from './design-selection-continuation';
import type { HomeGenerationService } from './home-generation-service';
import { HOME_GENERATE_IMAGE_TOOL, HOME_IMAGE_MODELS_TOOL } from '../contracts/home-generation';

export class ImageProductionToolGateway implements McpToolGateway {
  constructor(
    private readonly attachmentAssetBridge?: ChatAttachmentAssetBridge,
    private readonly conversations?: ConversationStore,
    private readonly homeGeneration?: HomeGenerationService,
  ) {}

  async prepareTool(request: Parameters<NonNullable<McpToolGateway['prepareTool']>>[0], context: ToolExecutionContext) {
    const accessFailure = await verifyToolContext(context);
    if (accessFailure) throw new Error(accessFailure.safeError.message);
    if (context.verifiedContext?.timeline) throw new Error('Помощник Timeline пока даёт рекомендации. Изменения выполняются в редакторе.');
    if (context.verifiedContext?.storyBlueprint) {
      if (STORY_WRITING_TOOLS.includes(request.toolName)) return prepareStoryBlueprint(request, context);
      throw new Error('Этот инструмент недоступен в истории.');
    }
    if (STORY_WRITING_TOOLS.includes(request.toolName)) throw new Error('Откройте историю, чтобы продолжить.');
    if (request.toolName === HOME_GENERATE_IMAGE_TOOL && this.homeGeneration) return this.homeGeneration.prepare(request, context);
    if (context.verifiedContext?.homeConversation) throw new Error('Этот инструмент доступен только внутри Flow.');
    if (request.toolName !== PIPELINE_BUILD_TOOL && request.toolName !== PIPELINE_UPDATE_TOOL) {
      throw new Error('This tool does not support a preparation phase.');
    }
    try {
      return request.toolName === PIPELINE_BUILD_TOOL
        ? await preparePipelineBuildProposal(request, context, this.attachmentAssetBridge)
        : await preparePipelineUpdateProposal(request, context, this.attachmentAssetBridge);
    } catch (error) {
      console.error('[image-production-pipeline-prepare-error]', {
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown preparation error',
        errorName: error instanceof Error ? error.name : 'UnknownError',
        inputShape: summarizePreparationInput(request.input),
        toolCallId: context.toolCallId,
      });
      throw error;
    }
  }

  async callTool(request: Parameters<McpToolGateway['callTool']>[0], context: ToolExecutionContext) {
    const accessFailure = await verifyToolContext(context);
    if (accessFailure) return accessFailure;

    if (context.verifiedContext?.timeline) return { ok: false, safeError: {
      code: 'TIMELINE_TOOL_UNAVAILABLE', message: 'Помощник Timeline пока даёт рекомендации. Изменения выполняются в редакторе.', retryable: false,
    } };

    if (context.verifiedContext?.storyBlueprint) return callStoryTool(request, context);
    if (request.toolName === HOME_GENERATE_IMAGE_TOOL && this.homeGeneration) return this.homeGeneration.execute(request, context);
    if (request.toolName === HOME_IMAGE_MODELS_TOOL && context.verifiedContext?.homeConversation) {
      return { ok: true, output: await readImageGenerationModelCatalog() };
    }
    if (context.verifiedContext?.homeConversation) return {
      ok: false, safeError: { code: 'HOME_TOOL_UNAVAILABLE', message: 'Этот инструмент доступен только внутри Flow.', retryable: false },
    };

    if (request.toolName === KNOWLEDGE_SEARCH_TOOL) {
      const query = readString(request.input.query);
      const maxResults = readInteger(request.input.maxResults) ?? 3;
      return { ok: true, output: await searchAssistantKnowledge(query, maxResults) };
    }
    if (request.toolName === ASSISTANT_QUESTION_TOOL) {
      return callAssistantQuestion(request, context, this.conversations);
    }
    if (request.toolName === NODE_CATALOG_TOOL) {
      const query = readOptionalString(request.input.query);
      const nodes = getAssistantNodeCatalog(query);
      const imageModels = nodes.some((node) => node.type === 'generateImage') ? await readImageGenerationModelCatalog() : {};
      return { ok: true, output: { count: nodes.length, nodes, query, ...imageModels } };
    }
    if (request.toolName === DOCUMENT_GRAPH_TOOL) {
      return { ok: true, output: await readAssistantDocumentGraph(context) };
    }
    if (request.toolName === DESIGN_ELEMENT_SELECTION_TOOL) {
      const submitted = this.conversations
        ? await readDesignSelectionContinuation(this.conversations, context)
        : undefined;
      if (submitted) return { ok: true, output: submitted };
      try {
        return {
          ok: true,
          output: createDesignElementSelection(request.input, context.toolCallId),
        };
      } catch (error) {
        return {
          ok: false,
          safeError: {
            code: 'DESIGN_SELECTION_INVALID',
            message: error instanceof Error
              ? error.message
              : 'Не удалось подготовить выбор элементов макета.',
            retryable: true,
          },
        };
      }
    }
    if (request.toolName === PIPELINE_BUILD_TOOL) {
      return executePipelineBuildProposal(request, context, this.attachmentAssetBridge);
    }
    if (request.toolName === PIPELINE_UPDATE_TOOL) {
      return executePipelineUpdateProposal(request, context, this.attachmentAssetBridge);
    }
    return {
      ok: false,
      safeError: {
        code: 'CHAT_TOOL_DISABLED',
        message: 'Этот инструмент не включён в текущей версии ассистента.',
        retryable: false,
      },
    };
  }
}

function summarizePreparationInput(input: Record<string, unknown>) {
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];
  return {
    edgeCount: edges.length,
    edgePorts: edges.slice(0, 24).flatMap((edge) => {
      if (!isRecord(edge)) return [];
      return [{
        sourcePortId: readOptionalString(edge.sourcePortId)?.slice(0, 80),
        targetPortId: readOptionalString(edge.targetPortId)?.slice(0, 80),
      }];
    }),
    nodeCount: nodes.length,
    nodeTypes: nodes.slice(0, 12).flatMap((node) => (
      isRecord(node) && typeof node.type === 'string' ? [node.type.slice(0, 80)] : []
    )),
  };
}

async function verifyToolContext(context: ToolExecutionContext) {
  if (context.productId !== CHAT_ASSISTANT_PRODUCT_ID || !context.tenantId) {
    return deniedAccess();
  }
  try {
    await requireWorkspaceMembership(context.userId, context.tenantId);
    return undefined;
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return deniedAccess();
    throw error;
  }
}

function deniedAccess() {
  return {
    ok: false as const,
    safeError: {
      code: 'CHAT_TOOL_ACCESS_DENIED',
      message: 'Нет доступа к выбранному workspace.',
      retryable: false,
    },
  };
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown) {
  const normalized = readString(value);
  return normalized || undefined;
}

function readInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
