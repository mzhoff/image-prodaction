type KeyboardPathElement = {
  className?: unknown;
  isContentEditable?: boolean;
  tagName?: string;
};

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const CHAT_COMPOSER_FORM_CLASS = 'cm-composer-form';
const CHAT_COMPOSER_TEXTAREA_CLASS = 'cm-composer-textarea';

export function isChatComposerKeyboardPath(path: readonly unknown[]) {
  return path.some((node) => hasClassName(node, CHAT_COMPOSER_TEXTAREA_CLASS));
}

export function isExternalEditableKeyboardPath(path: readonly unknown[]) {
  let containsEditableControl = false;
  let containsChatComposer = false;

  for (const node of path) {
    if (!node || typeof node !== 'object') continue;
    const element = node as KeyboardPathElement;
    if (element.isContentEditable || EDITABLE_TAG_NAMES.has(element.tagName ?? '')) {
      containsEditableControl = true;
    }
    if (hasClassName(element, CHAT_COMPOSER_FORM_CLASS)) {
      containsChatComposer = true;
    }
  }

  return containsEditableControl && !containsChatComposer;
}

export function isSelectAllShortcut(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>) {
  return !event.altKey
    && event.key.toLowerCase() === 'a'
    && ((event.ctrlKey && !event.metaKey) || (!event.ctrlKey && event.metaKey));
}

function hasClassName(node: unknown, expectedClassName: string) {
  if (!node || typeof node !== 'object') return false;
  const className = (node as KeyboardPathElement).className;
  return typeof className === 'string' && className.split(/\s+/u).includes(expectedClassName);
}
