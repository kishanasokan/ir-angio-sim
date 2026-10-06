import {
  AdditiveBlending,
  CustomBlending,
  CylinderGeometry,
  FrontSide,
  Group,
  HalfFloatType,
  MaxEquation,
  Mesh,
  MeshBasicNodeMaterial,
  OneFactor,
  PerspectiveCamera,
  QuadMesh,
  RenderTarget,
  Scene,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  abs,
  attribute,
  dot,
  float,
  max,
  normalize,
  normalView,
  positionView,
  sqrt,
  uniform,
  vec4,
} from 'three/tsl';
import type { RenderConfig } from '../../data/renderConfig';
import type { CarmParams, CarmState } from '../../sim/imaging/carm';
import { TubeGeometry, type DeviceTube } from '../devices/deviceMesh';
import { createDisplayPass, createFramePass, type DisplayPass, type FramePass } from '../post/fluoroPost';
import { fluoroCameraPose } from './carmCamera';
import type { PhantomShape } from './phantom';

/**
 * The fluoro view (prompts/M1-foundations.md §6, spec 01 §7). Every object adds its optical depth to a float target
 * (additive blending, so transmittances multiply), seen through the C-arm camera from the focal spot:
 *
 * - devices: depth across a solid rod or a tube wall, from the chord the ray cuts through the cylinder (found from the
 *   surface normal), so a wire is darkest along its axis and a catheter shows its two walls; the distal section is
 *   boosted by the rod model's radiopacity;
 * - the soft-tissue band: a faint cylinder around the phantom;
 * - the lumen: invisible unless the contrast puff stand-in is on; it always writes the vessel mask the roadmap outline
 *   uses. Contrast goes in the blue channel with max blending, so where vessels overlap (at a junction) it counts
 *   once, as one lumen full of contrast does; devices and tissue add in red.
 *
 * The post pass (post/fluoroPost.ts) turns depth into the image once per pulse and holds it between pulses and after
 * fluoro stops.
 */

export interface FluoroState {
  /** Wall-clock seconds: pulses are timed in real time, like the monitor. */
  readonly now: number;
  readonly fluoro: boolean;
  /** Contrast puff stand-in, 0..1. */
  readonly puff: number;
  readonly roadmap: boolean;
  /** Hz. */
  readonly pulseRate: number;
  readonly carm: CarmState;
}

export type FluoroImage = 'fluoro' | 'hold' | 'none';

type Depth = Node<'float'>;

/** |n·v|: 1 where the ray meets the surface head-on, 0 at the silhouette; equals chord/diameter for a cylinder. */
function facing(): Depth {
  return abs(dot(normalize(normalView), normalize(positionView.negate())));
}

function baseMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.side = FrontSide;
  return material;
}

/** Devices and tissue: optical depth in red, added. */
function attenuationMaterial(depth: Depth): MeshBasicNodeMaterial {
  const material = baseMaterial();
  material.blending = AdditiveBlending;
  material.colorNode = vec4(depth, 0, 0, 1);
  return material;
}

/** The lumen: the vessel mask in green and contrast depth in blue, each the largest of any overlapping vessel. */
function lumenMaterial(contrast: Depth): MeshBasicNodeMaterial {
  const material = baseMaterial();
  material.blending = CustomBlending;
  material.blendEquation = MaxEquation;
  material.blendSrc = OneFactor;
  material.blendDst = OneFactor;
  material.colorNode = vec4(0, 1, contrast, 1);
  return material;
}

/** Optical depth for an opacity: transmission 1 − opacity. */
export function opticalDepth(opacity: number): number {
  return -Math.log(Math.max(Number.EPSILON, 1 - opacity));
}

export class FluoroView {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();
  /** The patient frame, moved by the table pan and lift. */
  private readonly patient = new Group();
  private readonly attenuation: RenderTarget;
  private readonly frame: RenderTarget;
  private readonly framePass: FramePass;
  private readonly displayPass: DisplayPass;
  private readonly frameQuad: QuadMesh;
  private readonly displayQuad: QuadMesh;
  private readonly puffDepth = uniform(0);
  private readonly phantomMeshes: Mesh[] = [];
  private readonly deviceMeshes = new Map<DeviceTube, Mesh>();
  private phantom: PhantomShape | null = null;
  private image: FluoroImage = 'none';
  private hasFrame = false;
  private wasOn = false;
  private nextPulse = 0;
  private pulseIndex = 0;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly config: RenderConfig,
    private readonly carmParams: CarmParams,
  ) {
    this.attenuation = new RenderTarget(1, 1, { type: HalfFloatType });
    this.frame = new RenderTarget(1, 1, { type: HalfFloatType });
    this.framePass = createFramePass(this.attenuation.texture, config.fluoro);
    this.displayPass = createDisplayPass(this.frame.texture, this.attenuation.texture, config.fluoro);
    this.frameQuad = new QuadMesh(this.framePass.material);
    this.displayQuad = new QuadMesh(this.displayPass.material);
    this.scene.add(this.patient);
  }

  /** What the monitor shows: a live pulse sequence, the held last image, or nothing yet. */
  get shown(): FluoroImage {
    return this.image;
  }

  setPhantom(shape: PhantomShape): void {
    this.clearPhantom();
    this.phantom = shape;
    const radial = this.config.tubeRadialSegments;

    // The soft-tissue band: a solid cylinder along the patient axis.
    const { band } = shape;
    const height = band.zMax - band.zMin;
    const bandGeometry = new CylinderGeometry(band.radius, band.radius, height, radial * 2, 1, true);
    bandGeometry.rotateX(Math.PI / 2);
    const bandMesh = new Mesh(
      bandGeometry,
      attenuationMaterial(float(opticalDepth(this.config.fluoro.softTissueBandOpacity)).mul(facing())),
    );
    bandMesh.position.set(band.center[0], band.center[1], 0.5 * (band.zMin + band.zMax));
    this.addPhantomMesh(bandMesh);

    // The lumen: contrast depth while the puff is on, and the vessel mask always.
    for (const tube of shape.tubes) {
      const count = tube.points.length / 3;
      const geometry = new TubeGeometry(
        count,
        { radial, domeRings: Math.max(1, radial / 4) },
        {
          start: tube.domeStart,
          end: tube.domeEnd,
        },
      );
      geometry.write(
        tube.points,
        0,
        count,
        (i) => tube.radii[i] ?? 0,
        () => 1,
      );
      this.addPhantomMesh(new Mesh(geometry.geometry, lumenMaterial(this.puffDepth.mul(facing()))));
    }
    this.hasFrame = false;
  }

  /** Keeps one mesh per device tube, adding and removing meshes as devices change. */
  syncDevices(tubes: readonly DeviceTube[]): void {
    for (const [tube, mesh] of this.deviceMeshes) {
      if (!tubes.includes(tube)) {
        this.patient.remove(mesh);
        (mesh.material as MeshBasicNodeMaterial).dispose();
        this.deviceMeshes.delete(tube);
      }
    }
    for (const tube of tubes) {
      if (this.deviceMeshes.has(tube)) {
        continue;
      }
      const { look } = tube;
      const ratio = look.outerRadiusMm > 0 ? look.innerRadiusMm / look.outerRadiusMm : 0;
      const n = facing();
      // Chord through the tube wall over the outer diameter: n·v minus the inner circle's share.
      const inner = sqrt(max(float(ratio * ratio).sub(float(1).sub(n.mul(n))), 0));
      const depth = float(opticalDepth(look.opacity))
        .mul(attribute('radiopacity', 'float'))
        .mul(n.sub(inner));
      const mesh = new Mesh(tube.tube.geometry, attenuationMaterial(depth));
      mesh.frustumCulled = false;
      this.patient.add(mesh);
      this.deviceMeshes.set(tube, mesh);
    }
  }

  setSize(width: number, height: number): void {
    this.attenuation.setSize(width, height);
    this.frame.setSize(width, height);
    this.framePass.setSize(width, height);
    this.displayPass.setSize(width, height);
    this.hasFrame = false;
    this.image = 'none';
  }

  render(state: FluoroState): void {
    const phantom = this.phantom;
    if (phantom === null) {
      return;
    }
    const pose = fluoroCameraPose(state.carm, this.carmParams, phantom.isocenter);
    this.camera.fov = pose.fovDeg;
    this.camera.aspect = 1;
    this.camera.near = 1;
    this.camera.far = 2 * (pose.focalToIsocenter + phantom.halfDiagonal + phantom.band.radius);
    this.camera.position.set(...pose.position);
    this.camera.up.set(...pose.up);
    this.camera.lookAt(...pose.target);
    this.camera.updateProjectionMatrix();
    this.patient.position.set(...pose.patientOffset);
    this.puffDepth.value = opticalDepth(this.config.fluoro.contrastPuffMaxOpacity * state.puff);
    this.framePass.setCollimation(state.carm.collimation);

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.attenuation);
    this.renderer.render(this.scene, this.camera);

    if (state.fluoro) {
      const period = 1 / Math.max(Number.EPSILON, state.pulseRate);
      if (!this.wasOn || state.now >= this.nextPulse) {
        this.framePass.setPulse(this.pulseIndex);
        this.pulseIndex += 1;
        this.renderer.setRenderTarget(this.frame);
        this.frameQuad.render(this.renderer);
        this.hasFrame = true;
        // Keep the pulse train on its own schedule, but never fire a burst to catch up.
        this.nextPulse = this.wasOn ? Math.max(this.nextPulse + period, state.now) : state.now + period;
      }
      this.image = 'fluoro';
    } else {
      if (!this.config.fluoro.lastImageHold) {
        this.hasFrame = false;
      }
      this.image = this.hasFrame ? 'hold' : 'none';
    }
    this.wasOn = state.fluoro;

    this.displayPass.setImage(this.hasFrame);
    this.displayPass.setRoadmap(state.roadmap ? this.config.fluoro.roadmapOutlineOpacity : 0);
    this.renderer.setRenderTarget(null);
    this.displayQuad.render(this.renderer);
  }

  dispose(): void {
    this.clearPhantom();
    for (const mesh of this.deviceMeshes.values()) {
      (mesh.material as MeshBasicNodeMaterial).dispose();
    }
    this.deviceMeshes.clear();
    this.attenuation.dispose();
    this.frame.dispose();
    this.framePass.material.dispose();
    this.displayPass.material.dispose();
  }

  private addPhantomMesh(mesh: Mesh): void {
    mesh.frustumCulled = false;
    this.patient.add(mesh);
    this.phantomMeshes.push(mesh);
  }

  private clearPhantom(): void {
    for (const mesh of this.phantomMeshes) {
      this.patient.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicNodeMaterial).dispose();
    }
    this.phantomMeshes.length = 0;
  }
}
