# Generation Waiting Experience

This is a client-only presentation layer for a durable generation job. It never
changes a provider request, job lifecycle, cost, retry, or result.

## UI contract

`GenerationWaitingExperience` accepts:

```ts
{
  kind: 'image' | 'video';
  phase: 'submitting' | 'queued' | 'running' | 'saving';
  seed?: string;             // normally the durable generation job ID
  previousImageUrl?: string; // optional, only for a prior image result
}
```

The seed chooses a deterministic scene, so a React rerender cannot make an
active job jump from one scene to another. The scene begins after 650 ms. The
existing shimmer remains the fallback while the scene loads or when its player
fails.

The stage copy reflects only known job facts. Do not present a percentage as
provider progress until an adapter exposes a comparable measured progress value.
An elapsed-time estimate may be introduced later only from persisted per-model
P50/P90 measurements and must say that it is an estimate.

## Motion asset contract

Lottie exports live under:

```text
public/animations/generation-waiting/v1/<visual-id>.json
```

The registry is `src/features/generation-waiting/model/waiting-visuals.ts`.
Every production replacement must retain the visual ID or add a new version,
and record the editable Jitter file in `source.jitterFileUrl`. Jitter is the
editable master; Lottie JSON is a compiled runtime artifact and is not a source
for future editing.

Use Lottie SVG-safe primitives only: vector shapes, solid fills/strokes,
opacity, position, scale, rotation, and ordinary easing. Do not use video,
external image assets, expressions, blend modes, or AI shader effects. Test the
export in this product's `lottie-web` SVG renderer before replacing a scene.

Initial catalog:

| Media | IDs | Loop target |
| --- | --- | --- |
| Image | `pixel-snake-v1`, `pixel-orbit-v1`, `pixel-puzzle-v1` | 4–6 s |
| Video | `film-strip-v1`, `signal-radar-v1`, `frame-parade-v1` | 11–15 s |

Video generation should pass `kind: 'video'` into the same component when its
node exists; it must not duplicate an animation player or job-stage mapping.

## Accessibility and performance

- Honour `prefers-reduced-motion`: show the status and static fallback only.
- Lazy-load the Lottie player after the short delay.
- Tile reassembly is an image-only interpretation of the previous result, not
  actual provider rendering. Pause it when the tab or plate is not visible.
- Never block canvas navigation, retry/recovery, result delivery, or errors.
