export function hasFileDrag(types: Iterable<string>) {
  return Array.from(types).some((type) => type.toLocaleLowerCase() === 'files');
}

export function shouldCaptureAssistantAttachmentDrop(input: {
  activeTab: 'assistant' | 'feedback';
  fileCount?: number;
  hasDropTarget: boolean;
  isOpen: boolean;
  types: Iterable<string>;
}) {
  return input.isOpen
    && input.activeTab === 'assistant'
    && input.hasDropTarget
    && (hasFileDrag(input.types) || (input.fileCount ?? 0) > 0);
}
