export const TELEGRAM_MAX_MEDIA_ITEMS = 10;

export interface TelegramMediaLayout {
  aspectRatio: string;
  areas: string[];
  columns: string;
  rows: string;
  template: string;
}

const TELEGRAM_MEDIA_LAYOUTS: Record<number, TelegramMediaLayout> = {
  1: {
    aspectRatio: '1 / 1',
    areas: ['a'],
    columns: '1fr',
    rows: '1fr',
    template: '"a"',
  },
  2: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b'],
    columns: 'repeat(2, minmax(0, 1fr))',
    rows: '1fr',
    template: '"a b"',
  },
  3: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c'],
    columns: 'repeat(2, minmax(0, 1fr))',
    rows: 'repeat(2, minmax(0, 1fr))',
    template: '"a b" "a c"',
  },
  4: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd'],
    columns: 'repeat(2, minmax(0, 1fr))',
    rows: 'repeat(2, minmax(0, 1fr))',
    template: '"a b" "c d"',
  },
  5: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd', 'e'],
    columns: 'repeat(6, minmax(0, 1fr))',
    rows: 'repeat(2, minmax(0, 1fr))',
    template: '"a a a b b b" "c c d d e e"',
  },
  6: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd', 'e', 'f'],
    columns: 'repeat(3, minmax(0, 1fr))',
    rows: 'repeat(2, minmax(0, 1fr))',
    template: '"a b c" "d e f"',
  },
  7: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    columns: 'repeat(6, minmax(0, 1fr))',
    rows: 'repeat(3, minmax(0, 1fr))',
    template: '"a a a b b b" "c c d d e e" "f f f g g g"',
  },
  8: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    columns: 'repeat(6, minmax(0, 1fr))',
    rows: 'repeat(3, minmax(0, 1fr))',
    template: '"a a a b b b" "c c d d e e" "f f g g h h"',
  },
  9: {
    aspectRatio: '1 / 1',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    columns: 'repeat(3, minmax(0, 1fr))',
    rows: 'repeat(3, minmax(0, 1fr))',
    template: '"a b c" "d e f" "g h i"',
  },
  10: {
    aspectRatio: '320 / 462',
    areas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    columns: 'repeat(6, minmax(0, 1fr))',
    rows: 'repeat(4, minmax(0, 1fr))',
    template: '"a a a b b b" "c c d d e e" "f f f g g g" "h h i i j j"',
  },
};

export function getTelegramMediaLayout(count: number): TelegramMediaLayout {
  const safeCount = Math.max(1, Math.min(TELEGRAM_MAX_MEDIA_ITEMS, Math.floor(count)));
  return TELEGRAM_MEDIA_LAYOUTS[safeCount] ?? TELEGRAM_MEDIA_LAYOUTS[TELEGRAM_MAX_MEDIA_ITEMS];
}
