import { blurFragmentShaderSource, compositeFragmentShaderSource, vertexShaderSource } from './frequency-retouch-shaders';
import type { normalizeFrequencyRetouchValues } from './frequency-retouch-values';
import {
  configureRetouchTexture,
  createRetouchProgram,
  createRetouchTexture,
  getRetouchUniform,
} from './frequency-retouch-webgl';

type GlContext = WebGLRenderingContext | WebGL2RenderingContext;
type NormalizedValues = ReturnType<typeof normalizeFrequencyRetouchValues>;

interface QuadLocations { aPosition: number; aTexCoord: number }
interface BlurLocations extends QuadLocations {
  uDirection: WebGLUniformLocation;
  uImage: WebGLUniformLocation;
  uRadius: WebGLUniformLocation;
  uTexel: WebGLUniformLocation;
}
interface CompositeLocations extends QuadLocations {
  uBaseLow: WebGLUniformLocation;
  uMask: WebGLUniformLocation;
  uOriginal: WebGLUniformLocation;
  uRednessReduction: WebGLUniformLocation;
  uSmoothLow: WebGLUniformLocation;
  uSmoothStrength: WebGLUniformLocation;
  uTextureAmount: WebGLUniformLocation;
  uUseMask: WebGLUniformLocation;
}

export class FrequencyRetouchRenderer {
  private blurProgram: WebGLProgram | null = null;
  private buffers: { position: WebGLBuffer; texCoord: WebGLBuffer } | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private gl: GlContext | null = null;
  private hasMask = false;
  private height = 0;
  private locations: { blur: BlurLocations; composite: CompositeLocations } | null = null;
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
    this.allocateResources(gl, Boolean(maskImage));
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.writeQuadBuffers();
    this.uploadSourceTexture(image);
    if (maskImage) this.uploadMaskTexture(maskImage);
    else this.uploadEmptyMaskTexture();
  }

  render(values: NormalizedValues) {
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
    this.locations = null;
    this.maskTexture = null;
    this.sourceTexture = null;
    this.textures = [];
  }

  private allocateResources(gl: GlContext, hasMask: boolean) {
    const blurProgram = createRetouchProgram(gl, vertexShaderSource, blurFragmentShaderSource);
    const compositeProgram = createRetouchProgram(gl, vertexShaderSource, compositeFragmentShaderSource);
    const position = gl.createBuffer();
    const texCoord = gl.createBuffer();
    const framebuffer = gl.createFramebuffer();
    const maskTexture = gl.createTexture();
    const sourceTexture = gl.createTexture();
    if (!position || !texCoord || !framebuffer || !maskTexture || !sourceTexture) {
      throw new Error('Unable to allocate WebGL retouch resources.');
    }
    this.blurProgram = blurProgram;
    this.compositeProgram = compositeProgram;
    this.buffers = { position, texCoord };
    this.framebuffer = framebuffer;
    this.gl = gl;
    this.hasMask = hasMask;
    this.maskTexture = maskTexture;
    this.sourceTexture = sourceTexture;
    this.locations = createLocations(gl, blurProgram, compositeProgram);
  }

  private createRenderTexture() {
    if (!this.gl) throw new Error('WebGL retouch renderer is not initialized.');
    const texture = createRetouchTexture(this.gl, this.width, this.height);
    this.textures.push(texture);
    return texture;
  }

  private renderBlurPass(input: WebGLTexture, output: WebGLTexture, radius: number, x: number, y: number) {
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
    gl.uniform2f(this.locations.blur.uDirection, x, y);
    gl.uniform1f(this.locations.blur.uRadius, radius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderComposite(baseLow: WebGLTexture, smoothLow: WebGLTexture, values: NormalizedValues) {
    if (!this.gl || !this.compositeProgram || !this.locations || !this.sourceTexture) return;
    const gl = this.gl;
    gl.useProgram(this.compositeProgram);
    this.bindQuadAttributes(this.locations.composite);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.bindCompositeTexture(gl.TEXTURE0, this.sourceTexture, this.locations.composite.uOriginal, 0);
    this.bindCompositeTexture(gl.TEXTURE1, baseLow, this.locations.composite.uBaseLow, 1);
    this.bindCompositeTexture(gl.TEXTURE2, smoothLow, this.locations.composite.uSmoothLow, 2);
    this.bindCompositeTexture(gl.TEXTURE3, this.maskTexture, this.locations.composite.uMask, 3);
    gl.uniform1f(this.locations.composite.uSmoothStrength, values.smoothStrength);
    gl.uniform1f(this.locations.composite.uTextureAmount, values.textureAmount);
    gl.uniform1f(this.locations.composite.uRednessReduction, values.rednessReduction);
    gl.uniform1f(this.locations.composite.uUseMask, this.hasMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindCompositeTexture(unit: number, texture: WebGLTexture | null, uniform: WebGLUniformLocation, index: number) {
    if (!this.gl) return;
    this.gl.activeTexture(unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.uniform1i(uniform, index);
  }

  private uploadEmptyMaskTexture() {
    if (!this.gl || !this.maskTexture) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    configureRetouchTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  }

  private uploadMaskTexture(image: HTMLImageElement) {
    this.uploadImageTexture(image, this.maskTexture, this.gl?.TEXTURE3);
  }

  private uploadSourceTexture(image: HTMLImageElement) {
    this.uploadImageTexture(image, this.sourceTexture, this.gl?.TEXTURE0);
  }

  private uploadImageTexture(image: HTMLImageElement, texture: WebGLTexture | null, unit?: number) {
    if (!this.gl || !texture || unit === undefined) return;
    this.gl.activeTexture(unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    configureRetouchTexture(this.gl);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
  }

  private writeQuadBuffers() {
    if (!this.gl || !this.buffers) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  }

  private bindQuadAttributes(locations: QuadLocations) {
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

function createLocations(gl: GlContext, blur: WebGLProgram, composite: WebGLProgram) {
  return {
    blur: {
      aPosition: gl.getAttribLocation(blur, 'aPosition'),
      aTexCoord: gl.getAttribLocation(blur, 'aTexCoord'),
      uDirection: getRetouchUniform(gl, blur, 'uDirection'),
      uImage: getRetouchUniform(gl, blur, 'uImage'),
      uRadius: getRetouchUniform(gl, blur, 'uRadius'),
      uTexel: getRetouchUniform(gl, blur, 'uTexel'),
    },
    composite: {
      aPosition: gl.getAttribLocation(composite, 'aPosition'),
      aTexCoord: gl.getAttribLocation(composite, 'aTexCoord'),
      uBaseLow: getRetouchUniform(gl, composite, 'uBaseLow'),
      uMask: getRetouchUniform(gl, composite, 'uMask'),
      uOriginal: getRetouchUniform(gl, composite, 'uOriginal'),
      uRednessReduction: getRetouchUniform(gl, composite, 'uRednessReduction'),
      uSmoothLow: getRetouchUniform(gl, composite, 'uSmoothLow'),
      uSmoothStrength: getRetouchUniform(gl, composite, 'uSmoothStrength'),
      uTextureAmount: getRetouchUniform(gl, composite, 'uTextureAmount'),
      uUseMask: getRetouchUniform(gl, composite, 'uUseMask'),
    },
  };
}
