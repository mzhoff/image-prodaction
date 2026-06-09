'use client';

import { RotateCcw } from 'lucide-react';
import { useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CURVE_CHANNEL_IDS,
  buildCurveLut,
  createCurvePointId,
  createDefaultCurvePoints,
  normalizeCurvePoints,
  type CurveChannelId,
  type CurvePoint,
  type CurvePointMap,
} from '@/shared/lib/image-renderer/curves';
import type { ImageHistogram } from '@/shared/lib/image-renderer/image-histogram';
import { cn } from '@/shared/lib/cn';
import { RangeSlider } from '@/shared/ui/range-slider';

interface CurvesEditorProps {
  activeChannel: CurveChannelId;
  className?: string;
  curves: CurvePointMap;
  onActiveChannelChange: (channel: CurveChannelId) => void;
  onCurveChange: (channel: CurveChannelId, points: CurvePoint[]) => void;
  onInteractionStart?: () => void;
  onOpacityChange: (opacity: number) => void;
  histogram?: ImageHistogram;
  onResetChannel: (channel: CurveChannelId) => void;
  opacity: number;
  variant?: 'node' | 'viewer';
}

const channelLabels: Record<CurveChannelId, string> = {
  blue: 'B',
  green: 'G',
  master: 'RGB',
  red: 'R',
};

export function CurvesEditor({
  activeChannel,
  className,
  curves,
  onActiveChannelChange,
  onCurveChange,
  onInteractionStart,
  onOpacityChange,
  histogram,
  onResetChannel,
  opacity,
  variant = 'node',
}: CurvesEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingPointIdRef = useRef<string | null>(null);
  const activePoints = useMemo(() => normalizeCurvePoints(curves[activeChannel]), [activeChannel, curves]);
  const activeHistogram = useMemo(() => histogram?.[activeChannel], [activeChannel, histogram]);
  const activePath = useMemo(() => getCurvePath(activePoints), [activePoints]);
  const histogramPaths = useMemo(() => getHistogramPaths(activeHistogram), [activeHistogram]);

  const handleGraphPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = getPointFromEvent(event, svgRef.current);
    if (!point) return;

    onInteractionStart?.();
    const nextPoint = { id: createCurvePointId(), x: point.x, y: point.y };
    const nextPoints = normalizeCurvePoints([...activePoints, nextPoint]);
    draggingPointIdRef.current = nextPoint.id;
    event.currentTarget.setPointerCapture(event.pointerId);
    onCurveChange(activeChannel, nextPoints);
  };

  const handlePointPointerDown = (pointId: string, event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    onInteractionStart?.();
    draggingPointIdRef.current = pointId;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pointId = draggingPointIdRef.current;
    if (!pointId) return;
    event.stopPropagation();
    const point = getPointFromEvent(event, svgRef.current);
    if (!point) return;
    onCurveChange(activeChannel, movePoint(activePoints, pointId, point));
  };

  const handlePointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingPointIdRef.current = null;
  };

  const handleRemovePoint = (pointId: string, event: ReactMouseEvent<SVGCircleElement>) => {
    event.stopPropagation();
    if (pointId === 'black' || pointId === 'white') return;
    onInteractionStart?.();
    onCurveChange(activeChannel, normalizeCurvePoints(activePoints.filter((point) => point.id !== pointId)));
  };

  return (
    <div className={cn('curves-editor', `curves-editor-${variant}`, className)} data-node-interactive>
      <div className="curves-editor-header">
        <div className="curves-channel-tabs" aria-label="Curve channel">
          {CURVE_CHANNEL_IDS.map((channel) => (
            <button
              key={channel}
              type="button"
              className={cn('curves-channel-button', `curves-channel-${channel}`, activeChannel === channel && 'curves-channel-button-active')}
              onClick={(event) => {
                event.stopPropagation();
                onActiveChannelChange(channel);
              }}
            >
              {channelLabels[channel]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="curves-reset-button"
          aria-label="Reset active curve"
          title="Reset curve"
          onClick={(event) => {
            event.stopPropagation();
            onInteractionStart?.();
            onResetChannel(activeChannel);
          }}
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <svg
        ref={svgRef}
        className={cn('curves-graph', `curves-graph-${activeChannel}`)}
        viewBox="0 0 256 256"
        role="application"
        aria-label={`${channelLabels[activeChannel]} tone curve`}
        onPointerDown={handleGraphPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <rect className="curves-graph-bg" x="0" y="0" width="256" height="256" rx="0" />
        {histogramPaths?.areaPath ? <path className="curves-histogram-area" d={histogramPaths.areaPath} /> : null}
        {histogramPaths?.linePath ? <path className="curves-histogram-line" d={histogramPaths.linePath} /> : null}
        {[64, 128, 192].map((position) => (
          <line key={`v-${position}`} className={cn('curves-grid-line', position === 128 && 'curves-grid-line-mid')} x1={position} x2={position} y1="0" y2="256" />
        ))}
        {[64, 128, 192].map((position) => (
          <line key={`h-${position}`} className={cn('curves-grid-line', position === 128 && 'curves-grid-line-mid')} x1="0" x2="256" y1={position} y2={position} />
        ))}
        <line className="curves-diagonal" x1="0" x2="256" y1="256" y2="0" />
        <path className="curves-line" d={activePath} />
        {activePoints.map((point) => (
          <circle
            key={point.id}
            className={cn('curves-point', point.id === 'black' || point.id === 'white' ? 'curves-point-endpoint' : 'curves-point-control')}
            cx={point.x * 256}
            cy={(1 - point.y) * 256}
            r={point.id === 'black' || point.id === 'white' ? 5.6 : 6.4}
            onPointerDown={(event) => handlePointPointerDown(point.id, event)}
            onDoubleClick={(event) => handleRemovePoint(point.id, event)}
          />
        ))}
      </svg>
      <RangeSlider
        ariaLabel="Curves opacity"
        className="curves-opacity-slider"
        max={100}
        min={0}
        value={opacity}
        valueLabel={`Opacity ${opacity}%`}
        onChange={onOpacityChange}
        onInteractionStart={onInteractionStart}
      />
    </div>
  );
}

function getCurvePath(points: CurvePoint[]) {
  const lut = buildCurveLut(points);
  return Array.from(lut, (value, index) => `${index === 0 ? 'M' : 'L'} ${index} ${256 - (value / 255) * 256}`).join(' ');
}

function getHistogramPaths(histogram?: number[]) {
  if (!histogram || histogram.length === 0) return null;
  const maxCount = histogram.reduce((max, count) => (count > max ? count : max), 0);
  if (maxCount <= 0) return null;

  const pointCount = histogram.length;
  const graphHeight = 256;
  const topPadding = 8;
  const usableHeight = 240;
  const baseline = topPadding + usableHeight;
  const linePoints = histogram.map((count, index) => {
    const x = pointCount > 1 ? (index / (pointCount - 1)) * graphHeight : graphHeight / 2;
    const y = topPadding + (1 - count / maxCount) * usableHeight;
    return { x, y };
  });

  const linePath = linePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${graphHeight} ${baseline.toFixed(2)} L 0 ${baseline.toFixed(2)} Z`;

  return {
    areaPath,
    linePath,
  };
}

function movePoint(points: CurvePoint[], pointId: string, point: { x: number; y: number }) {
  const normalizedPoints = normalizeCurvePoints(points);
  const index = normalizedPoints.findIndex((item) => item.id === pointId);
  if (index < 0) return normalizedPoints;

  const minGap = 0.012;
  const previousX = index > 0 ? normalizedPoints[index - 1].x + minGap : 0;
  const nextX = index < normalizedPoints.length - 1 ? normalizedPoints[index + 1].x - minGap : 1;
  const x = pointId === 'black' ? 0 : pointId === 'white' ? 1 : clamp(point.x, previousX, nextX);

  return normalizeCurvePoints(normalizedPoints.map((item) => (
    item.id === pointId ? { ...item, x, y: clamp01(point.y) } : item
  )));
}

function getPointFromEvent(event: ReactPointerEvent<SVGSVGElement>, svg: SVGSVGElement | null) {
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    x: clamp01((event.clientX - rect.left) / rect.width),
    y: clamp01(1 - (event.clientY - rect.top) / rect.height),
  };
}

export function resetCurveChannel() {
  return createDefaultCurvePoints();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}
