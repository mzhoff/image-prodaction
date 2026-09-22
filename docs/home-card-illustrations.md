# Иллюстрации карточек Home

Четыре изображения сгенерированы встроенным `image_gen` 21 сентября 2026.
Референс материала и света: `public/stories/ai-access-portal.webp`.
Новый набор использует почти белый фон и контрастные цветные грани стекла;
фон и передний объект разделены светом, резкостью и мягкой контактной тенью.

Карточки используют локальные WebP 512×512, полученные напрямую из оригинальных PNG.
Иллюстрации заполняют рамку 1.15:1 без белых боковых полос: `object-fit: cover`
обрезает только небольшой запас фона сверху и снизу, сохраняя предметы целиком.
На мобильном используется та же пропорция вместо прежней 2:1. Цветокоррекции CSS
и затемнения в тёмной теме нет. Подписи остаются текстом интерфейса.

## Файлы

- `public/home/create-image-glass.webp` — оригинал: `/Users/m.pyzhov/.codex/generated_images/01a0c125-b11c-7420-83fc-f8fc6b67a4ec/exec-f5ccabbd-0196-4d2c-97fb-18f726451d26.png`
- `public/home/create-flow-glass.webp` — оригинал: `/Users/m.pyzhov/.codex/generated_images/01a0c125-b11c-7420-83fc-f8fc6b67a4ec/exec-08ef6d5b-9cdc-4002-b948-4f6ca49354a1.png`
- `public/home/create-storyboard-glass.webp` — оригинал: `/Users/m.pyzhov/.codex/generated_images/01a0c125-b11c-7420-83fc-f8fc6b67a4ec/exec-628faec9-2ae7-41fd-9eae-74f2619e19ac.png`
- `public/home/create-timeline-glass.webp` — оригинал: `/Users/m.pyzhov/.codex/generated_images/01a0c125-b11c-7420-83fc-f8fc6b67a4ec/exec-cc99203e-b4da-48c0-b6aa-092e227919e0.png`

## Промпты

К каждому промпту добавлялась общая часть:

```text
Use case: stylized-concept. Asset type: one square 1024x1024 illustration for a small Home dashboard card in Reverie Production.
Generate a NEW independent illustration. The supplied image is a MATERIAL AND LIGHTING STYLE REFERENCE ONLY: elegant optical glass, caustics, sophisticated premium 3D product rendering. Do not reproduce its arch composition or gray background.
Art direction for a coherent four-asset family: seamless nearly pure white studio cyclorama, very pale warm-white floor, background receding into clean white atmospheric depth. Background must stay almost white, with no large gray, beige or tinted gradient. A single clearly readable central sculptural pictogram, occupying about 65–70% of width and height, fully inside frame with generous white margins. Three-quarter view, gently elevated camera, product standing or hovering just above the floor. Thick polished clear and colored optical glass, strong saturated colored internal volume and distinctly darker refractive edges so the silhouette reads at 160 pixels. Crisp foreground, gentle ambient shadow underneath, restrained colorful caustic pools on the floor, soft directional sunlight from upper left, controlled highlights, subtle distant blur. Airy expensive minimalism. Object must be far more contrasty and saturated than the white backdrop. No tiny details, no text, no letters, no logo, no watermark, no border, no UI mockup, no collage. Not a faint white transparent silhouette, not hazy foreground, not opaque plastic, not neon sci-fi.
Subject:
```

### image

```text
An iconic small freestanding landscape picture made of thick sapphire-blue glass: a single rounded square picture tile/frame, with two simple beveled blue glass mountain shapes and one small luminous golden sun inset into the picture. Recognizable image-creation metaphor, no realistic photograph inside. Front face tilted slightly to the right; bold cobalt-blue rim and clearer center. Simple and sculptural.
```

### flow

```text
A minimal connected workflow sculpture: three generously rounded glass square nodes arranged in a gentle stepped branching path, linked by two thick curved clear-violet glass tubes. Rich amethyst-purple nodes with strong purple refractive edges, clear central interiors. One dominant node and two smaller nodes, all three form one compact balanced readable silhouette. Recognizable node-editor/flow metaphor. No arrows, no many wires.
```

### storyboard

```text
A compact fan of three thick amber-gold glass storyboard panels, standing upright in slight perspective and staggered behind one another. Front panel largest, with one very simple amber landscape relief inside; back two panels mostly clear with honey-colored edges. Exactly three readable rectangular frames. Warm golden amber, subtly darker caramel edges, crystal-clear material. Recognizable sequence of story frames, no text or ruled writing.
```

### timeline

```text
A compact glass video-editing timeline sculpture: three thick rounded rectangular emerald and turquoise glass clip bars arranged on two horizontal tracks at different offsets, with one thin upright clear glass playhead and a small emerald triangular cap. A subtle clear glass base makes one unified object. Readable layered timeline silhouette, rich teal-green refraction, darker emerald edges; no numbers, no small tick marks, no text.
```


Размеры и результаты сжатия всей серии: [оптимизация иллюстраций](ui-illustration-optimization.md).
