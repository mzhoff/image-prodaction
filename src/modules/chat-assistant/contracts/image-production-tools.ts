import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';

export const KNOWLEDGE_SEARCH_TOOL = 'knowledge_search';
export const NODE_CATALOG_TOOL = 'node_catalog';

export const imageProductionKnowledgeTools: AgentToolDefinition[] = [
  {
    name: KNOWLEDGE_SEARCH_TOOL,
    description: 'Search the product-owned Image Production knowledge base for verified product guidance.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 240 },
        maxResults: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  {
    name: NODE_CATALOG_TOOL,
    description: 'Read the live server-owned catalog of Image Production node types and their ports.',
    riskLevel: 'read',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', maxLength: 120 },
      },
    },
  },
];
