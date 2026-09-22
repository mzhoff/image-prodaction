import type { VideoCinematicOption } from './video-cinematic-catalog';

export const VIDEO_TIME_OF_DAY_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Время по описанию сцены', instruction: '' },
  { id: 'dawn', label: 'Рассвет', description: 'Первый свет утра', instruction: 'Set the scene at dawn, in the first light of morning.' },
  { id: 'day', label: 'День', description: 'Дневное время', instruction: 'Set the scene during daytime.' },
  { id: 'goldenHour', label: 'Золотой час', description: 'Низкое солнце и тёплый свет', instruction: 'Set the scene during golden hour with low-angle sunlight.' },
  { id: 'dusk', label: 'Сумерки', description: 'Свет после заката', instruction: 'Set the scene at dusk, just after sunset.' },
  { id: 'night', label: 'Ночь', description: 'Ночное время', instruction: 'Set the scene at night.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_LIGHTING_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Освещение по сцене', instruction: '' },
  { id: 'natural', label: 'Естественный свет', description: 'Свет окружающей среды', instruction: 'Use a natural-light aesthetic motivated by the scene environment.' },
  { id: 'soft', label: 'Мягкий свет', description: 'Плавные переходы света и тени', instruction: 'Use soft, diffused lighting with gentle shadow transitions.' },
  { id: 'hard', label: 'Жёсткий свет', description: 'Чёткие светотеневые границы', instruction: 'Use hard directional lighting with defined shadow edges.' },
  { id: 'backlit', label: 'Контровой свет', description: 'Источник позади героя', instruction: 'Light the subject primarily from behind to create a rim or silhouette.' },
  { id: 'lowKey', label: 'Низкий ключ · Low key', description: 'Преобладают тени и локальные акценты', instruction: 'Use low-key lighting with substantial shadows and selective illuminated details.' },
  { id: 'highKey', label: 'Высокий ключ · High key', description: 'Светлые тона и небольшой контраст', instruction: 'Use high-key lighting with a bright tonal range and low shadow contrast.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_TEMPERATURE_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Температура по источникам', instruction: '' },
  { id: 'warm', label: 'Тёплый', description: 'Тёплый характер света', instruction: 'Give the dominant light a warm visual color temperature.' },
  { id: 'neutral', label: 'Нейтральный', description: 'Без выраженного тёплого или холодного оттенка', instruction: 'Use visually neutral dominant lighting without a strong warm or cool cast.' },
  { id: 'cool', label: 'Холодный', description: 'Холодный характер света', instruction: 'Give the dominant light a cool visual color temperature.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_FRAMING_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Крупность по описанию кадра', instruction: '' },
  { id: 'extremeWide', label: 'Дальний · Extreme wide', description: 'Окружение главное, герой очень мал', instruction: 'Use an extreme wide shot emphasizing the environment; the subject occupies little of the frame.' },
  { id: 'wide', label: 'Общий · Wide', description: 'Герой и заметная часть окружения', instruction: 'Use a wide shot showing the subject in its surrounding environment.' },
  { id: 'full', label: 'В полный рост · Full', description: 'Герой целиком в кадре', instruction: 'Frame the full subject from head to feet without cutting off extremities.' },
  { id: 'mediumWide', label: 'Средний общий · Medium wide', description: 'Примерно от колен и выше', instruction: 'Use a medium wide shot, approximately knees-up for a standing human subject.' },
  { id: 'medium', label: 'Средний · Medium', description: 'Примерно по пояс', instruction: 'Use a medium shot, approximately waist-up for a human subject.' },
  { id: 'mediumCloseUp', label: 'Погрудный · Medium close-up', description: 'Примерно от груди и выше', instruction: 'Use a medium close-up, approximately chest-up for a human subject.' },
  { id: 'closeUp', label: 'Крупный · Close-up', description: 'Лицо или важная часть объекта', instruction: 'Use a close-up emphasizing the face or a meaningful part of the subject.' },
  { id: 'extremeCloseUp', label: 'Деталь · Extreme close-up', description: 'Небольшая выразительная деталь', instruction: 'Use an extreme close-up isolating a small expressive detail.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_ANGLE_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Ракурс по описанию кадра', instruction: '' },
  { id: 'eyeLevel', label: 'На уровне глаз', description: 'Нейтральная высота камеры', instruction: 'Place the camera at the subject’s eye level.' },
  { id: 'high', label: 'Сверху · High angle', description: 'Камера выше героя и смотрит вниз', instruction: 'Use a high-angle view looking down toward the subject.' },
  { id: 'low', label: 'Снизу · Low angle', description: 'Камера ниже героя и смотрит вверх', instruction: 'Use a low-angle view looking up toward the subject.' },
  { id: 'birdsEye', label: 'Вертикально сверху · Bird’s-eye', description: 'Вид сверху вниз', instruction: 'Use a top-down bird’s-eye viewpoint.' },
  { id: 'wormsEye', label: 'От земли · Worm’s-eye', description: 'Очень низкая точка съёмки', instruction: 'Use a ground-level worm’s-eye viewpoint looking sharply upward.' },
  { id: 'dutch', label: 'Наклонный горизонт · Dutch', description: 'Горизонт намеренно наклонён', instruction: 'Use a Dutch angle with a deliberately canted horizon.' },
] as const satisfies readonly VideoCinematicOption[];

export const VIDEO_FOCUS_OPTIONS = [
  { id: 'auto', label: 'Авто', description: 'Фокус по описанию кадра', instruction: '' },
  { id: 'deep', label: 'Глубокая резкость · Deep focus', description: 'Несколько планов читаются резко', instruction: 'Use a deep-focus aesthetic that keeps foreground and background legible.' },
  { id: 'shallow', label: 'Малая глубина резкости', description: 'Герой резкий, фон размыт', instruction: 'Use shallow depth of field to keep the main subject sharp against a softly defocused background.' },
  { id: 'rack', label: 'Перевод фокуса · Rack focus', description: 'Резкость переходит между планами', instruction: 'Perform a deliberate rack-focus transition between meaningful subjects or depth planes during the shot.' },
] as const satisfies readonly VideoCinematicOption[];
