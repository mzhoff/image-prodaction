import { MAX_FREQUENCY_RETOUCH_RADIUS } from './frequency-retouch-values';

export const vertexShaderSource = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vTexCoord;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord = aTexCoord;
}
`;

export const blurFragmentShaderSource = `
precision highp float;

varying vec2 vTexCoord;
uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;

const int MAX_RADIUS = ${MAX_FREQUENCY_RETOUCH_RADIUS};

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

export const compositeFragmentShaderSource = `
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
