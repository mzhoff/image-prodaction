import { resolveVideoDirectionStyle, type VideoDirectionSettings } from './home-video-direction';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS, VIDEO_MOVEMENT_OPTIONS, VIDEO_OPTICS_OPTIONS, VIDEO_SPEED_OPTIONS, type VideoCinematicOption } from './video-cinematic-catalog';
import { VIDEO_ANGLE_OPTIONS, VIDEO_FOCUS_OPTIONS, VIDEO_FRAMING_OPTIONS, VIDEO_LIGHTING_OPTIONS, VIDEO_TEMPERATURE_OPTIONS, VIDEO_TIME_OF_DAY_OPTIONS } from './video-direction-catalog';

export function compileVideoDirection(direction: VideoDirectionSettings) {
  const { story, scene, shot } = direction;
  const style = resolveVideoDirectionStyle(direction);
  const desiredStyle = [instruction(VIDEO_LOOK_OPTIONS, style.look), instruction(VIDEO_GRAIN_OPTIONS, style.grain),
    userText('Custom visual style', style.prompt)].filter(Boolean);
  const sceneDirections = [userText('Scene description', scene.description), userText('Location', scene.location),
    instruction(VIDEO_TIME_OF_DAY_OPTIONS, scene.timeOfDay), instruction(VIDEO_LIGHTING_OPTIONS, scene.lighting),
    instruction(VIDEO_TEMPERATURE_OPTIONS, scene.temperature), userText('Light sources', scene.lightSources)].filter(Boolean);
  const shotDirections = [userText('Shot description', shot.description), instruction(VIDEO_FRAMING_OPTIONS, shot.framing),
    instruction(VIDEO_ANGLE_OPTIONS, shot.angle), instruction(VIDEO_FOCUS_OPTIONS, shot.focus), instruction(VIDEO_OPTICS_OPTIONS, shot.optics),
    instruction(VIDEO_MOVEMENT_OPTIONS, shot.movement), shot.movement === 'static' ? '' : instruction(VIDEO_SPEED_OPTIONS, shot.speed)].filter(Boolean);
  return [userText('Story context', story.description), section('Effective visual style', desiredStyle),
    section('Scene direction', sceneDirections), section('Shot direction', shotDirections)].filter(Boolean).join('\n\n');
}

function userText(label: string, value: string) { return value ? `${label} (user supplied): ${JSON.stringify(value)}` : ''; }
function section(label: string, lines: string[]) { return lines.length ? `[${label}]\n${lines.join('\n')}\n[/${label}]` : ''; }
function instruction(options: readonly VideoCinematicOption[], id: string) { return options.find((option) => option.id === id)?.instruction ?? ''; }
