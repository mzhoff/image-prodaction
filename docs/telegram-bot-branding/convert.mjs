import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root = new URL('./', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
await mkdir(new URL('telegram/', root), { recursive: true });
for (const asset of manifest.assets) {
  const input = await readFile(asset.source);
  const width = asset.id === 'avatar' ? 640 : 960;
  const pipeline = sharp(input).resize({ width, withoutEnlargement: true });
  const webp = await pipeline.clone().webp({ quality: 82, effort: 6 }).toBuffer();
  const jpeg = await pipeline.clone().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  asset.originalBytes ??= asset.bytes;
  asset.file = `assets/${asset.id}.webp`;
  const meta = await sharp(webp).metadata();
  Object.assign(asset, { width: meta.width, height: meta.height, bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex'),
    telegram: { file: `telegram/${asset.id}.jpg`, bytes: jpeg.length } });
  await writeFile(new URL(asset.file, root), webp);
  await writeFile(new URL(asset.telegram.file, root), jpeg);
  await unlink(new URL(`assets/${asset.id}.png`, root)).catch(e => { if (e.code !== 'ENOENT') throw e; });
}
await sharp(new URL(manifest.assets.find(a => a.id === 'welcome').file, root).pathname)
  .resize(640, 360, { fit: 'contain', background: '#f1f1f3' })
  .jpeg({ quality: 88, mozjpeg: true }).toFile(new URL('telegram/description.jpg', root).pathname);
manifest.status = 'optimized-assets-local-integration';
manifest.conversion = { webpQuality: 82, jpegQuality: 85, banners: '960x480', avatar: '640x640', crop: false };
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
let preview = await readFile(new URL('preview.html', root), 'utf8');
preview = preview.replaceAll('.png', '.webp').replaceAll('PNG', 'WebP');
await writeFile(new URL('preview.html', root), preview);
console.log(JSON.stringify({ original: manifest.assets.reduce((s,a)=>s+a.originalBytes,0), webp: manifest.assets.reduce((s,a)=>s+a.bytes,0), jpeg: manifest.assets.reduce((s,a)=>s+a.telegram.bytes,0), assets: manifest.assets.map(a=>({id:a.id,webp:a.bytes,jpeg:a.telegram.bytes})) }, null, 2));
