export type AssistantShellResizeDirection = 'left' | 'top' | 'top-left';

export interface AssistantShellSize {
  height: number;
  width: number;
}

interface AssistantShellViewport {
  height: number;
  width: number;
}

export const DEFAULT_ASSISTANT_SHELL_SIZE: AssistantShellSize = {
  height: 650,
  width: 420,
};

const MIN_ASSISTANT_SHELL_HEIGHT = 420;
const MIN_ASSISTANT_SHELL_WIDTH = 360;
const MAX_ASSISTANT_SHELL_HEIGHT = 900;
const MAX_ASSISTANT_SHELL_WIDTH = 880;
const VIEWPORT_EDGE_GAP = 44;

export function clampAssistantShellSize(
  size: AssistantShellSize,
  viewport: AssistantShellViewport,
): AssistantShellSize {
  const maxWidth = Math.max(0, Math.min(MAX_ASSISTANT_SHELL_WIDTH, viewport.width - VIEWPORT_EDGE_GAP));
  const maxHeight = Math.max(0, Math.min(MAX_ASSISTANT_SHELL_HEIGHT, viewport.height - VIEWPORT_EDGE_GAP));
  const minWidth = Math.min(MIN_ASSISTANT_SHELL_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_ASSISTANT_SHELL_HEIGHT, maxHeight);

  return {
    height: clamp(size.height, minHeight, maxHeight),
    width: clamp(size.width, minWidth, maxWidth),
  };
}

export function resizeAssistantShell(
  size: AssistantShellSize,
  delta: { x: number; y: number },
  direction: AssistantShellResizeDirection,
  viewport: AssistantShellViewport,
): AssistantShellSize {
  return clampAssistantShellSize({
    height: direction === 'top' || direction === 'top-left'
      ? size.height - delta.y
      : size.height,
    width: direction === 'left' || direction === 'top-left'
      ? size.width - delta.x
      : size.width,
  }, viewport);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
