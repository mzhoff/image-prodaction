export const COLLAPSED_NODE_PORT_TOP = 20;

export interface ExtractSectionDisplayState {
  promptOpen: boolean;
  resultOpen: boolean;
  settingsOpen: boolean;
}

export function getExtractNodeCollapseLayout(
  collapsed: boolean,
  sections: ExtractSectionDisplayState,
) {
  return {
    bodyVisible: !collapsed,
    portTop: collapsed ? COLLAPSED_NODE_PORT_TOP : undefined,
    sections,
  };
}

export interface CollapsedTextSplitterOutputPort {
  id: string;
  label: string;
  visuallyHidden: boolean;
}

export function getCollapsedTextSplitterOutputPorts(itemCount: number): CollapsedTextSplitterOutputPort[] {
  const normalizedCount = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;

  return [
    { id: 'items', label: 'Items', visuallyHidden: false },
    ...Array.from({ length: normalizedCount }, (_, index) => ({
      id: `item-${index}`,
      label: `Item ${index + 1}`,
      visuallyHidden: true,
    })),
  ];
}
