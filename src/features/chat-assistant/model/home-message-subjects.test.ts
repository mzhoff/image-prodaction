import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextMessage } from '@prodactionpro/chat-domain';
import { homeImageSettingsSelector } from '@/modules/chat-assistant/contracts/home-image-settings';
import { presentHomeMessageSubjects, messageImageSettingsId } from './home-message-subjects';

const settingsId = '01900000-0000-7000-8000-000000000011';
const subject = { id: '01900000-0000-7000-8000-000000000012', name: 'Анна', assetId: '01900000-0000-7000-8000-000000000013' };
const reference = { attachmentId: 'reference', kind: 'image', name: 'photo.png' };

test('a restored user turn shows the pinned hero alongside the original reference without altering runtime input', () => {
  const message = createTextMessage({ role: 'user', content: 'Two people' });
  message.metadata = { attachments: [reference], contextSelectors: homeImageSettingsSelector(settingsId) };
  const original = structuredClone(message);
  const result = presentHomeMessageSubjects([message], { [settingsId]: [subject] });
  assert.equal(messageImageSettingsId(message), settingsId);
  const attachments = result[0].metadata!.attachments as unknown[];
  assert.equal(attachments.length, 2);
  assert.deepEqual(attachments[0], reference);
  assert.deepEqual(attachments[1], { id: `home-subject:${subject.id}`, kind: 'image', name: 'Герой · Анна',
    url: `/api/assets/${subject.assetId}/content?variant=thumbnail` });
  assert.deepEqual(message, original);
  assert.deepEqual(presentHomeMessageSubjects(result, { [settingsId]: [subject] }), result);
});

test('preparing and optimistic messages show the same hero before the server turn arrives', () => {
  const preparing = createTextMessage({ role: 'user', content: 'Portrait' });
  preparing.metadata = { homeSubjectPreviews: [subject] };
  const optimistic = createTextMessage({ role: 'user', content: 'Portrait' });
  optimistic.metadata = { optimistic: true };
  assert.deepEqual(presentHomeMessageSubjects([preparing], {})[0].metadata!.attachments,
    presentHomeMessageSubjects([optimistic], { [optimistic.id]: [subject] })[0].metadata!.attachments);
});

test('text-only heroes, assistant replies and ordinary messages do not gain image thumbnails', () => {
  const user = createTextMessage({ role: 'user', content: 'Hi' });
  user.metadata = { contextSelectors: homeImageSettingsSelector(settingsId) };
  const assistant = { ...user, role: 'assistant' as const };
  const result = presentHomeMessageSubjects([user, assistant], { [settingsId]: [{ id: subject.id, name: subject.name }] });
  assert.deepEqual(result[0].metadata!.attachments, []);
  assert.equal(result[1], assistant);
  assert.equal(messageImageSettingsId(assistant), undefined);
});
