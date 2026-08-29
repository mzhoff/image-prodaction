import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESIGN_ELEMENT_KINDS,
  DESIGN_ELEMENT_ROLES,
  DESIGN_ELEMENT_SELECTION_TOOL,
  designElementSelectionTool,
} from './design-element-selection';

test('publishes the stable read-tool name and image/text-only implementation kinds', () => {
  assert.equal(DESIGN_ELEMENT_SELECTION_TOOL, 'design_element_selection');
  assert.equal(designElementSelectionTool.riskLevel, 'read');
  assert.deepEqual(DESIGN_ELEMENT_KINDS, ['text', 'image']);
  assert.ok(DESIGN_ELEMENT_ROLES.includes('qr'));
});

test('tool instructs the model to ask at most one intent question before interaction', () => {
  assert.match(designElementSelectionTool.description, /ask one simple human question first/u);
  assert.match(designElementSelectionTool.description, /normalized referenceFrame/u);
  assert.match(designElementSelectionTool.description, /one combined generated image/u);
  assert.match(designElementSelectionTool.description, /functional QR as a separate image/u);
});

test('tool schema accepts normalized reference bounds and forbids a text QR candidate', () => {
  const inputSchema = designElementSelectionTool.inputSchema as {
    properties: {
      elements: {
        items: {
          properties: {
            kind: { description: string };
            referenceFrame: { additionalProperties: boolean; required: string[] };
          };
        };
      };
    };
  };
  const elements = inputSchema.properties.elements;
  assert.equal(elements.items.properties.referenceFrame.additionalProperties, false);
  assert.deepEqual(elements.items.properties.referenceFrame.required, ['x', 'y', 'width', 'height']);
  assert.match(elements.items.properties.kind.description, /image when role is qr/u);
});
