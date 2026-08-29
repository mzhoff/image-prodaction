import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImageProductionSystemPrompt } from './system-prompt.ts';

test('prepares one safe UI proposal without a textual confirmation loop', () => {
  const prompt = buildImageProductionSystemPrompt({
    mode: 'product-copilot',
    principal: {
      productId: 'image-production',
      tenantId: 'workspace-1',
      userId: 'user-1',
    },
  });

  assert.match(prompt, /documentName/u);
  assert.match(prompt, /оцени, достаточно ли данных/u);
  assert.match(prompt, /не задавай формальных.*без write-tool/u);
  assert.match(prompt, /«сделай».*«собери».*«добавь».*«измени».*«реализуй».*«примени»/u);
  assert.match(prompt, /сразу разрешают подготовить pipeline_build или pipeline_update proposal/u);
  assert.match(prompt, /read-only proposal.*единственного подтверждения кнопкой в UI/u);
  assert.match(prompt, /не дублируй это подтверждение в чате/u);
  assert.doesNotMatch(prompt, /запроси одно текстовое согласие|Сначала дождись явного согласия/u);
  assert.match(prompt, /максимум один объединённый раунд/u);
  assert.match(prompt, /неработоспособным, небезопасным или принципиально другим/u);
  assert.match(prompt, /обратимых, косметических.*разумные defaults/u);
  assert.match(prompt, /обычный редактируемый pipeline на canvas/u);
  assert.match(prompt, /не называй граф Executable Pipeline.*явно не попросил/u);
  assert.match(prompt, /«отдельный вход».*«вход промпта».*textPrompt, а не pipelineInput/u);
  assert.match(prompt, /ровно одну pipelineInput и одну pipelineOutput/u);
  assert.match(prompt, /structuredOutput.*validated json/u);
  assert.match(prompt, /Field id.*field:<id>.*field key/u);
  assert.match(prompt, /заметки.*отдельную ноду textPrompt/u);
  assert.match(prompt, /Не встраивай изменяемые пользовательские данные в textGeneration\.instruction/u);
  assert.match(prompt, /локально редактируемом графе.*textPrompt.*исполняемого endpoint.*pipelineInput/u);
  assert.match(prompt, /textPrompt\.text -> textGeneration\.text/u);
  assert.match(prompt, /textConcat.*text-0.*text-1.*text-2/u);
  assert.match(prompt, /settings\.variables.*variable-0.*@Alias/u);
  assert.match(prompt, /textPrompt\.text.*потребителю/u);
  assert.match(prompt, /document_graph.*pipeline_update/u);
  assert.match(prompt, /входы слева.*результаты справа/u);
  assert.match(prompt, /не передавай originX\/originY/u);
  assert.match(prompt, /сразу подготовь pipeline_build.*pipeline_update/u);
  assert.match(prompt, /не больше одного tool call/u);
  assert.match(prompt, /compositionBlueprints V1.*canvas width\/height.*нормализованным frame 0\.\.1/u);
  assert.match(prompt, /Не создавай вручную edges к composition\.layer-N.*compiler сам/u);
  assert.match(prompt, /kind=image, role=qr.*source qrCode\.image/u);
  assert.match(prompt, /preserveAspectRatio по умолчанию false/u);
  assert.match(prompt, /linear gradient.*color stops/u);
  assert.match(prompt, /не больше 24 нод\/слоёв/u);
  assert.match(prompt, /generateImage\.image.*compositionBlueprints.*не угадывай layer-N/u);
  assert.match(prompt, /design_element_selection.*выбор не изменяет граф/iu);
  assert.match(prompt, /частью одного ответа.*не говори «подожди».*«дождись выбора»/iu);
  assert.match(prompt, /дождись структурированного выбора пользователя.*selectedElements\.referenceFrame.*CompositionBlueprint\.frame/u);
  assert.match(prompt, /baseImageStrategy=single-image.*textStrategy=embedded/u);
  assert.match(prompt, /самый простой рабочий default.*baseImageStrategy=single-image/u);
  assert.match(prompt, /Плашки, кнопки, рамки, иконки и декор.*общем арте/u);
  assert.match(prompt, /не пытайся вырезать героя.*героя и фон совместно/u);
  assert.match(prompt, /функционального QR-кода.*qrCode.*никогда.*generateImage/u);
  assert.match(prompt, /QR является обычным image-слоем.*semantic role qr/u);
  assert.match(prompt, /целевое действие.*первый фокус.*маршрут чтения.*техническая читаемость/u);
  assert.match(prompt, /QR Code V1 outputFormat всегда png.*не передавай jpeg или svg/u);
  assert.match(prompt, /qrCode\.settings.*только title, content и contentMode.*Не передавай errorCorrectionLevel.*outputFormat/u);
  assert.match(prompt, /QR или QR-код не нужен.*не добавляй qrCode, targetUrl, target-url.*QR-слой/u);
  assert.match(prompt, /target-url.*targetUrl.*field:target-url.*qrCode\.text.*compositionBlueprints.*qrCode\.image/u);
  assert.match(prompt, /pipeline_update.*summary.*edges.*compositionBlueprints.*optional layout/u);
  assert.match(prompt, /Не дублируй.*qrCode\.settings\.content/u);
  assert.match(prompt, /server executor Composition.*будущим этапом/u);
  assert.match(prompt, /пустую importImage без sourceAttachmentIndex/u);
  assert.match(prompt, /Не проси.*подтвердить действие ещё раз/u);
  assert.match(prompt, /recovery исчерпан.*человекочитаемый блокер.*один-два конкретных обхода/u);
  assert.match(prompt, /schema\/JSON\/валидационной ошибки/u);
  assert.match(prompt, /Согласие на сборку.*не является согласием на запуск/u);
  assert.match(prompt, /отдельное прямое указание пользователя/u);
  assert.match(prompt, /Не передавай documentName/u);
});
