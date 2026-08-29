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
        blur: layer.style.blur,
        color: layer.style.color,
        cornerRadius: layer.style.cornerRadius,
        fit: layer.style.fit,
        fillOpacity: layer.style.fillOpacity,
        flipX: layer.style.flipX,
        flipY: layer.style.flipY,
        fontFamily: layer.style.fontFamily,
        fontSize: layer.style.fontSize,
        fontWeight: layer.style.fontWeight,
        gradient: layer.style.gradient,
        height: layer.style.height,
        letterSpacing: layer.style.letterSpacing,
        lineHeight: layer.style.lineHeight,
        opacity: layer.style.opacity,
        rotation: layer.style.rotation,
        shadow: layer.style.shadow,
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
