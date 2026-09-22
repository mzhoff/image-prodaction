import { storyAuthoringTools } from '../contracts/story-authoring';
import type { AssistantMode } from '@prodactionpro/chat-domain';
import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import { HOME_GENERATE_IMAGE_TOOL, HOME_IMAGE_MODELS_TOOL } from '../contracts/home-generation';

export function toolsForAssistantMode(tools: AgentToolDefinition[], mode: AssistantMode, story = false, timeline = false) {
  if (timeline) return [];
  const storyNames = new Set(storyAuthoringTools.map((tool) => tool.name));
  if (story) return tools.filter((tool) => storyNames.has(tool.name));
  tools = tools.filter((tool) => !storyNames.has(tool.name));
  if (mode === 'general-chat') return [];
  const home = new Set([HOME_GENERATE_IMAGE_TOOL, HOME_IMAGE_MODELS_TOOL]);
  return tools.filter((tool) => mode === 'image-generation' ? home.has(tool.name) : !home.has(tool.name));
}
