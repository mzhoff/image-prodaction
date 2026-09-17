'use client';

import { useImageViewerGesture as useSharedImageViewerGesture } from '@prodactionpro/ui-media/client';
import { hasOpenFloatingContextMenu } from '@/shared/ui/floating-context-menu';

type GestureArguments = Parameters<typeof useSharedImageViewerGesture>;

/** Legacy entry point injects the host's floating-menu state into shared gestures. */
export function useImageViewerGesture(ref: GestureArguments[0], motion: GestureArguments[1],
  toOffset: GestureArguments[2], toPosition: GestureArguments[3], options: GestureArguments[4] = {}) {
  return useSharedImageViewerGesture(ref, motion, toOffset, toPosition, {
    ...options,
    isInteractionBlocked: options.isInteractionBlocked ?? hasOpenFloatingContextMenu,
  });
}
