import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
const profile = fs.readFileSync(require.resolve('@prodactionpro/ui-tokens/css/reverie.css'), 'utf8');
const declared = new Set([...profile.matchAll(/(--pui-[\w-]+)\s*:/g)].map((match) => match[1]));
const missing = new Set();
const oldIcons = [];
let stylesheets = 0;
for (const file of [...files('src'), ...files('app')]) {
  if (!/\.(css|tsx?)$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes("from 'lucide-react'") || source.includes('from "lucide-react"')) oldIcons.push(file);
  if (!file.endsWith('.css')) continue;
  postcss.parse(source, { from: file });
  stylesheets++;
  for (const match of source.matchAll(/var\((--pui-[\w-]+)/g)) {
    if (!declared.has(match[1])) missing.add(`${file}: ${match[1]}`);
  }
}
assert.deepEqual(oldIcons, [], 'Продукт импортирует Hugeicons facade напрямую; alias только для внешнего ChatModule');
assert.deepEqual([...missing], [], 'Все semantic references должны существовать в опубликованном профиле');
const root = fs.readFileSync('app/layout.tsx', 'utf8');
assert.match(root, /ReverieThemeProvider/);
assert.match(root, /getThemeInitScript\(\)/);
const edges = fs.readFileSync('src/widgets/production-canvas/ui/canvas-edges.tsx', 'utf8');
assert.match(edges, /--pui-semantic-dataflow-/);
assert.doesNotMatch(edges, /return '#[a-f\d]+'/i);
console.log(`Reverie contract verified: ${stylesheets} stylesheets, complete token references, shared icons and theme.`);
