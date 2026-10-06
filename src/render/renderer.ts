import { NodeMaterial, QuadMesh, RenderTarget, WebGPURenderer } from 'three/webgpu';
import { texture, uv, vec4 } from 'three/tsl';

/**
 * The renderer (spec 01 §7): three.js WebGPURenderer, which falls back to WebGL 2 on its own when WebGPU is missing.
 * `await init()` finishes before the first frame, and the backend actually used is reported to the HUD and the perf
 * overlay. The test flag ?webgl=1 forces WebGL 2.
 *
 * Some browsers expose WebGPU but reject what this three.js release sends: Chromium 141, for example, throws on the
 * texture-view swizzle field. A probe frame that samples a render target runs right after init, and if it throws, the
 * renderer is rebuilt on WebGL 2 with a fresh canvas (a canvas keeps the kind of context it first gave out), so the
 * learner gets a working view instead of a blank one.
 */

export type BackendName = 'WebGPU' | 'WebGL 2';

export interface RendererHandle {
  readonly renderer: WebGPURenderer;
  readonly canvas: HTMLCanvasElement;
  readonly backend: BackendName;
  dispose(): void;
}

interface BackendFlags {
  readonly isWebGPUBackend?: boolean;
}

export function backendName(renderer: WebGPURenderer): BackendName {
  return (renderer.backend as BackendFlags).isWebGPUBackend === true ? 'WebGPU' : 'WebGL 2';
}

/** Renders one tiny frame that samples a render target, the path the fluoro view uses. */
function probe(renderer: WebGPURenderer): void {
  const source = new RenderTarget(1, 1);
  const output = new RenderTarget(1, 1);
  const material = new NodeMaterial();
  material.colorNode = vec4(texture(source.texture, uv()).rgb, 1);
  const quad = new QuadMesh(material);
  try {
    renderer.setRenderTarget(source);
    renderer.clear();
    renderer.setRenderTarget(output);
    quad.render(renderer);
  } finally {
    renderer.setRenderTarget(null);
    material.dispose();
    source.dispose();
    output.dispose();
  }
}

function newCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'block h-full w-full';
  canvas.setAttribute('data-testid', 'view-canvas');
  container.appendChild(canvas);
  return canvas;
}

async function initRenderer(canvas: HTMLCanvasElement, forceWebGL: boolean): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL });
  await renderer.init();
  return renderer;
}

function handle(renderer: WebGPURenderer, canvas: HTMLCanvasElement): RendererHandle {
  return {
    renderer,
    canvas,
    backend: backendName(renderer),
    dispose: () => {
      void renderer.dispose();
      canvas.remove();
    },
  };
}

/** Creates the renderer on a new canvas inside `container`. */
export async function createRenderer(
  container: HTMLElement,
  options: { readonly forceWebGL: boolean },
): Promise<RendererHandle> {
  const canvas = newCanvas(container);
  const renderer = await initRenderer(canvas, options.forceWebGL);
  if (backendName(renderer) === 'WebGPU') {
    try {
      probe(renderer);
    } catch {
      void renderer.dispose();
      canvas.remove();
      const fallbackCanvas = newCanvas(container);
      return handle(await initRenderer(fallbackCanvas, true), fallbackCanvas);
    }
  }
  return handle(renderer, canvas);
}
