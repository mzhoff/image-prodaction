import type { ChatAppearanceSettings } from '@prodactionpro/chat-ui';

export const APPEARANCE: ChatAppearanceSettings = {
  assistantBubble: false,
  chatStyle: 'compact',
  font: 'product',
  iconLibrary: 'hugeicons',
  radius: 'product',
  showAssistantAvatar: false,
  showUserAvatar: false,
  visualProfile: 'product-light',
};
export const CHAT_STYLES = [{ id: 'compact', label: 'Compact', description: 'Product side panel.' }];
export const FONT_OPTIONS = [{ id: 'product', label: 'Product', description: 'System UI font.', fontFamily: 'inherit' }];
export const ICON_OPTIONS = [{ id: 'hugeicons', label: 'Hugeicons', description: 'Shared Reverie icon set.' }];
export const RADIUS_OPTIONS = [{
  id: 'product', label: 'Product', description: 'Image Production radius.',
  radius: { xs: 'var(--pui-radius-sm)', sm: 'var(--pui-radius-sm)', md: 'var(--pui-radius-md)', lg: 'var(--pui-radius-lg)' },
}];
export const VISUAL_OPTIONS = [{
  id: 'product-light', label: 'Product light', description: 'Image Production light theme.',
  colorMode: 'light' as const, swatches: ['#ffffff', '#111111', '#f4f4f5'] as const,
}, {
  id: 'product-dark', label: 'Product dark', description: 'Image Production dark theme.',
  colorMode: 'dark' as const, swatches: ['#18181b', '#fafafa', '#27272a'] as const,
}];
export const MESSAGE_PRESENTATION = {
  actionsVisibility: 'interaction' as const,
  metaPlacement: 'below-message' as const,
  showAssistantAuthor: false,
  showCopyAction: true,
  showMessageTime: true,
  showUserAuthor: false,
  sourcePresentation: 'compact' as const,
};
export const SCROLL_POLICY = {
  autoFollow: true, bottomThreshold: 56, jumpBehavior: 'smooth' as const, showJumpToLatest: true,
};
