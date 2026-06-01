'use client';

import { useEffect, useRef, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import type { ImageAdjustmentValues } from '@/shared/lib/image-renderer/adjustment-types';
import { drawAdjustedImagePreview } from '@/shared/lib/image-renderer/canvas-adjustment';
import { createWebglAdjustmentPreviewRenderer, type AdjustmentPreviewRenderer } from '@/shared/lib/image-renderer/webgl-adjustment-renderer';
import { ImagePlate } from './image-plate';

const ENABLE_ADJUSTMENT_PREVIEW_FALLBACK = true;

interface AdjustmentPreviewProps {
  assetId?: string;
  aspectRatio?: string;
  values: ImageAdjustmentValues;
}

export function AdjustmentPreview({ assetId, aspectRatio, values }: AdjustmentPreviewProps) {
  const url = useAssetUrl(assetId);
  const [fallbackCanvas, setFallbackCanvas] = useState<HTMLCanvasElement | null>(null);
  const [webglCanvas, setWebglCanvas] = useState<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const latestValuesRef = useRef(values);
  const rendererRef = useRef<AdjustmentPreviewRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [useCanvasFallback, setUseCanvasFallback] = useState(false);

  useEffect(() => {
    latestValuesRef.current = values;
  }, [values]);

  useEffect(() => {
    let active = true;
    setReady(false);
    setWebglReady(false);
    imageRef.current = null;

    if (!url) return undefined;

    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (!active) return;
      imageRef.current = image;
      setReady(true);
      if (ENABLE_ADJUSTMENT_PREVIEW_FALLBACK && fallbackCanvas) {
        drawAdjustedImagePreview(fallbackCanvas, image, latestValuesRef.current);
      }
      void rendererRef.current?.setImage(image).then(() => {
        rendererRef.current?.render(latestValuesRef.current);
        setWebglReady(true);
      });
    };
    image.onerror = () => {
      if (!active) return;
      imageRef.current = null;
      setReady(false);
    };
    image.src = url;

    return () => {
      active = false;
    };
  }, [fallbackCanvas, url]);

  useEffect(() => {
    if (!webglCanvas || !url) return undefined;

    let active = true;
    setWebglReady(false);
    setUseCanvasFallback(false);

    void createWebglAdjustmentPreviewRenderer(webglCanvas)
      .then(async (renderer) => {
        if (!active) {
          renderer.destroy();
          return;
        }

        rendererRef.current = renderer;
        if (imageRef.current) {
          await renderer.setImage(imageRef.current);
          renderer.render(latestValuesRef.current);
          setWebglReady(true);
        }
      })
      .catch((error) => {
        console.warn('[AdjustmentPreview] WebGL preview failed', error);
        if (active) {
          setUseCanvasFallback(true);
          setWebglReady(false);
        }
      });

    return () => {
      active = false;
      setWebglReady(false);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [webglCanvas, url]);

  useEffect(() => {
    if (!fallbackCanvas && !webglCanvas) return undefined;

    const observer = new ResizeObserver(() => {
      rendererRef.current?.resize();
      rendererRef.current?.render(latestValuesRef.current);
      if (ENABLE_ADJUSTMENT_PREVIEW_FALLBACK && fallbackCanvas && imageRef.current) {
        drawAdjustedImagePreview(fallbackCanvas, imageRef.current, values);
      }
    });
    if (fallbackCanvas) observer.observe(fallbackCanvas);
    if (webglCanvas) observer.observe(webglCanvas);

    return () => observer.disconnect();
  }, [fallbackCanvas, useCanvasFallback, values, webglCanvas, webglReady]);

  useEffect(() => {
    if (!ready || !imageRef.current) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (!imageRef.current) return;
      if (ENABLE_ADJUSTMENT_PREVIEW_FALLBACK && fallbackCanvas) {
        drawAdjustedImagePreview(fallbackCanvas, imageRef.current, values);
      }
      if (rendererRef.current) {
        rendererRef.current.render(values);
        return;
      }
      if (ENABLE_ADJUSTMENT_PREVIEW_FALLBACK && fallbackCanvas && useCanvasFallback) {
        drawAdjustedImagePreview(fallbackCanvas, imageRef.current, values);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fallbackCanvas, ready, useCanvasFallback, values]);

  useEffect(() => {
    if (!ENABLE_ADJUSTMENT_PREVIEW_FALLBACK || !fallbackCanvas || !imageRef.current || webglReady) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (imageRef.current) {
        drawAdjustedImagePreview(fallbackCanvas, imageRef.current, values);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fallbackCanvas, values, webglReady]);

  if (!url) {
    return <ImagePlate assetId={undefined} aspectRatio={aspectRatio} />;
  }

  return (
    <div
      className="image-plate image-plate-sized adjustment-preview"
      style={{ aspectRatio: formatCssAspectRatio(aspectRatio) ?? '1 / 1' }}
      onDragStart={(event) => event.preventDefault()}
    >
      {ENABLE_ADJUSTMENT_PREVIEW_FALLBACK ? (
        <canvas ref={setFallbackCanvas} className="adjustment-preview-canvas adjustment-preview-fallback-canvas" />
      ) : null}
      <canvas
        ref={setWebglCanvas}
        className="adjustment-preview-canvas adjustment-preview-webgl-canvas"
        style={{ opacity: webglReady && !useCanvasFallback ? 1 : 0 }}
      />
    </div>
  );
}

function formatCssAspectRatio(value?: string) {
  const normalized = value?.trim().replace(':', ' / ');
  return normalized && /^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(normalized) ? normalized : undefined;
}
