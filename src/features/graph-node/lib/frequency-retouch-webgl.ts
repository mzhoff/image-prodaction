type GlContext = WebGLRenderingContext | WebGL2RenderingContext;

export function createRetouchTexture(gl: GlContext, width: number, height: number) {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Unable to allocate WebGL retouch texture.');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  configureRetouchTexture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return texture;
}

export function configureRetouchTexture(gl: GlContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

export function createRetouchProgram(gl: GlContext, vertexSource: string, fragmentSource: string) {
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

export function getRetouchUniform(gl: GlContext, program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`Missing WebGL retouch uniform: ${name}`);
  return location;
}

export function loadRetouchImageFromBlob(blob: Blob) {
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

export function loadRetouchImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось прочитать маску для ретуши.'));
    image.src = dataUrl;
  });
}

export function retouchCanvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob
      ? resolve(blob)
      : reject(new Error('Не удалось сохранить результат ретуши.')), type);
  });
}

function createShader(gl: GlContext, type: number, source: string) {
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
