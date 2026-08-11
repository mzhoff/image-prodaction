import type { McpToolGateway, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { requireWorkspaceMembership, WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';
import { getAssistantNodeCatalog } from '../core/node-catalog';
import {
  CHAT_ASSISTANT_PRODUCT_ID,
} from '../contracts/assistant-config';
import {
  KNOWLEDGE_SEARCH_TOOL,
  NODE_CATALOG_TOOL,
} from '../contracts/image-production-tools';
import { searchAssistantKnowledge } from './knowledge-base';

export class ImageProductionKnowledgeToolGateway implements McpToolGateway {
  async callTool(request: Parameters<McpToolGateway['callTool']>[0], context: ToolExecutionContext) {
    const accessFailure = await verifyToolContext(context);
    if (accessFailure) return accessFailure;

    if (request.toolName === KNOWLEDGE_SEARCH_TOOL) {
      const query = readString(request.input.query);
      const maxResults = readInteger(request.input.maxResults) ?? 3;
      return { ok: true, output: await searchAssistantKnowledge(query, maxResults) };
    }
    if (request.toolName === NODE_CATALOG_TOOL) {
      const query = readOptionalString(request.input.query);
      const nodes = getAssistantNodeCatalog(query);
      return { ok: true, output: { count: nodes.length, nodes, query } };
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
