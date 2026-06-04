import {
  applyCurvesToPixels,
  buildCurvesLutTextureData,
  normalizeCurves,
  type CurvesAdjustmentValues,
} from '@/shared/lib/image-renderer/curves';

export type { CurveChannelId, CurvePoint, CurvePointMap, CurvesAdjustmentValues } from '@/shared/lib/image-renderer/curves';

export async function curvesImageBlob(sourceBlob: Blob, values: CurvesAdjustmentValues, fileName: string, maskDataUrl?: string | null) {
  const image = await loadImageFromBlob(sourceBlob);
  const maskImage = maskDataUrl ? await loadImageFromDataUrl(maskDataUrl) : null;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  try {
    renderCurvesWithWebgl(canvas, image, values, maskImage);
  } catch {
    renderCurvesWithCanvas(canvas, image, values, maskImage);
  }

  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], fileName, { type: 'image/png' });
}

function renderCurvesWithCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  values: CurvesAdjustmentValues,
  maskImage: HTMLImageElement | null,
) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not available in this browser.');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const maskPixels = maskImage ? readMaskPixels(maskImage, canvas.width, canvas.height) : undefined;
  applyCurvesToPixels(imageData.data, values, maskPixels);
  context.putImageData(imageData, 0, 0);
}

function renderCurvesWithWebgl(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  values: CurvesAdjustmentValues,
  maskImage: HTMLImageElement | null,
) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true })
    ?? canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is not available for curves.');

  const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();
  if (!positionBuffer || !texCoordBuffer) throw new Error('Unable to allocate WebGL curves buffers.');

  const aPosition = gl.getAttribLocation(program, 'aPosition');
  const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
  const uImage = getUniformLocation(gl, program, 'uImage');
  const uLut = getUniformLocation(gl, program, 'uLut');
  const uMask = getUniformLocation(gl, program, 'uMask');
  const uOpacity = getUniformLocation(gl, program, 'uOpacity');
  const uHasMask = getUniformLocation(gl, program, 'uHasMask');

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    1, 1,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aTexCoord);
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const imageTexture = createImageTexture(gl, image);
  const lutTexture = createLutTexture(gl, normalizeCurves(values.curves));
  const maskTexture = maskImage ? createImageTexture(gl, maskImage) : null;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.uniform1i(uImage, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lutTexture);
  gl.uniform1i(uLut, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.uniform1i(uMask, 2);
  gl.uniform1f(uOpacity, Math.min(1, Math.max(0, values.opacity / 100)));
  gl.uniform1f(uHasMask, maskTexture ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.deleteTexture(imageTexture);
  gl.deleteTexture(lutTexture);
  if (maskTexture) gl.deleteTexture(maskTexture);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(texCoordBuffer);
  gl.deleteProgram(program);
}

function createImageTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, image: HTMLImageElement) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to allocate WebGL curves texture.');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

function createLutTexture(gl: WebGLRenderingContext | WebGL2RenderingContext, curves: CurvesAdjustmentValues['curves']) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to allocate WebGL curves LUT texture.');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurvesLutTextureData(curves));
  return texture;
}

function readMaskPixels(maskImage: HTMLImageElement, width: number, height: number) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskContext) return undefined;
  maskContext.drawImage(maskImage, 0, 0, width, height);
  return maskContext.getImageData(0, 0, width, height).data;
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
      reject(new Error('Не удалось прочитать изображение для кривых.'));
    };
    image.src = url;
  });
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать маску для кривых.'));
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
      reject(new Error('Не удалось сохранить изображение после кривых.'));
    }, type);
  });
}

function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL curves program.');

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unable to link WebGL curves program.';
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL curves shader.');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unable to compile WebGL curves shader.';
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function getUniformLocation(gl: WebGLRenderingContext | WebGL2RenderingContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing WebGL curves uniform: ${name}`);
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
uniform sampler2D uLut;
uniform sampler2D uMask;
uniform float uOpacity;
uniform float uHasMask;

float lookupCurve(float value, float row) {
  float index = floor(clamp(value, 0.0, 1.0) * 255.0);
  return texture2D(uLut, vec2((index + 0.5) / 256.0, (row + 0.5) / 4.0)).r;
}

void main() {
  vec4 sourceColor = texture2D(uImage, vTexCoord);
  vec3 master = vec3(
    lookupCurve(sourceColor.r, 0.0),
    lookupCurve(sourceColor.g, 0.0),
    lookupCurve(sourceColor.b, 0.0)
  );
  vec3 curved = vec3(
    lookupCurve(master.r, 1.0),
    lookupCurve(master.g, 2.0),
    lookupCurve(master.b, 3.0)
  );
  float maskAmount = uHasMask > 0.5 ? texture2D(uMask, vTexCoord).a : 1.0;
  float amount = clamp(uOpacity, 0.0, 1.0) * maskAmount;

  gl_FragColor = vec4(mix(sourceColor.rgb, curved, amount), sourceColor.a);
}
`;
