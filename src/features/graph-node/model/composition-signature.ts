import type { CompositionLayerView } from './composition-model-types';

export function getCompositionResultSignature({
  canvasHeight,
  canvasWidth,
  layers,
}: {
  canvasHeight: number;
  canvasWidth: number;
  layers: CompositionLayerView[];
}) {
  return JSON.stringify({
    canvasHeight,
    canvasWidth,
    layers: layers.map((layer) => ({
      assetId: layer.assetId,
      kind: layer.kind,
      style: {
        align: layer.style.align,
        blendMode: layer.style.blendMode,
        color: layer.style.color,
        fit: layer.style.fit,
        flipX: layer.style.flipX,
        flipY: layer.style.flipY,
        fontFamily: layer.style.fontFamily,
        fontSize: layer.style.fontSize,
        fontWeight: layer.style.fontWeight,
        height: layer.style.height,
        letterSpacing: layer.style.letterSpacing,
        lineHeight: layer.style.lineHeight,
        opacity: layer.style.opacity,
        rotation: layer.style.rotation,
        verticalAlign: layer.style.verticalAlign,
        visible: layer.style.visible,
        width: layer.style.width,
        x: layer.style.x,
        y: layer.style.y,
      },
      text: layer.text,
    })),
  });
}
