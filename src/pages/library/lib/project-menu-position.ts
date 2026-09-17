export interface ProjectMenuRect { left: number; right: number; top: number; bottom: number }

/** The same dropdown can be opened from a bottom toolbar or a grid context menu. */
export function projectMenuPosition(anchor: ProjectMenuRect, viewport: { width: number; height: number }, contentHeight: number) {
  const pad = 8;
  const gap = 8;
  const width = Math.min(360, Math.max(0, viewport.width - pad * 2));
  const height = Math.min(480, contentHeight);
  const below = Math.max(0, viewport.height - pad - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - pad);
  const openAbove = below < height && above > below;
  const maxHeight = Math.min(480, openAbove ? above : below, Math.max(0, viewport.height - pad * 2));
  const actualHeight = Math.min(height, maxHeight);
  return {
    left: Math.max(pad, Math.min(anchor.left, viewport.width - pad - width)),
    top: Math.max(pad, Math.min(openAbove ? anchor.top - gap - actualHeight : anchor.bottom + gap, viewport.height - pad - actualHeight)),
    width,
    maxHeight,
    placement: openAbove ? 'above' as const : 'below' as const,
  };
}
