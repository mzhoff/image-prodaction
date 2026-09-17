import { productionLayers, type ProductionLayerId } from './production-layers';

export type ExtractAnalysisPresetId = 'composition' | 'graphics' | 'character' | 'location';

const graphicsLayers = [
  { id: 'composition', label: 'Composition', prompt: 'Опиши сетку макета, формат, оси, баланс, масштаб и положение элементов, перекрытия, группировки и ритм. Отдели пространственную раскладку от оформления и содержания надписей.' },
  { id: 'mood', label: 'Mood', prompt: 'Опиши общее настроение графики: спокойствие или напряжение, лёгкость или тяжесть, игривость или строгость. Обоснуй впечатление видимыми приёмами. Это интерпретация визуального тона, а не установленное намерение автора.' },
  { id: 'graphic_style', label: 'Graphic Style', prompt: 'Опиши технику графических элементов: вектор, линейная графика, гравюра, живописная иллюстрация, фото, 3D, коллаж или смешанная техника; характер контура, форм, заливок, детализации и стилизации. Не смешивай с типографикой.' },
  { id: 'typography', label: 'Typography', prompt: 'Опиши стиль типографики: антиква, гротеск, акцидентный или рукописный характер, пропорции, насыщенность, ширина, регистр, трекинг, интерлиньяж, выравнивание, иерархия и взаимодействие букв с графикой. Не угадывай точное название шрифта. Буквальное содержание надписей относится только к Text.' },
  { id: 'whitespace', label: 'Whitespace', prompt: 'Опиши количество и распределение воздуха: свободные поля, интервалы между группами, плотность центра и периферии, паузы, зоны для дополнительного текста. Доли площади оценивай приблизительно и только когда они помогают воспроизвести макет.' },
  { id: 'palette', label: 'Palette', prompt: 'Опиши основные, дополнительные и акцентные цвета, их роли и приблизительные пропорции, контраст, насыщенность, температуру и сочетания. Не выдавай приблизительную оценку за измеренные HEX или фирменную палитру.' },
  { id: 'background_style', label: 'Background Style', prompt: 'Опиши только оформление фона: однотонный, градиентный, бумажный, текстурный, узорный или фотографический; глубину, зерно, виньетку и контраст с передним планом. Не пересказывай главную иллюстрацию.' },
  { id: 'overall_style', label: 'Overall Style', prompt: 'Опиши общий художественный язык макета и сочетание техник. Если видны устойчивые признаки направления (например, швейцарская типографика, ар-деко, ботаническая гравюра, брутализм), назови его как визуальное сходство и перечисли признаки. Если точного названия нет, дай описательное сочетание, не выдумывай стиль, автора или бренд.' },
  { id: 'hierarchy', label: 'Visual Hierarchy', prompt: 'Опиши последовательность внимания и чтения: первый акцент, второй уровень и детали, способы выделения через масштаб, контраст, положение и повтор. Сформулируй воспроизводимую иерархию без копирования текста.' },
  { id: 'decorative_elements', label: 'Decorative Elements', prompt: 'Опиши орнаменты, растительные или геометрические мотивы, рамки, линии, иконки и их ритм. Укажи, как декор соединяется с типографикой и поддерживает акценты.' },
  { id: 'texture', label: 'Texture', prompt: 'Опиши фактуры и эффекты исполнения: бумага, печатное зерно, растр, потёртости, тиснение, шум, неровности краёв и смешение материалов. Отделяй задуманный эффект от артефактов сжатия; сомнения отмечай.' },
  { id: 'text', label: 'Text', prompt: 'Выпиши читаемые надписи точно, сохраняя язык, регистр, переносы и порядок чтения; укажи положение блоков. Не переводи, не исправляй и не додумывай текст; нечитаемые места обозначай словами «неразборчиво». Оформление шрифта относится к Typography.' },
] as const;

const characterLayers = [
  { id: 'appearance', label: 'Appearance', prompt: 'Опиши видимый облик персонажа: человек, животное или вымышленное существо, силуэт, общие пропорции, тон кожи или покрова, стилизацию. Не устанавливай личность, происхождение, этничность, здоровье или другие скрытые свойства.' },
  { id: 'age', label: 'Apparent Age', prompt: 'Если уместно, опиши только приблизительный визуальный возраст широким диапазоном либо категорией, с явной оговоркой о приблизительности. Не утверждай точный возраст; для стилизованного или скрытого лица укажи, что оценка ненадёжна.' },
  { id: 'facial_features', label: 'Facial Features', prompt: 'Опиши форму лица, подбородка, скул, носа, губ, бровей, видимый цвет и форму глаз, видимые особенности. Не достраивай скрытые части, не идентифицируй реального человека.' },
  { id: 'physique', label: 'Physique', prompt: 'Опиши видимое телосложение, силуэт, пропорции плеч, корпуса и конечностей, осанку. Не выводи точный рост или вес без масштаба и не делай медицинских выводов.' },
  { id: 'hair', label: 'Hair', prompt: 'Опиши причёску, длину, форму стрижки, пробор, цвет, текстуру, укладку и видимую растительность на лице. Укажи детали, важные для повторяемости персонажа.' },
  { id: 'clothing', label: 'Clothing', prompt: 'Опиши предметы одежды по порядку, крой, посадку, слои, цвета, материалы, узоры, обувь и сочетание элементов. Не достраивай то, что вне кадра, и не угадывай бренд или социальный статус.' },
  { id: 'accessories', label: 'Accessories', prompt: 'Опиши видимые украшения, очки, головные уборы, сумки и предметы при персонаже; материал, форму, цвет и положение. Не приписывай им религиозную принадлежность или убеждения владельца.' },
  { id: 'expression', label: 'Expression', prompt: 'Опиши видимую мимику, положение рта и бровей, направление взгляда. Эмоциональное впечатление обозначай как впечатление от выражения, а не достоверное внутреннее состояние.' },
  { id: 'pose', label: 'Pose', prompt: 'Опиши позу, поворот головы и корпуса, положение рук и ног, жесты, движение или статичность, опору и взаимодействие с предметами. Сохрани пространственную точность.' },
  { id: 'persona', label: 'Persona', prompt: 'Опиши только художественный образ и впечатление, которое создают видимые поза, костюм и мимика: например, собранный, игривый или драматичный образ. Явно назови это интерпретацией образа. Не делай выводов о реальном характере, надёжности, интеллекте, профессии, убеждениях или намерениях человека.' },
  { id: 'distinctive_features', label: 'Distinctive Features', prompt: 'Выдели видимые признаки, которые помогают сохранить персонажа узнаваемым между генерациями: сочетание силуэта, лица, причёски, костюма и деталей. Не придумывай скрытые признаки, биографию или имя.' },
  { id: 'style', label: 'Style', prompt: 'Опиши способ изображения персонажа: фотографический, рисованный, анимационный, скульптурный или 3D; реализм, обработку форм и деталей, характер линий и материалов. Отдели технику от внешности.' },
] as const;

const locationLayers = [
  { id: 'space_type', label: 'Space Type', prompt: 'Опиши видимый тип места: интерьер или экстерьер, назначение пространства по наблюдаемым признакам, открытость, масштаб. Не угадывай точный адрес, город или название объекта.' },
  { id: 'architecture', label: 'Architecture', prompt: 'Опиши архитектурный язык, геометрию, объёмы, проёмы, окна, двери, потолки, фасады и конструктивные детали. Название направления давай как обоснованное визуальное сходство, без выдуманной датировки.' },
  { id: 'spatial_layout', label: 'Spatial Layout', prompt: 'Опиши планировку видимой части пространства, проходы, границы зон, передний, средний и дальний план, оси, глубину и взаимное расположение объектов. Не достраивай помещения вне кадра.' },
  { id: 'materials', label: 'Materials', prompt: 'Опиши видимые материалы пола, стен, потолка, фасадов и поверхностей, отделку, фактуру, состояние, отражения и следы использования. При неопределённости используй «похоже на», не выдавай имитацию за доказанный материал.' },
  { id: 'furnishings', label: 'Furnishings', prompt: 'Опиши мебель, оборудование, светильники и стационарные предметы, их форму, расположение, масштаб и характер. В экстерьере учитывай уличную мебель и инфраструктуру; если их нет, так и укажи.' },
  { id: 'vegetation', label: 'Vegetation', prompt: 'Опиши растительность и природные элементы: формы, густоту, ярусность, размещение, видимое сезонное состояние. Не угадывай точный вид растения, если признаков недостаточно.' },
  { id: 'surroundings', label: 'Surroundings', prompt: 'Опиши видимое окружение места: соседнюю застройку, рельеф, воду, горизонт, виды из окон и связь помещения с улицей. Не подменяй наблюдение предположениями о географии.' },
  { id: 'light', label: 'Light', prompt: 'Опиши естественный и искусственный свет, видимые источники, направление, мягкость, тени и локальные акценты. Время суток оценивай только по видимым признакам и с оговоркой.' },
  { id: 'atmosphere', label: 'Atmosphere', prompt: 'Опиши видимую погоду, дымку, чистоту или запылённость, ощущение обжитости и эмоциональный тон места. Разделяй наблюдаемые условия и субъективную атмосферу; не придумывай звуки и запахи.' },
  { id: 'color', label: 'Color / Grade', prompt: 'Опиши палитру пространства, цветовые роли крупных поверхностей и акцентов, насыщенность, температуру и обработку кадра. Отдели цвета материалов от оттенка освещения.' },
  { id: 'camera', label: 'Camera', prompt: 'Опиши точку обзора, высоту, направление взгляда, перспективу, крупность, глубину резкости и геометрические искажения. Не утверждай точные параметры объектива без данных.' },
  { id: 'style', label: 'Style', prompt: 'Опиши общий визуальный язык изображения локации: фото, архитектурная визуализация, concept art, иллюстрация; реализм, детализацию, обработку поверхностей и настроение исполнения. Архитектурный стиль отдельно относится к Architecture.' },
] as const;

export type ExtractLayerId = ProductionLayerId | typeof graphicsLayers[number]['id'] | typeof characterLayers[number]['id'] | typeof locationLayers[number]['id'];
export interface ExtractLayerDefinition { id: ExtractLayerId; label: string; prompt: string }
export interface ExtractAnalysisPreset {
  id: ExtractAnalysisPresetId;
  label: string;
  description: string;
  layers: readonly ExtractLayerDefinition[];
  systemPrompt: string;
}

export const extractAnalysisPresets: readonly ExtractAnalysisPreset[] = [
  { id: 'composition', label: 'Composition', description: 'Общий разбор кадра: субъекты, действие, композиция, камера и визуальный язык.', layers: productionLayers, systemPrompt: 'Analyze the reference as a complete visual production framework, while describing only the requested layers.' },
  { id: 'graphics', label: 'Graphics', description: 'Графика и макеты: типографика, воздух, палитра, иерархия и оформление.', layers: graphicsLayers, systemPrompt: 'You are a graphic designer and typography art director. Analyze the reference as a graphic layout. Describe only the requested graphic layers using their exact bracket headings. Separate typography styling from literal text transcription. Name visual movements only when supported by visible features; do not invent font names or authors.' },
  { id: 'character', label: 'Character', description: 'Облик персонажа: лицо, телосложение, причёска, одежда, поза и образ.', layers: characterLayers, systemPrompt: 'You are a character design art director. Extract only the requested visible character layers for consistent character generation. Apparent age is approximate. Describe persona and emotion as artistic impressions grounded in visible expression, pose and costume, never as facts about a real person. Do not identify people or infer sensitive traits, health, beliefs, intelligence, trustworthiness or hidden biography.' },
  { id: 'location', label: 'Location', description: 'Интерьер и экстерьер: архитектура, планировка, материалы, свет и окружение.', layers: locationLayers, systemPrompt: 'You are an environment and architectural visualization art director. Extract only the requested visible location layers for reusable interior or exterior generation. Describe spatial relations and materials precisely. Do not invent hidden rooms, exact addresses, building names or geographic facts. Distinguish observed conditions from atmospheric interpretation.' },
];

export const extractLayerDefinitions = Array.from(new Map(extractAnalysisPresets.flatMap((preset) => preset.layers).map((layer) => [layer.id, layer])).values());

export function normalizeExtractAnalysisPreset(input: unknown): ExtractAnalysisPresetId {
  return extractAnalysisPresets.find((preset) => preset.id === input)?.id ?? 'composition';
}

export function getExtractAnalysisPreset(input?: unknown): ExtractAnalysisPreset {
  return extractAnalysisPresets.find((preset) => preset.id === input) ?? extractAnalysisPresets[0];
}

export function getExtractLayers(input?: unknown) {
  return getExtractAnalysisPreset(input).layers;
}
