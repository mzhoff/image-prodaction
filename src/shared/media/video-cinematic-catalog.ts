/** Artistic prompt directions, not physical camera hardware or provider API flags. */
export interface VideoCinematicOption { id: string; label: string; description: string; instruction: string }

export const VIDEO_OPTICS_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Оптика по описанию сцены', instruction: '' },
  { id: 'wide', label: 'Широкоугольная', description: 'Больше окружения, выразительная глубина', instruction: 'Use a wide-angle lens aesthetic: broad field of view with pronounced foreground depth.' },
  { id: 'normal', label: 'Нормальная', description: 'Естественная перспектива без сильного искажения', instruction: 'Use a normal-lens aesthetic with a natural field of view and restrained distortion.' },
  { id: 'tele', label: 'Телеобъектив', description: 'Узкий угол и визуальное сближение планов', instruction: 'Use a telephoto-lens aesthetic: narrow field of view and compressed-looking foreground/background spacing.' },
  { id: 'fisheye', label: 'Рыбий глаз · Fisheye', description: 'Очень широкий угол с заметным искривлением линий', instruction: 'Use a fisheye-lens aesthetic with strong curvilinear distortion across an ultra-wide field of view.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_LOOK_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Стиль по описанию сцены', instruction: '' },
  { id: 'modern', label: 'Современный', description: 'Чистый цифровой образ', instruction: 'Use a clean contemporary digital-cinema aesthetic with clear detail and controlled highlights.' },
  { id: 'film70s', label: 'Плёнка 70-х', description: 'Тёплая палитра, мягкие света, плёночная фактура', instruction: 'Use an artistic 1970s film-inspired look: warm muted color, gentle highlight bloom and organic analog texture.' },
  { id: 'film80s', label: 'Плёнка 80-х', description: 'Выразительный цвет и киношный плёночный образ', instruction: 'Use an artistic 1980s cinema-film-inspired look: expressive color contrast, rich shadows and subtle highlight bloom; not videotape.' },
  { id: 'vhs80s', label: 'VHS 80-х', description: 'Мягкая видеокартинка, цветовые следы, аналоговый шум', instruction: 'Use an artistic 1980s VHS-inspired video look: soft detail, restrained color bleed and analog tape noise; not cinema-film grain.' },
  { id: 'minidv2000s', label: 'MiniDV 2000-х', description: 'Бытовая цифровая камера начала 2000-х', instruction: 'Use an artistic early-2000s MiniDV camcorder-inspired look with crisp electronic edges, limited highlight latitude and subtle digital-video texture.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_GRAIN_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Фактура следует выбранному образу', instruction: '' },
  { id: 'none', label: 'Без зерна', description: 'Чистая поверхность изображения', instruction: 'Do not add visible film grain; preserve other selected stylistic characteristics.' },
  { id: 'fine', label: 'Мелкое зерно', description: 'Деликатная фактура', instruction: 'Apply fine, restrained film-grain texture without obscuring important detail.' },
  { id: 'coarse', label: 'Крупное зерно', description: 'Заметная выразительная фактура', instruction: 'Apply visibly coarse film-grain texture while keeping the subject readable.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_MOVEMENT_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Движение по описанию сцены', instruction: '' },
  { id: 'static', label: 'Статика · Static', description: 'Камера неподвижна, движение внутри кадра', instruction: 'Keep the camera locked off; only scene subjects may move. No camera translation, pan, tilt or zoom.' },
  { id: 'panLeft', label: 'Панорама влево · Pan', description: 'Поворот камеры влево из одной точки', instruction: 'Pan left: rotate the camera horizontally to the left from a fixed position; do not truck sideways.' },
  { id: 'panRight', label: 'Панорама вправо · Pan', description: 'Поворот камеры вправо из одной точки', instruction: 'Pan right: rotate the camera horizontally to the right from a fixed position; do not truck sideways.' },
  { id: 'tiltUp', label: 'Наклон вверх · Tilt', description: 'Поворот камеры вверх из одной точки', instruction: 'Tilt up: rotate the camera upward from a fixed position; do not lift the camera body.' },
  { id: 'tiltDown', label: 'Наклон вниз · Tilt', description: 'Поворот камеры вниз из одной точки', instruction: 'Tilt down: rotate the camera downward from a fixed position; do not lower the camera body.' },
  { id: 'dollyIn', label: 'Наезд · Dolly in', description: 'Камера физически приближается к объекту', instruction: 'Dolly in: move the camera toward the subject with natural parallax; do not substitute an optical zoom.' },
  { id: 'dollyOut', label: 'Отъезд · Dolly out', description: 'Камера физически удаляется от объекта', instruction: 'Dolly out: move the camera away from the subject with natural parallax; do not substitute an optical zoom.' },
  { id: 'truckLeft', label: 'Сдвиг влево · Truck', description: 'Боковое перемещение камеры влево', instruction: 'Truck left: translate the camera laterally to the left, keeping its viewing direction stable.' },
  { id: 'truckRight', label: 'Сдвиг вправо · Truck', description: 'Боковое перемещение камеры вправо', instruction: 'Truck right: translate the camera laterally to the right, keeping its viewing direction stable.' },
  { id: 'pedestalUp', label: 'Подъём · Pedestal', description: 'Камера поднимается вертикально', instruction: 'Pedestal up: raise the whole camera vertically while maintaining its viewing direction; do not merely tilt.' },
  { id: 'pedestalDown', label: 'Спуск · Pedestal', description: 'Камера опускается вертикально', instruction: 'Pedestal down: lower the whole camera vertically while maintaining its viewing direction; do not merely tilt.' },
  { id: 'arcLeft', label: 'Дуга влево · Arc', description: 'Часть окружности вокруг объекта влево', instruction: 'Arc left around the subject on a partial circular path, keeping the subject framed.' },
  { id: 'arcRight', label: 'Дуга вправо · Arc', description: 'Часть окружности вокруг объекта вправо', instruction: 'Arc right around the subject on a partial circular path, keeping the subject framed.' },
  { id: 'orbit', label: 'Облёт · Orbit', description: 'Круговое движение вокруг объекта', instruction: 'Orbit around the subject on a continuous circular camera path, keeping it framed; the camera moves rather than the subject spinning.' },
  { id: 'zoomIn', label: 'Приближение · Zoom in', description: 'Увеличение без перемещения камеры', instruction: 'Zoom in optically from a fixed camera position: increase magnification without translational parallax.' },
  { id: 'zoomOut', label: 'Отдаление · Zoom out', description: 'Уменьшение без перемещения камеры', instruction: 'Zoom out optically from a fixed camera position: decrease magnification without translational parallax.' },
  { id: 'dollyZoom', label: 'Эффект Вертиго · Dolly zoom', description: 'Движение и встречный зум меняют вид фона', instruction: 'Perform a dolly zoom: move the camera toward the subject while zooming out to keep its size nearly constant as background perspective changes.' },
  { id: 'craneUp', label: 'Кран вверх · Crane up', description: 'Плавный подъём к высокой точке съёмки', instruction: 'Perform a smooth crane-up move, rising to a higher camera position and revealing the wider scene.' },
  { id: 'flythrough', label: 'Пролёт · Fly-through', description: 'Камера проходит через пространство сцены', instruction: 'Perform a continuous fly-through through the scene, maintaining a clear spatial path and natural parallax.' },
  { id: 'roll', label: 'Вращение · Roll', description: 'Вращение вокруг оптической оси', instruction: 'Roll the camera around its optical axis, rotating the horizon within the frame; do not orbit around the subject.' },
  { id: 'handheld', label: 'С рук · Handheld', description: 'Небольшие живые движения оператора', instruction: 'Use a controlled handheld-camera aesthetic with subtle organic operator motion, avoiding excessive jitter.' },
  { id: 'tracking', label: 'Следование · Tracking', description: 'Камера сопровождает движение героя', instruction: 'Track the moving subject with the camera, maintaining a consistent readable framing as both travel through the scene.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_SPEED_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Темп по сцене', instruction: '' },
  { id: 'slow', label: 'Медленно', description: 'Медленное движение камеры', instruction: 'Use a slow camera-movement pace; do not change subject action speed or the requested clip duration.' },
  { id: 'normal', label: 'Обычно', description: 'Умеренное движение камеры', instruction: 'Use a moderate, natural camera-movement pace; retain the requested clip duration.' },
  { id: 'fast', label: 'Быстро', description: 'Быстрое движение камеры', instruction: 'Use a fast but readable camera-movement pace; do not shorten the requested clip duration.' },
] as const satisfies readonly VideoCinematicOption[];
