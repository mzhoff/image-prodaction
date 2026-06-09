import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical';
import { ParagraphNode, TextNode } from 'lexical';

const editor = createEditor({
  namespace: 'test',
  onError(error) {
    throw error;
  },
  nodes: [ParagraphNode, TextNode],
});

editor.update(() => {
  const root = $getRoot();
  const p1 = $createParagraphNode();
  p1.append($createTextNode('line1'));
  const p2 = $createParagraphNode();
  const p3 = $createParagraphNode();
  p3.append($createTextNode('line2'));
  root.append(p1, p2, p3);
});

const state = editor.getEditorState();
const json = state.toJSON();
console.log('children length', (json as any).root?.children?.length);
console.log('textContent', editor.getEditorState().read(() => $getRoot().getTextContent()));
console.log('root children', JSON.stringify((json as any).root?.children));
