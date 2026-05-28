export function CanvasGrid({
  pan,
  zoom,
}: {
  pan: { x: number; y: number };
  zoom: number;
}) {
  const baseStep = 24;
  const screenStep = Math.max(4, baseStep * zoom);

  return (
    <div
      className="canvas-grid"
      style={{
        backgroundSize: `${screenStep}px ${screenStep}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    />
  );
}
