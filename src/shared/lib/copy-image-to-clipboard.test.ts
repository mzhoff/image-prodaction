import assert from 'node:assert/strict';
import test from 'node:test';
import {
  copyImageBlobToClipboard,
  convertImageBlobToPng,
  ImageClipboardError,
  type ImageClipboardPort,
} from './copy-image-to-clipboard';

test('starts the clipboard write before the image blob finishes loading', async () => {
  const events: string[] = [];
  let payload: Record<string, Blob | Promise<Blob>> | undefined;
  const clipboard: ImageClipboardPort = {
    createItem: (nextPayload) => {
      events.push('create-item');
      payload = nextPayload;
      return nextPayload;
    },
    write: async () => {
      events.push('write');
      const image = await payload?.['image/png'];
      assert.equal(image?.type, 'image/png');
    },
  };

  const operation = copyImageBlobToClipboard(
    async () => {
      events.push('load-blob');
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    },
    {
      clipboard,
      convertToPng: async () => {
        events.push('convert');
        return new Blob(['png'], { type: 'image/png' });
      },
    },
  );

  assert.deepEqual(events, ['create-item', 'write']);
  await operation;
  assert.deepEqual(events, ['create-item', 'write', 'load-blob', 'convert']);
});

test('rejects when the current asset blob is missing', async () => {
  const clipboard: ImageClipboardPort = {
    createItem: (payload) => payload,
    write: async (items) => {
      const payload = items[0] as Record<string, Promise<Blob>>;
      await payload['image/png'];
    },
  };

  await assert.rejects(
    copyImageBlobToClipboard(async () => null, { clipboard }),
    (error: unknown) => error instanceof ImageClipboardError
      && error.message === 'The current image could not be loaded.',
  );
});

test('keeps an existing PNG blob without requiring browser canvas APIs', async () => {
  const source = new Blob(['png'], { type: 'image/png' });
  assert.equal(await convertImageBlobToPng(source), source);
});
