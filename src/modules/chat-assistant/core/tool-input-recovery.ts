import type {
  AgentModelMessage,
  AgentToolCall,
  AgentToolDefinition,
  ToolCallingLanguageModelResult,
} from '@prodactionpro/chat-connectors';
import type { TokenUsage } from '@prodactionpro/chat-domain';
import { PIPELINE_BUILD_TOOL, PIPELINE_UPDATE_TOOL } from '../contracts/image-production-tools';
import { pipelineBuildInputSchema } from './pipeline-build';
import { pipelineUpdateInputSchema } from './pipeline-update';

const MAX_CORRECTION_ISSUES = 6;

export function createToolInputCorrectionMessages(input: {
  result: ToolCallingLanguageModelResult;
  tools: AgentToolDefinition[];
}): AgentModelMessage[] | undefined {
  const knownTools = new Set(input.tools.map((tool) => tool.name));
  const problems = new Map(input.result.toolCalls.flatMap((toolCall) => {
    const problem = inspectToolCall(toolCall, knownTools);
    return problem ? [[toolCall.id, problem] as const] : [];
  }));
  if (problems.size === 0) return undefined;

  return [
    {
      content: input.result.content,
      role: 'assistant',
      toolCalls: input.result.toolCalls,
    },
    ...input.result.toolCalls.map((toolCall): AgentModelMessage => ({
      content: JSON.stringify({
        error: problems.get(toolCall.id) ?? 'No tools were executed because another call was invalid.',
        instruction: 'Correct the arguments using the provided tool schema and return one corrected tool call. Do not ask the user to repeat the task.',
        ok: false,
      }),
      name: toolCall.name,
      role: 'tool',
      toolCallId: toolCall.id,
    })),
  ];
}

export function addTokenUsage(left?: TokenUsage, right?: TokenUsage): TokenUsage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    completionTokens: left.completionTokens + right.completionTokens,
    costUsd: left.costUsd === undefined && right.costUsd === undefined
      ? undefined
      : (left.costUsd ?? 0) + (right.costUsd ?? 0),
    promptTokens: left.promptTokens + right.promptTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function inspectToolCall(toolCall: AgentToolCall, knownTools: Set<string>) {
  if (!knownTools.has(toolCall.name)) {
    return `Unknown tool ${toolCall.name}. Use one of: ${Array.from(knownTools).join(', ')}.`;
  }
  const schema = toolCall.name === PIPELINE_BUILD_TOOL
    ? pipelineBuildInputSchema
    : toolCall.name === PIPELINE_UPDATE_TOOL
      ? pipelineUpdateInputSchema
      : undefined;
  if (!schema) return undefined;
  const parsed = schema.safeParse(toolCall.input);
  if (parsed.success) return undefined;
  const issues = parsed.error.issues.slice(0, MAX_CORRECTION_ISSUES).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'input';
    return `${path}: ${issue.message}`;
  });
  return `Arguments for ${toolCall.name} do not match the schema. ${issues.join('; ')}`;
}
