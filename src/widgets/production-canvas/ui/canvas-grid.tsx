export function CanvasGrid({
  pan,
  zoom,
}: {
  pan: { x: number; y: number };
  zoom: number;
}) {
  const baseWorldStep = 24;
  const minScreenStep = 18;
  const maxScreenStep = 42;
  const minWorldStep = 6;
  let worldStep = baseWorldStep;
  let screenStep = worldStep * zoom;

  while (screenStep < minScreenStep) {
    worldStep *= 2;
    screenStep = worldStep * zoom;
  }

  while (screenStep > maxScreenStep && worldStep > minWorldStep) {
    worldStep /= 2;
    screenStep = worldStep * zoom;
  }

  const backgroundOffsetX = pan.x % screenStep;
  const backgroundOffsetY = pan.y % screenStep;

  return (
    <div
      className="canvas-grid"
      style={{
        backgroundSize: `${screenStep}px ${screenStep}px`,
        backgroundPosition: `${backgroundOffsetX}px ${backgroundOffsetY}px`,
      }}
    />
  );
}
