'use client';

import type { AnimationItem } from 'lottie-web';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  generationWaitingLabel,
  selectGenerationWaitingVisual,
  type GenerationWaitingKind,
  type GenerationWaitingPhase,
} from '../model/waiting-visuals';

interface GenerationWaitingExperienceProps {
  kind: GenerationWaitingKind;
  phase: GenerationWaitingPhase;
  previousImageUrl?: string;
  seed?: string;
}

const SHOW_AFTER_MS = 650;

export function GenerationWaitingExperience({ kind, phase, previousImageUrl, seed }: GenerationWaitingExperienceProps) {
  const visual = useMemo(() => selectGenerationWaitingVisual(kind, seed), [kind, seed]);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timeout);
  }, [seed]);

  if (!visible) return null;

  return (
    <div className="generation-waiting-experience" role="status" aria-live="polite">
      {previousImageUrl && kind === 'image' && !reducedMotion ? (
        <TileReassembly imageUrl={previousImageUrl} seed={seed} />
      ) : visual ? (
        <LottieVisual path={visual.lottieUrl} reducedMotion={reducedMotion} />
      ) : null}
      <div className="generation-waiting-copy">
        <span className="generation-waiting-dot" aria-hidden="true" />
        {generationWaitingLabel(phase, kind)}
      </div>
    </div>
  );
}

function LottieVisual({ path, reducedMotion }: { path: string; reducedMotion: boolean }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || reducedMotion) return undefined;
    let animation: AnimationItem | undefined;
    let active = true;
    void import('lottie-web').then(({ default: lottie }) => {
      if (!active || !container.current) return;
      animation = lottie.loadAnimation({
        container: container.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      animation?.destroy();
    };
  }, [path, reducedMotion]);

  return <div className="generation-waiting-lottie" aria-hidden="true" ref={container} />;
}

function TileReassembly({ imageUrl, seed }: { imageUrl: string; seed?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return undefined;
    const image = new Image();
    let frame = 0;
    let disposed = false;
    let loaded = false;
    let intersecting = true;
    const columns = 18;
    const rows = 11;
    const delays = tileDelays(columns * rows, seed);

    const draw = (time: number) => {
      if (disposed) return;
      const bounds = target.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * dpr));
      const height = Math.max(1, Math.round(bounds.height * dpr));
      if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
      }
      const context = target.getContext('2d');
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle = 'rgba(8, 11, 19, 0.58)';
      context.fillRect(0, 0, bounds.width, bounds.height);
      const elapsed = (time % 3_200) / 3_200;
      const tileWidth = bounds.width / columns;
      const tileHeight = bounds.height / rows;
      for (let index = 0; index < columns * rows; index += 1) {
        const local = Math.min(1, Math.max(0, (elapsed - delays[index]) / 0.24));
        if (local <= 0) continue;
        const column = index % columns;
        const row = Math.floor(index / columns);
        const alpha = 0.25 + 0.75 * local;
        context.globalAlpha = alpha;
        context.drawImage(
          image,
          column * image.naturalWidth / columns,
          row * image.naturalHeight / rows,
          image.naturalWidth / columns,
          image.naturalHeight / rows,
          column * tileWidth,
          row * tileHeight,
          tileWidth,
          tileHeight,
        );
      }
      context.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const start = () => {
      if (disposed || document.hidden || !intersecting || !loaded || frame) return;
      frame = window.requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? false;
      if (intersecting) start(); else stop();
    });
    const onVisibilityChange = () => {
      if (document.hidden) stop(); else start();
    };
    observer.observe(target);
    document.addEventListener('visibilitychange', onVisibilityChange);
    image.onload = () => { loaded = true; start(); };
    image.onerror = () => { target.hidden = true; };
    image.src = imageUrl;
    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [imageUrl, seed]);

  return <canvas className="generation-waiting-tiles" aria-hidden="true" ref={canvas} />;
}

function tileDelays(length: number, seed?: string) {
  let value = stringSeed(seed || 'previous-result');
  return Array.from({ length }, () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return (value / 4_294_967_295) * 0.66;
  });
}

function stringSeed(value: string) {
  return [...value].reduce((seed, character) => Math.imul(seed ^ character.charCodeAt(0), 16_777_619) >>> 0, 2_166_136_261);
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reducedMotion;
}
