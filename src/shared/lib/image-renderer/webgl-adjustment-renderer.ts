import type { ImageAdjustmentValues } from './adjustment-types';

export interface AdjustmentPreviewRenderer {
  destroy: () => void;
  render: (values: ImageAdjustmentValues) => void;
  resize: () => void;
  setImage: (image: HTMLImageElement) => Promise<void>;
}

export async function createWebglAdjustmentPreviewRenderer(canvas: HTMLCanvasElement): Promise<AdjustmentPreviewRenderer> {
  const renderer = new WebglAdjustmentPreviewRenderer(canvas);
  renderer.init();
  return renderer;
}

class WebglAdjustmentPreviewRenderer implements AdjustmentPreviewRenderer {
  private buffers: { position: WebGLBuffer; texCoord: WebGLBuffer } | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private imageHeight = 0;
  private imageWidth = 0;
  private locations: ShaderLocations | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false })
      ?? this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL is not available.');

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    gl.useProgram(program);

    const position = gl.createBuffer();
    const texCoord = gl.createBuffer();
    const texture = gl.createTexture();
    if (!position || !texCoord || !texture) throw new Error('Unable to allocate WebGL buffers.');

    this.gl = gl;
    this.program = program;
    this.buffers = { position, texCoord };
    this.texture = texture;
    this.locations = {
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
      uContrast: getUniformLocation(gl, program, 'uContrast'),
      uExposure: getUniformLocation(gl, program, 'uExposure'),
      uGamma: getUniformLocation(gl, program, 'uGamma'),
      uHighlights: getUniformLocation(gl, program, 'uHighlights'),
      uImage: getUniformLocation(gl, program, 'uImage'),
      uSaturation: getUniformLocation(gl, program, 'uSaturation'),
      uShadows: getUniformLocation(gl, program, 'uShadows'),
      uTemperature: getUniformLocation(gl, program, 'uTemperature'),
      uTint: getUniformLocation(gl, program, 'uTint'),
    };

    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.locations.uImage, 0);
    this.writeTexCoords();
    this.resize();
  }

  async setImage(image: HTMLImageElement) {
    if (!this.gl || !this.texture) return;

    this.imageWidth = image.naturalWidth || image.width;
    this.imageHeight = image.naturalHeight || image.height;
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    this.resize();
  }

  resize() {
    if (!this.gl || !this.buffers) return;

    const size = getCanvasDisplaySize(this.canvas);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(size.width * pixelRatio));
    const height = Math.max(1, Math.round(size.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.writePositions(width, height);
  }

  render(values: ImageAdjustmentValues) {
    if (!this.gl || !this.locations || !this.program || !this.texture) return;

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.locations.uExposure, values.exposure);
    gl.uniform1f(this.locations.uGamma, values.gamma);
    gl.uniform1f(this.locations.uContrast, values.contrast);
    gl.uniform1f(this.locations.uSaturation, values.saturation);
    gl.uniform1f(this.locations.uTemperature, values.temperature);
    gl.uniform1f(this.locations.uTint, values.tint);
    gl.uniform1f(this.locations.uHighlights, values.highlights);
    gl.uniform1f(this.locations.uShadows, values.shadows);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (!this.gl) return;
    if (this.buffers) {
      this.gl.deleteBuffer(this.buffers.position);
      this.gl.deleteBuffer(this.buffers.texCoord);
    }
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.program) this.gl.deleteProgram(this.program);
    this.buffers = null;
    this.gl = null;
    this.locations = null;
    this.program = null;
    this.texture = null;
  }

  private writePositions(canvasWidth: number, canvasHeight: number) {
    if (!this.gl || !this.buffers || !this.locations) return;

    const ratio = this.imageWidth > 0 && this.imageHeight > 0 ? this.imageWidth / this.imageHeight : canvasWidth / canvasHeight;
    const canvasRatio = canvasWidth / canvasHeight;
    const widthScale = ratio > canvasRatio ? 1 : ratio / canvasRatio;
    const heightScale = ratio > canvasRatio ? canvasRatio / ratio : 1;
    const positions = new Float32Array([
      -widthScale, -heightScale,
      widthScale, -heightScale,
      -widthScale, heightScale,
      widthScale, heightScale,
    ]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(this.locations.aPosition);
    this.gl.vertexAttribPointer(this.locations.aPosition, 2, this.gl.FLOAT, false, 0, 0);
  }

  private writeTexCoords() {
    if (!this.gl || !this.buffers || !this.locations) return;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(this.locations.aTexCoord);
    this.gl.vertexAttribPointer(this.locations.aTexCoord, 2, this.gl.FLOAT, false, 0, 0);
  }
}

interface ShaderLocations {
  aPosition: number;
  aTexCoord: number;
  uContrast: WebGLUniformLocation;
  uExposure: WebGLUniformLocation;
  uGamma: WebGLUniformLocation;
  uHighlights: WebGLUniformLocation;
  uImage: WebGLUniformLocation;
  uSaturation: WebGLUniformLocation;
  uShadows: WebGLUniformLocation;
  uTemperature: WebGLUniformLocation;
  uTint: WebGLUniformLocation;
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unable to link WebGL shader program.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile WebGL shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function getCanvasDisplaySize(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  return {
    height: Math.max(1, canvas.clientHeight || rect.height || 1),
    width: Math.max(1, canvas.clientWidth || rect.width || 1),
  };
}

function getUniformLocation(gl: WebGLRenderingContext | WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing WebGL uniform: ${name}`);
  return location;
}

const vertexShaderSource = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vTexCoord;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord = aTexCoord;
}
`;

const fragmentShaderSource = `
precision highp float;

varying vec2 vTexCoord;
uniform sampler2D uImage;
uniform float uExposure;
uniform float uGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uTemperature;
uniform float uTint;
uniform float uHighlights;
uniform float uShadows;

float normalizedOffset(float value) {
  return value / 255.0;
}

void main() {
  vec4 sourceColor = texture2D(uImage, vTexCoord);
  vec3 color = sourceColor.rgb;

  float exposureFactor = pow(2.0, uExposure / 100.0);
  float gammaExponent = clamp(1.0 - uGamma / 150.0, 0.2, 3.0);
  float contrastFactor = (100.0 + uContrast) / 100.0;
  float saturationFactor = (100.0 + uSaturation) / 100.0;

  color *= exposureFactor;
  color = pow(clamp(color, 0.0, 1.0), vec3(gammaExponent));
  color = (color - 0.5019608) * contrastFactor + 0.5019608;

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float highlightWeight = luminance > 0.5019608 ? (luminance - 0.5019608) / 0.4980392 : 0.0;
  float shadowWeight = luminance < 0.5019608 ? (0.5019608 - luminance) / 0.5019608 : 0.0;
  float tonalOffset = normalizedOffset(uHighlights * 0.65 * highlightWeight + uShadows * 0.65 * shadowWeight);

  color.r += tonalOffset + normalizedOffset(uTemperature * 0.45 + uTint * 0.25);
  color.g += tonalOffset - normalizedOffset(uTint * 0.25);
  color.b += tonalOffset - normalizedOffset(uTemperature * 0.45) + normalizedOffset(uTint * 0.25);

  float adjustedLuminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = adjustedLuminance + (color - adjustedLuminance) * saturationFactor;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), sourceColor.a);
}
`;
