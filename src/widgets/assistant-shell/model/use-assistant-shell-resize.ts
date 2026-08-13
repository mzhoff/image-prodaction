'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  clampAssistantShellSize,
  DEFAULT_ASSISTANT_SHELL_SIZE,
  resizeAssistantShell,
  type AssistantShellResizeDirection,
} from './assistant-shell-size';

export function useAssistantShellResize() {
  const [size, setSize] = useState(DEFAULT_ASSISTANT_SHELL_SIZE);
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handleViewportResize = () => {
      setSize((current) => clampAssistantShellSize(current, readViewport()));
    };
    handleViewportResize();
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  useEffect(() => () => activeResizeCleanupRef.current?.(), []);

  const startResize = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    direction: AssistantShellResizeDirection,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    activeResizeCleanupRef.current?.();

    const origin = { x: event.clientX, y: event.clientY };
    const initialSize = size;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = getResizeCursor(direction);
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setSize(resizeAssistantShell(initialSize, {
        x: moveEvent.clientX - origin.x,
        y: moveEvent.clientY - origin.y,
      }, direction, readViewport()));
    };
    const finishResize = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      activeResizeCleanupRef.current = null;
    };

    activeResizeCleanupRef.current = finishResize;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  }, [size]);

  const resizeWithKeyboard = useCallback((
    event: ReactKeyboardEvent<HTMLElement>,
    direction: AssistantShellResizeDirection,
  ) => {
    const step = event.shiftKey ? 32 : 8;
    const delta = getKeyboardDelta(event.key, step, direction);
    if (!delta) return;
    event.preventDefault();
    setSize((current) => resizeAssistantShell(current, delta, direction, readViewport()));
  }, []);

  return { resizeWithKeyboard, size, startResize };
}

function readViewport() {
  return { height: window.innerHeight, width: window.innerWidth };
}

function getResizeCursor(direction: AssistantShellResizeDirection) {
  if (direction === 'top') return 'ns-resize';
  if (direction === 'left') return 'ew-resize';
  return 'nwse-resize';
}

function getKeyboardDelta(
  key: string,
  step: number,
  direction: AssistantShellResizeDirection,
) {
  if ((direction === 'left' || direction === 'top-left') && key === 'ArrowLeft') {
    return { x: -step, y: 0 };
  }
  if ((direction === 'left' || direction === 'top-left') && key === 'ArrowRight') {
    return { x: step, y: 0 };
  }
  if ((direction === 'top' || direction === 'top-left') && key === 'ArrowUp') {
    return { x: 0, y: -step };
  }
  if ((direction === 'top' || direction === 'top-left') && key === 'ArrowDown') {
    return { x: 0, y: step };
  }
  return null;
}
