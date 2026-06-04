export interface FrequencyRetouchValues {
  radius: number;
  rednessReduction: number;
  textureAmount: number;
  toneSmoothing: number;
}

const MAX_RADIUS = 32;

export async function frequencyRetouchImageBlob(sourceBlob: Blob, values: FrequencyRetouchValues, fileName: string, maskDataUrl?: string | null) {
  const image = await loadImageFromBlob(sourceBlob);
  const maskImage = maskDataUrl ? await loadImageFromDataUrl(maskDataUrl) : undefined;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const renderer = new FrequencyRetouchRenderer(canvas);
  try {
    renderer.init(image, maskImage);
    renderer.render(normalizeValues(values));
    const blob = await canvasToBlob(canvas, 'image/png');
    return new File([blob], fileName, { type: 'image/png' });
  } finally {
    renderer.destroy();
  }
}

function normalizeValues(values: FrequencyRetouchValues) {
  const radius = clamp(values.radius, 2, MAX_RADIUS);
  const toneSmoothing = clamp(values.toneSmoothing, 0, 100);
  return {
    radius,
    rednessReduction: clamp(values.rednessReduction, 0, 100) / 100,
    smoothRadius: clamp(radius + toneSmoothing * 0.28, 2, MAX_RADIUS),
    smoothStrength: toneSmoothing / 100,
    textureAmount: clamp(values.textureAmount, 0, 140) / 100,
  };
}

class FrequencyRetouchRenderer {
  private blurProgram: WebGLProgram | null = null;
  private buffers: { position: WebGLBuffer; texCoord: WebGLBuffer } | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private hasMask = false;
  private height = 0;
  private locations: ShaderLocations | null = null;
  private maskTexture: WebGLTexture | null = null;
  private sourceTexture: WebGLTexture | null = null;
  private textures: WebGLTexture[] = [];
  private width = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init(image: HTMLImageElement, maskImage?: HTMLImageElement) {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
      ?? this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is not available for frequency retouch.');

    this.width = this.canvas.width;
    this.height = this.canvas.height;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (this.width > maxTextureSize || this.height > maxTextureSize) {
      throw new Error(`Image is too large for WebGL retouch (${this.width}x${this.height}, max ${maxTextureSize}px).`);
    }

    const blurProgram = createProgram(gl, vertexShaderSource, blurFragmentShaderSource);
    const compositeProgram = createProgram(gl, vertexShaderSource, compositeFragmentShaderSource);
    const position = gl.createBuffer();
    const texCoord = gl.createBuffer();
    const framebuffer = gl.createFramebuffer();
    const maskTexture = gl.createTexture();
    const sourceTexture = gl.createTexture();
    if (!position || !texCoord || !framebuffer || !maskTexture || !sourceTexture) throw new Error('Unable to allocate WebGL retouch resources.');

    this.blurProgram = blurProgram;
    this.compositeProgram = compositeProgram;
    this.buffers = { position, texCoord };
    this.framebuffer = framebuffer;
    this.gl = gl;
    this.hasMask = Boolean(maskImage);
    this.maskTexture = maskTexture;
    this.sourceTexture = sourceTexture;
    this.locations = {
      blur: {
        aPosition: gl.getAttribLocation(blurProgram, 'aPosition'),
        aTexCoord: gl.getAttribLocation(blurProgram, 'aTexCoord'),
        uDirection: getUniformLocation(gl, blurProgram, 'uDirection'),
        uImage: getUniformLocation(gl, blurProgram, 'uImage'),
        uRadius: getUniformLocation(gl, blurProgram, 'uRadius'),
        uTexel: getUniformLocation(gl, blurProgram, 'uTexel'),
      },
      composite: {
        aPosition: gl.getAttribLocation(compositeProgram, 'aPosition'),
        aTexCoord: gl.getAttribLocation(compositeProgram, 'aTexCoord'),
        uBaseLow: getUniformLocation(gl, compositeProgram, 'uBaseLow'),
        uMask: getUniformLocation(gl, compositeProgram, 'uMask'),
        uOriginal: getUniformLocation(gl, compositeProgram, 'uOriginal'),
        uRednessReduction: getUniformLocation(gl, compositeProgram, 'uRednessReduction'),
        uSmoothLow: getUniformLocation(gl, compositeProgram, 'uSmoothLow'),
        uSmoothStrength: getUniformLocation(gl, compositeProgram, 'uSmoothStrength'),
        uTextureAmount: getUniformLocation(gl, compositeProgram, 'uTextureAmount'),
        uUseMask: getUniformLocation(gl, compositeProgram, 'uUseMask'),
      },
    };

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.writeQuadBuffers();
    this.uploadSourceTexture(image);
    if (maskImage) {
      this.uploadMaskTexture(maskImage);
    } else {
      this.uploadEmptyMaskTexture();
    }
  }

  render(values: ReturnType<typeof normalizeValues>) {
    if (!this.gl || !this.sourceTexture) return;

    const baseHorizontal = this.createRenderTexture();
    const baseLow = this.createRenderTexture();
    const smoothHorizontal = this.createRenderTexture();
    const smoothLow = this.createRenderTexture();

    this.renderBlurPass(this.sourceTexture, baseHorizontal, values.radius, 1, 0);
    this.renderBlurPass(baseHorizontal, baseLow, values.radius, 0, 1);
    this.renderBlurPass(baseLow, smoothHorizontal, values.smoothRadius, 1, 0);
    this.renderBlurPass(smoothHorizontal, smoothLow, values.smoothRadius, 0, 1);
    this.renderComposite(baseLow, smoothLow, values);
  }

  destroy() {
    if (!this.gl) return;

    this.textures.forEach((texture) => this.gl?.deleteTexture(texture));
    if (this.maskTexture) this.gl.deleteTexture(this.maskTexture);
    if (this.sourceTexture) this.gl.deleteTexture(this.sourceTexture);
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    if (this.buffers) {
      this.gl.deleteBuffer(this.buffers.position);
      this.gl.deleteBuffer(this.buffers.texCoord);
    }
    if (this.blurProgram) this.gl.deleteProgram(this.blurProgram);
    if (this.compositeProgram) this.gl.deleteProgram(this.compositeProgram);

    this.blurProgram = null;
    this.buffers = null;
    this.compositeProgram = null;
    this.framebuffer = null;
    this.gl = null;
    this.hasMask = false;
    this.locations = null;
    this.maskTexture = null;
    this.sourceTexture = null;
    this.textures = [];
  }

  private createRenderTexture() {
    if (!this.gl) throw new Error('WebGL retouch renderer is not initialized.');
    const texture = createTexture(this.gl, this.width, this.height);
    this.textures.push(texture);
    return texture;
  }

  private renderBlurPass(input: WebGLTexture, output: WebGLTexture, radius: number, directionX: number, directionY: number) {
    if (!this.gl || !this.blurProgram || !this.framebuffer || !this.locations) return;
    const gl = this.gl;
    gl.useProgram(this.blurProgram);
    this.bindQuadAttributes(this.locations.blur);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.locations.blur.uImage, 0);
    gl.uniform2f(this.locations.blur.uTexel, 1 / this.width, 1 / this.height);
    gl.uniform2f(this.locations.blur.uDirection, directionX, directionY);
    gl.uniform1f(this.locations.blur.uRadius, radius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderComposite(baseLow: WebGLTexture, smoothLow: WebGLTexture, values: ReturnType<typeof normalizeValues>) {
    if (!this.gl || !this.compositeProgram || !this.locations || !this.sourceTexture) return;
    const gl = this.gl;
    gl.useProgram(this.compositeProgram);
    this.bindQuadAttributes(this.locations.composite);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.uniform1i(this.locations.composite.uOriginal, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, baseLow);
    gl.uniform1i(this.locations.composite.uBaseLow, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, smoothLow);
    gl.uniform1i(this.locations.composite.uSmoothLow, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.locations.composite.uMask, 3);
    gl.uniform1f(this.locations.composite.uSmoothStrength, values.smoothStrength);
    gl.uniform1f(this.locations.composite.uTextureAmount, values.textureAmount);
    gl.uniform1f(this.locations.composite.uRednessReduction, values.rednessReduction);
    gl.uniform1f(this.locations.composite.uUseMask, this.hasMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private uploadEmptyMaskTexture() {
    if (!this.gl || !this.maskTexture) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    configureTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  }

  private uploadMaskTexture(image: HTMLImageElement) {
    if (!this.gl || !this.maskTexture) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    configureTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  private uploadSourceTexture(image: HTMLImageElement) {
    if (!this.gl || !this.sourceTexture) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    configureTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  private writeQuadBuffers() {
    if (!this.gl || !this.buffers) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ]), gl.STATIC_DRAW);
  }

  private bindQuadAttributes(locations: QuadAttributeLocations) {
    if (!this.gl || !this.buffers) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.enableVertexAttribArray(locations.aPosition);
    gl.vertexAttribPointer(locations.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.enableVertexAttribArray(locations.aTexCoord);
    gl.vertexAttribPointer(locations.aTexCoord, 2, gl.FLOAT, false, 0, 0);
  }
}

interface QuadAttributeLocations {
  aPosition: number;
  aTexCoord: number;
}

interface BlurLocations extends QuadAttributeLocations {
  uDirection: WebGLUniformLocation;
  uImage: WebGLUniformLocation;
  uRadius: WebGLUniformLocation;
  uTexel: WebGLUniformLocation;
}

interface CompositeLocations extends QuadAttributeLocations {
  uBaseLow: WebGLUniformLocation;
  uMask: WebGLUniformLocation;
  uOriginal: WebGLUniformLocation;
  uRednessReduction: WebGLUniformLocation;
  uSmoothLow: WebGLUniformLocation;
  uSmoothStrength: WebGLUniformLocation;
  uTextureAmount: WebGLUniformLocation;
  uUseMask: WebGLUniformLocation;
}

interface ShaderLocations {
  blur: BlurLocations;
  composite: CompositeLocations;
}

function createTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, width: number, height: number) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to allocate WebGL retouch texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  configureTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

function configureTexture(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL retouch program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unable to link WebGL retouch shader program.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL retouch shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile WebGL retouch shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function getUniformLocation(gl: WebGLRenderingContext | WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing WebGL retouch uniform: ${name}`);
  return location;
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение для ретуши.'));
    };
    image.src = url;
  });
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать маску для ретуши.'));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Не удалось сохранить результат ретуши.'));
    }, type);
  });
}

function clamp(value: number | undefined, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

const blurFragmentShaderSource = `
precision highp float;

varying vec2 vTexCoord;
uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;

const int MAX_RADIUS = ${MAX_RADIUS};

void main() {
  float radius = max(uRadius, 0.0);
  float sigma = max(radius / 3.0, 0.001);
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;

  for (int i = -MAX_RADIUS; i <= MAX_RADIUS; i++) {
    float offset = float(i);
    if (abs(offset) <= radius) {
      float weight = radius < 0.5 ? (i == 0 ? 1.0 : 0.0) : exp(-0.5 * (offset * offset) / (sigma * sigma));
      sum += texture2D(uImage, vTexCoord + uDirection * uTexel * offset) * weight;
      weightSum += weight;
    }
  }

  gl_FragColor = sum / max(weightSum, 0.0001);
}
`;

const compositeFragmentShaderSource = `
precision highp float;

varying vec2 vTexCoord;
uniform sampler2D uOriginal;
uniform sampler2D uBaseLow;
uniform sampler2D uSmoothLow;
uniform sampler2D uMask;
uniform float uSmoothStrength;
uniform float uTextureAmount;
uniform float uRednessReduction;
uniform float uUseMask;

void main() {
  vec4 original = texture2D(uOriginal, vTexCoord);
  vec3 baseLow = texture2D(uBaseLow, vTexCoord).rgb;
  vec3 smoothLow = texture2D(uSmoothLow, vTexCoord).rgb;
  vec3 retouchedLow = mix(baseLow, smoothLow, uSmoothStrength);
  vec3 high = original.rgb - baseLow;

  float redExcess = max(0.0, retouchedLow.r - max(retouchedLow.g, retouchedLow.b) - 0.015);
  retouchedLow.r -= redExcess * uRednessReduction * 0.85;
  retouchedLow.g += redExcess * uRednessReduction * 0.10;

  vec3 retouched = retouchedLow + high * uTextureAmount;
  vec4 mask = texture2D(uMask, vTexCoord);
  float maskStrength = uUseMask > 0.5 ? max(mask.r, max(mask.g, mask.b)) : 1.0;
  vec3 color = mix(original.rgb, retouched, maskStrength);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), original.a);
}
`;
