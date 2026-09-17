# Extract: presets and layers

Extract has two separate choices. **Preset** selects the analysis framework;
**Layers** selects which descriptions are included. The model is configured below
them. Analysis still requires an explicit Analyze action and uses the existing
provider authorization, usage accounting and durable short-operation flow.

| Preset | Purpose and layers |
| --- | --- |
| Composition | The existing frame framework: Actors, Actions, Composition, Camera, Background / Environment, Style, Light, Color, Metaphor and Text. |
| Graphics | Composition, Mood, Graphic Style, Typography, Whitespace, Palette, Background Style, Overall Style, Visual Hierarchy, Decorative Elements, Texture and Text. |
| Character | Appearance, Apparent Age, Facial Features, Physique, Hair, Clothing, Accessories, Expression, Pose, Persona, Distinctive Features and Style. |
| Location | Interior/exterior space, architecture, layout, materials, objects, vegetation, lighting, atmosphere, palette and perspective; the live catalog lists the exact current layer IDs. |

The shared profile definitions and prompt builder are authoritative. The prompt
constructor includes one task per selected layer and asks for the corresponding
bracketed heading. Unselected layers are excluded from generated descriptions.
Text transcription is separate from typography styling in Graphics. Style names
must be supported by visible features; unreadable words and font names are never
invented. Character describes visible appearance; age is approximate and Persona
is an artistic impression, not a claim about someone's actual personality.

Changing the profile saves its prompt and Layers, then restores the selected
profile's draft or starts with its complete layer set. Returning to a profile
restores its authored prompt. An explicit Layers change rebuilds the prompt. Existing output is not evidence that the
new preset has run: a new analysis is needed to produce new descriptions.

## Persistence and assistant tools

- `analysisPreset`: `composition | graphics | character | location`.
- `presets`: layer ID array. `['default']` means all layers in the chosen profile.
- `preset`: legacy single-layer selection, kept for compatibility.
- Missing `analysisPreset` means Composition; existing graphs retain their intent.
- Agent `pipeline_build` and `pipeline_update` allow these fields and `model`.
  When selecting a profile/layers, omit `prompt` to use the shared constructor.
  Profile switching saves and restores authored drafts, as in Studio. An explicit
  Layers change rebuilds the prompt unless the same edit supplies a custom one.
- An explicit layer outside the selected profile is rejected with an explanation;
  it does not silently turn into an all-layers analysis.
- Live `node_catalog` lists the exact profile-specific layer keys and labels.
  `document_graph` includes the current profile and layer selections.

## Execution

Studio sends `analysisPreset`, prompt, model and up to five image references to
`/api/ai/analyze-image`; the server selects the matching system prompt. Missing
profile falls back to Composition; unsupported profile values are rejected before
calling the provider. With multiple references the profile's instructions retain
the existing shared-pattern analysis behavior.

Published pipelines pin `analysisPreset`, `preset`, `presets`, and the final prompt
in `ai.image.analyze` configuration. The current executable handler analyzes only
its first image; multi-image executable analysis is a separate existing gap and
is not claimed as part of this change. Editing a Studio draft does not mutate a
previously published version. No database migration or new external service is
needed for the optional profile field.
