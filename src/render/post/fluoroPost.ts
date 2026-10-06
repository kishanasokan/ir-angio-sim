import { NodeMaterial, type Node, type Texture } from 'three/webgpu';
import {
  abs,
  clamp,
  cos,
  exp,
  float,
  log,
  max,
  mix,
  rand,
  sqrt,
  sRGBTransferEOTF,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { FluoroConfig } from '../../data/renderConfig';

/**
 * The fluoro post pass, in TSL so one shader runs on WebGPU and WebGL 2 (spec 01 §7). The scene pass leaves optical
 * depth in a float target (multiplicative transmittance: depths add): devices and tissue in red, contrast in blue,
 * and the vessel mask in green.
 *
 * - The frame pass runs once per fluoro pulse and writes the image the monitor holds until the next pulse, or after
 *   fluoro stops (last-image hold): transmission T = exp(−depth) times the unattenuated gray, detector blur, quantum
 *   noise that grows with √T, vignette, collimator blades, and the display mirror (patient left on screen right in AP).
 * - The display pass runs every frame: the held image, black before the first pulse, with the roadmap outline drawn
 *   live from the vessel mask when it is on.
 */

type Float = Node<'float'>;

export interface FramePass {
  readonly material: NodeMaterial;
  /** Texture size in pixels, for the blur and noise taps. */
  setSize(width: number, height: number): void;
  /** New noise for each pulse. */
  setPulse(index: number): void;
  setCollimation(fraction: number): void;
}

/** Gaussian blur weights for the centre, edge and corner taps of a 3×3 kernel with this radius in pixels. */
export function blurWeights(radiusPx: number): {
  readonly center: number;
  readonly edge: number;
  readonly corner: number;
} {
  if (radiusPx <= 0) {
    return { center: 1, edge: 0, corner: 0 };
  }
  const g = (d2: number): number => Math.exp(-d2 / (2 * radiusPx * radiusPx));
  const total = g(0) + 4 * g(1) + 4 * g(2);
  return { center: g(0) / total, edge: g(1) / total, corner: g(2) / total };
}

// Fixed irrational offsets that decorrelate the two uniform draws of the Box–Muller transform between pulses.
const GOLDEN = 0.6180339887498949;
const SILVER = 0.4142135623730951;

export function createFramePass(attenuation: Texture, config: FluoroConfig): FramePass {
  const texel = uniform(vec2(1, 1));
  const seedA = uniform(0);
  const seedB = uniform(0);
  const collimation = uniform(1);
  const weights = blurWeights(config.blurRadiusPx);
  const background = float(config.background);
  const sigma = float(config.noiseSigma);

  // Mirror: the image reads as if viewed from the detector side.
  const mirrored = vec2(float(1).sub(uv().x), uv().y);

  const tap = (dx: number, dy: number): Float => {
    const at = mirrored.add(texel.mul(vec2(dx, dy)));
    const sample = texture(attenuation, at);
    const transmission = exp(sample.r.add(sample.b).negate());
    // Quantum noise: Gaussian (Box–Muller), standard deviation σ·√T at this pixel.
    const u1 = max(rand(at.add(vec2(seedA, seedB))), float(1e-6));
    const u2 = rand(at.add(vec2(seedB, seedA)).add(vec2(GOLDEN, SILVER)));
    const gaussian = sqrt(log(u1).mul(-2)).mul(cos(u2.mul(2 * Math.PI)));
    return background.mul(transmission).add(sigma.mul(sqrt(transmission)).mul(gaussian));
  };
  let gray = tap(0, 0).mul(weights.center);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    gray = gray.add(tap(dx, dy).mul(weights.edge));
  }
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    gray = gray.add(tap(dx, dy).mul(weights.corner));
  }

  // Vignette: darker toward the corners (r = 1 at a corner).
  const centered = uv().sub(0.5);
  const r2 = centered.dot(centered).mul(2);
  gray = gray.mul(float(1).sub(float(config.vignetteStrength).mul(r2)));

  // Collimator blades: a centred square `collimation` of the field wide.
  const half = collimation.mul(0.5);
  const inside = step(abs(centered.x), half).mul(step(abs(centered.y), half));
  const shown = mix(float(config.collimatedGray), clamp(gray, 0, 1), inside);

  const material = new NodeMaterial();
  material.colorNode = vec4(vec3(shown), 1);
  return {
    material,
    setSize: (width, height) => {
      texel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    },
    setPulse: (index) => {
      seedA.value = (index * GOLDEN) % 1;
      seedB.value = (index * SILVER) % 1;
    },
    setCollimation: (fraction) => {
      collimation.value = fraction;
    },
  };
}

export interface DisplayPass {
  readonly material: NodeMaterial;
  setSize(width: number, height: number): void;
  /** Whether a frame has been taken (and is held); otherwise the monitor is black. */
  setImage(shown: boolean): void;
  /** Roadmap outline opacity, 0 when it is off. */
  setRoadmap(opacity: number): void;
}

export function createDisplayPass(frame: Texture, attenuation: Texture, config: FluoroConfig): DisplayPass {
  const texel = uniform(vec2(1, 1));
  const image = uniform(0);
  const roadmap = uniform(0);
  const width = float(config.roadmapOutlineWidthPx);

  const held = texture(frame, uv()).r.mul(image);
  const mirrored = vec2(float(1).sub(uv().x), uv().y);
  const mask = (dx: number, dy: number): Float =>
    clamp(texture(attenuation, mirrored.add(texel.mul(vec2(dx, dy)).mul(width))).g, 0, 1);
  const edge = max(abs(mask(1, 0).sub(mask(-1, 0))), abs(mask(0, 1).sub(mask(0, -1))));
  const gray = mix(held, float(config.roadmapOutlineGray), clamp(edge, 0, 1).mul(roadmap));

  const material = new NodeMaterial();
  // The gray is a display value: convert to linear so the renderer's sRGB output gives it back unchanged.
  const linear = sRGBTransferEOTF(vec3(gray)) as unknown as ReturnType<typeof vec3>;
  material.colorNode = vec4(linear, 1);
  return {
    material,
    setSize: (w, h) => {
      texel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    },
    setImage: (shown) => {
      image.value = shown ? 1 : 0;
    },
    setRoadmap: (opacity) => {
      roadmap.value = opacity;
    },
  };
}
