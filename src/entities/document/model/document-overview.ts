import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
import { NODE_DEFINITIONS } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';

// Bump when the generated image changes, so existing browser previews revalidate.
export const DOCUMENT_OVERVIEW_VERSION = 1;
const WIDTH = 840;
const HEIGHT = 500;

interface Card { id: string; x: number; y: number; width: number; height: number; title: string; text: string; color: string }

export function hasDocumentOverview(snapshot?: ProjectExport) {
  return Boolean(snapshot && (snapshot.project.nodes.length
    || (Array.isArray(snapshot.project.sections) && snapshot.project.sections.length)));
}

/** Saved-graph overview, independent of the editor DOM. Never fetches asset URLs or executes a node. */
export function createDocumentOverviewSvg(snapshot: ProjectExport): string | null {
  if (!hasDocumentOverview(snapshot)) return null;
  const cards = snapshot.project.nodes.slice(0, 2_000).map((node, index) => {
    const data = record(node.data);
    const definition = NODE_DEFINITIONS[node.type as ProductionNodeType];
    const fields = Array.isArray(data.fields) ? data.fields.slice(0, 30).map((field) => {
      const value = record(field);
      return `${string(value.key)} · ${string(value.kind)}`;
    }).join('\n') : '';
    const body = [data.text, data.prompt, data.instruction, data.resultText, data.result]
      .find((value) => typeof value === 'string' && value.trim());
    return {
      ...geometry(node, index, definition?.defaultHeight ?? 240), id: node.id,
      title: string(data.title) || definition?.title || 'Node',
      text: [string(data.model), fields, string(body)].filter(Boolean).join('\n\n'),
      color: definition?.ports.some((port) => port.kind === 'image') ? '#304bff' : '#0eaf53',
    };
  });
  const sections = (Array.isArray(snapshot.project.sections) ? snapshot.project.sections : []).slice(0, 2_000).map((section, index) => ({
    ...geometry(section, index, 400), id: `section-${index}`, title: string(section?.title), text: '',
    color: typeof section?.color === 'string' && /^#[0-9a-f]{6}$/i.test(section.color) ? section.color : '#dddddd',
  }));
  const bounds = [...cards, ...sections];
  const minX = Math.min(...bounds.map((card) => card.x));
  const minY = Math.min(...bounds.map((card) => card.y));
  const width = Math.max(...bounds.map((card) => card.x + card.width)) - minX;
  const height = Math.max(...bounds.map((card) => card.y + card.height)) - minY;
  const scale = Math.min((WIDTH - 48) / width, (HEIGHT - 48) / height);
  const x = (WIDTH - width * scale) / 2 - minX * scale;
  const y = (HEIGHT - height * scale) / 2 - minY * scale;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const edges = snapshot.project.edges.slice(0, 10_000).map((edge) => {
    const source = byId.get(edge?.sourceNodeId);
    const target = byId.get(edge?.targetNodeId);
    if (!source || !target) return '';
    const sx = source.x + source.width, sy = source.y + Math.min(source.height / 2, 120);
    const tx = target.x, ty = target.y + Math.min(target.height / 2, 120);
    const bend = Math.max(60, Math.abs(tx - sx) / 2);
    return `<path d="M${sx} ${sy} C${sx + bend} ${sy} ${tx - bend} ${ty} ${tx} ${ty}" fill="none" stroke="${source.color}" stroke-width="2"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="100%" height="100%" fill="#f4f4f4"/>
    <g transform="translate(${x} ${y}) scale(${scale})" font-family="Arial, sans-serif">
      ${sections.map((section) => `<rect x="${section.x}" y="${section.y}" width="${section.width}" height="${section.height}" rx="8" fill="${section.color}" fill-opacity="0.25" stroke="#dedede"/>
        <text x="${section.x + 16}" y="${section.y + 28}" font-size="14" font-weight="600" fill="#555">${escapeXml(section.title.slice(0, Math.floor(section.width / 8)))}</text>`).join('')}
      ${edges}${cards.map(renderCard).join('')}
    </g></svg>`;
}

function renderCard(card: Card, index: number) {
  const columns = Math.max(8, Math.floor((card.width - 32) / 7));
  const rows = Math.max(0, Math.min(60, Math.floor((card.height - 74) / 18)));
  const lines = card.text.slice(0, 2_000).split('\n').flatMap((line) => wrapLine(line, columns)).slice(0, rows);
  return `<g transform="translate(${card.x} ${card.y})">
    <defs><clipPath id="card-${index}"><rect width="${card.width}" height="${card.height}" rx="12"/></clipPath></defs>
    <rect width="${card.width}" height="${card.height}" rx="12" fill="#fff" stroke="#e6e6e8"/>
    <g clip-path="url(#card-${index})">
      <text x="16" y="28" font-size="14" font-weight="600" fill="#6f7078">${escapeXml(card.title.slice(0, columns))}</text>
      <rect x="12" y="44" width="${card.width - 24}" height="${Math.max(0, card.height - 56)}" rx="8" fill="#f4f4f5"/>
      ${lines.map((line, i) => `<text x="20" y="${66 + i * 18}" font-size="13" fill="#55565e">${escapeXml(line)}</text>`).join('')}
    </g></g>`;
}

function wrapLine(line: string, columns: number) {
  const lines: string[] = [];
  let rest = line;
  while (rest.length > columns) {
    const space = rest.lastIndexOf(' ', columns);
    const end = space > columns / 2 ? space : columns;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  return [...lines, rest];
}

function geometry(value: unknown, index: number, defaultHeight: number) {
  const entry = record(value), position = record(entry.position), size = record(entry.size);
  return { x: finite(position.x, (index % 4) * 460, -1_000_000, 1_000_000), y: finite(position.y, Math.floor(index / 4) * 500, -1_000_000, 1_000_000),
    width: finite(size.width, 400, 80, 10_000), height: finite(size.height, defaultHeight, 60, 10_000) };
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function string(value: unknown) { return typeof value === 'string' ? value.slice(0, 2_000) : ''; }
function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
}
