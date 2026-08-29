export function resolveQrCodeEffectiveContent(input: {
  hasIncomingEdge: boolean;
  incomingText?: string;
  localContent: unknown;
}) {
  if (input.hasIncomingEdge) return input.incomingText?.trim() ?? '';
  return typeof input.localContent === 'string' ? input.localContent.trim() : '';
}
