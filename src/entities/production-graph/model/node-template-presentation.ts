import { getNodePorts } from './node-definitions';
import { getNodeDefinition } from './node-registry';
import { createNodeFromTemplateSnapshot, type NodeTemplatePreset } from './node-template-preset';

export interface NodeTemplatePresentation {
  detailLines: string[];
  inputCount: number;
  title: string;
  typeLabel: string;
}

export function getNodeTemplatePresentation(
  template: Pick<NodeTemplatePreset, 'snapshot'>,
): NodeTemplatePresentation {
  const node = createNodeFromTemplateSnapshot(template.snapshot, { x: 0, y: 0 });
  const data = node.data as unknown as Record<string, unknown>;
  const definition = getNodeDefinition(node.type);
  const title = asText(data.title) ?? definition.title;
  const inputCount = getNodePorts(node).filter((port) => port.side === 'input').length;

  return {
    detailLines: getDetailLines(node.type, data).slice(0, 2),
    inputCount,
    title,
    typeLabel: definition.menuLabel,
  };
}

function getDetailLines(type: NodeTemplatePreset['snapshot']['nodeType'], data: Record<string, unknown>) {
  const lines: string[] = [];
  const model = asText(data.model);
  if (model) lines.push(`Model · ${model}`);

  if (type === 'exportImage') {
    const format = asText(data.format)?.toUpperCase();
    const quality = asText(data.quality);
    const scale = asText(data.scale);
    lines.push(compact([format, quality && `Quality ${quality}`, scale && `${scale}×`]));
    const background = asText(data.background);
    if (background) lines.push(`Background · ${background}`);
  } else if (type === 'composition') {
    const width = asNumber(data.canvasWidth);
    const height = asNumber(data.canvasHeight);
    if (width && height) lines.push(`Canvas · ${width} × ${height}`);
    pushImageSize(lines, data);
  } else if (type === 'textToSpeech') {
    lines.push(compact([
      asText(data.voice) && `Voice ${asText(data.voice)}`,
      asText(data.language),
      asText(data.responseFormat)?.toUpperCase(),
    ]));
  } else if (type === 'qrCode') {
    const pixelSize = asNumber(data.pixelSize);
    lines.push(compact([
      pixelSize === undefined ? undefined : `${pixelSize} px`,
      asText(data.errorCorrectionLevel) && `Error ${asText(data.errorCorrectionLevel)}`,
    ]));
  } else {
    pushImageSize(lines, data);
    const preset = asText(data.preset) ?? asText(data.presetId);
    if (preset) lines.push(`Preset · ${preset}`);
  }

  return lines.filter(Boolean);
}

function pushImageSize(lines: string[], data: Record<string, unknown>) {
  const aspectRatio = asText(data.aspectRatio);
  const size = asText(data.size);
  const line = compact([aspectRatio && `Ratio ${aspectRatio}`, size && `Size ${size}`]);
  if (line) lines.push(line);
}

function compact(parts: Array<string | false | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

function asText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
