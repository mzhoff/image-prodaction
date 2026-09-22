import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatLocalizationProvider, ChatMessageItem, useChatLocalization } from '@prodactionpro/chat-ui';
import { translatePackageMessage } from './package-translations';

test('shared package UI supports both Russian and English source labels', () => {
  assert.equal(translatePackageMessage('ru', 'Assistant is thinking'), 'Ассистент думает');
  assert.equal(translatePackageMessage('en', 'Assistant is thinking'), 'Assistant is thinking');
  assert.equal(translatePackageMessage('en', 'Загрузка вложений'), 'Uploading attachments');
  assert.equal(translatePackageMessage('ru', 'Загрузка вложений'), 'Загрузка вложений');
});

test('package translation interpolates values verbatim and retains unknown labels', () => {
  assert.equal(translatePackageMessage('ru', 'AI action: {toolName}', {toolName: 'pipeline_build'}), 'Действие ассистента: pipeline_build');
  assert.equal(translatePackageMessage('en', '{p1} загружен', {p1: 'Мой {p1}.png'}), 'Мой {p1}.png uploaded');
  assert.equal(translatePackageMessage('ru', 'Unknown package label'), 'Unknown package label');
});

test('published ChatModule renders localized controls without translating message content', () => {
  for (const locale of ['ru', 'en'] as const) {
    // The published provider requires children in its props; createElement's TS overload does too.
    // eslint-disable-next-line react/no-children-prop
    const html = renderToStaticMarkup(createElement(ChatLocalizationProvider, {
      locale: locale === 'ru' ? 'ru-RU' : 'en-US',
      translate: (source, params) => translatePackageMessage(locale, source, params),
      children: createElement(ChatMessageItem, {
        showAvatar: false,
        useBubble: false,
        message: {
          id: 'localization-consumer',
          role: 'assistant',
          createdAt: '2026-09-22T08:00:00Z',
          blocks: [{ type: 'markdown', content: 'Копировать' }],
        },
      }),
    }));
    assert.ok(html.includes(`aria-label="${locale === 'ru' ? 'Копировать сообщение' : 'Copy message'}"`));
    assert.ok(html.includes('Копировать</p>'));
  }
});

test('published localization hook exposes the selected locale to consumer components', () => {
  function Consumer() {
    const { locale, translate } = useChatLocalization();
    return createElement('span', null, `${locale}: ${translate('Assistant is thinking')}`);
  }
  // The published provider requires children in its props; createElement's TS overload does too.
  // eslint-disable-next-line react/no-children-prop
  const html = renderToStaticMarkup(createElement(ChatLocalizationProvider, {
    locale: 'ru-RU',
    translate: (source, params) => translatePackageMessage('ru', source, params),
    children: createElement(Consumer),
  }));
  assert.equal(html, '<span>ru-RU: Ассистент думает</span>');
});
