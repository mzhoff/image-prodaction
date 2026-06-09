export const FLOATING_CONTEXT_MENU_CLOSE_EVENT = 'reverie:close-floating-context-menus';
export const FLOATING_CONTEXT_MENU_SELECTOR = '[data-floating-context-menu="true"]';

export function hasOpenFloatingContextMenu() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector(FLOATING_CONTEXT_MENU_SELECTOR));
}

export function requestCloseFloatingContextMenus() {
  if (typeof document === 'undefined') return;
  document.dispatchEvent(new Event(FLOATING_CONTEXT_MENU_CLOSE_EVENT));
}
