# Video direction illustrations

Generated with the built-in `image_gen.imagegen` tool on 21 September 2026, one call per asset. No external provider keys or CLI were used. Application copies are 216 × 216 WebP for a 72px display (up to 3× pixel density). Original PNGs are preserved in the local optimization archive; see [optimization notes](ui-illustration-optimization.md).

| Setting | Asset | Visual |
| --- | --- | --- |
| Story | `public/home/video-direction/story.webp` | Open book, simple character and sequential panels |
| Scene | `public/home/video-direction/scene.webp` | Landscape stage, sun and lamp |
| Shot | `public/home/video-direction/shot.webp` | Camera and framing corners |

The illustrations use an off-white background and coordinated cyan, peach and lavender matte paper shapes. Visual inspection confirmed clear silhouettes, no lettering, no glass and no glossy materials. They are designed to be displayed at about 72 px; keep `object-fit: contain` to preserve the margins.

## Exact prompts

Common prefix for every call:

```text
Use case: stylized-concept. Asset type: square raster illustration for a small 72px UI settings tile in a creative video app. Make one illustration only, square 1:1. Use simple friendly matte layered papercut shapes, crisp clean edges, restrained shallow soft shadow, generous warm off-white (#F7F5F1) background. Coordinated soft cyan, muted peach and dusty lavender palette with charcoal used sparingly for definition. Composition centered with a large bold recognizable silhouette occupying 72% of canvas; readable when reduced to 72px. No text, letters, symbols that resemble labels, watermarks, frame border, glass, transparency effects, glossy plastic or shiny 3D. Keep the design minimal, casual and understated.
```

### story

```text
Subject: an open storybook with thick cream pages and muted lavender cover; one small abstract peach human character silhouette on the left page and two simple cyan sequence panels on the right page. Communicate a complete story, not a camera or scenic landscape. No writing, no printed lines.
```

### scene

```text
Subject: a tiny scenic stage/set, with a rounded cyan landscape backdrop, one simple peach sun, one lavender hill and a minimal little stage lamp pointing toward the setting. Communicate a scene or location. No people, no book, no camera, no text.
```

### shot

```text
Subject: a compact friendly movie camera or camera-viewfinder illustration, charcoal-lavender simple camera body with a single large cyan circular lens, a small peach viewfinder detail. Subtle four framing corners may suggest a shot. Communicate one camera shot. No film reels, no book, no landscape, no text.
```
