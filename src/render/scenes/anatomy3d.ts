import {
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { RenderConfig } from '../../data/renderConfig';
import { viewBasis } from '../../sim/imaging/carm';
import { TubeGeometry, type DeviceTube } from '../devices/deviceMesh';
import type { PhantomShape } from './phantom';

/**
 * The 3D anatomy view (View or G; prompts/M1-foundations.md §6): the phantom's lumen as a lit translucent tube, devices
 * as tube meshes rebuilt each frame from the snapshot (the same geometry the fluoro view draws), the sheath, and an
 * orbit camera. The camera starts on the detector side looking along the beam, so the view opens the way the fluoro
 * image is oriented (patient left on screen right in AP). Alt with the mouse orbits, zooms and pans, because the
 * mouse alone drives the devices.
 */

export class Anatomy3dView {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly phantomGroup = new Group();
  private readonly deviceMeshes = new Map<DeviceTube, Mesh>();
  private phantom: PhantomShape | null = null;
  private readonly onKey = (event: KeyboardEvent) => {
    this.controls.enabled = event.altKey;
  };
  private readonly onBlur = () => {
    this.controls.enabled = false;
  };

  constructor(
    renderer: WebGPURenderer,
    private readonly config: RenderConfig,
  ) {
    const { threeD } = config;
    this.scene.background = new Color(threeD.backgroundColor);
    this.camera = new PerspectiveCamera(threeD.cameraFovDeg, 1, 1, 1);
    const hemisphere = new HemisphereLight(
      0xffffff,
      new Color(threeD.backgroundColor),
      threeD.hemisphereLightIntensity,
    );
    const key = new DirectionalLight(0xffffff, threeD.keyLightIntensity);
    // The key light rides with the camera, up and to the left of it.
    key.position.set(-1, 1, 1);
    this.camera.add(key);
    this.scene.add(hemisphere, this.camera, this.phantomGroup);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  setPhantom(shape: PhantomShape, sheathRadiusMm: number): void {
    for (const child of [...this.phantomGroup.children]) {
      this.phantomGroup.remove(child);
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardNodeMaterial).dispose();
    }
    this.phantom = shape;
    const { threeD, tubeRadialSegments: radial } = this.config;
    const domeRings = Math.max(1, radial / 4);
    for (const tube of shape.tubes) {
      const count = tube.points.length / 3;
      const geometry = new TubeGeometry(
        count,
        { radial, domeRings },
        { start: tube.domeStart, end: tube.domeEnd },
      );
      geometry.write(
        tube.points,
        0,
        count,
        (i) => tube.radii[i] ?? 0,
        () => 1,
      );
      const material = new MeshStandardNodeMaterial({
        color: new Color(threeD.vesselColor),
        transparent: true,
        opacity: threeD.vesselOpacity,
        depthWrite: false,
        side: DoubleSide,
        roughness: threeD.surfaceRoughness,
        metalness: 0,
      });
      const mesh = new Mesh(geometry.geometry, material);
      mesh.frustumCulled = false;
      // Translucent lumen after the opaque devices.
      mesh.renderOrder = 1;
      this.phantomGroup.add(mesh);
    }
    const sheath = new TubeGeometry(2, { radial, domeRings: 0 }, { start: false, end: false });
    const ends = new Float32Array([...shape.sheath.valve, ...shape.sheath.tip]);
    sheath.write(
      ends,
      0,
      2,
      () => sheathRadiusMm,
      () => 1,
    );
    const sheathMesh = new Mesh(
      sheath.geometry,
      new MeshStandardNodeMaterial({
        color: new Color(threeD.sheathColor),
        roughness: threeD.surfaceRoughness,
        metalness: 0,
      }),
    );
    sheathMesh.frustumCulled = false;
    this.phantomGroup.add(sheathMesh);
  }

  /** Points the camera along the C-arm's beam from the detector side, framing the phantom. */
  frame(rotation: number, angulation: number): void {
    const phantom = this.phantom;
    if (phantom === null) {
      return;
    }
    const { forward, up } = viewBasis(rotation, angulation);
    const distance = this.config.threeD.cameraDistance * 2 * phantom.halfDiagonal;
    const [cx, cy, cz] = phantom.isocenter;
    this.camera.position.set(
      cx + forward[0] * distance,
      cy + forward[1] * distance,
      cz + forward[2] * distance,
    );
    this.camera.up.set(...up);
    this.camera.near = Math.max(1, distance - 2 * phantom.halfDiagonal);
    this.camera.far = distance + 4 * phantom.halfDiagonal;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(cx, cy, cz);
    this.controls.update();
  }

  syncDevices(tubes: readonly DeviceTube[]): void {
    for (const [tube, mesh] of this.deviceMeshes) {
      if (!tubes.includes(tube)) {
        this.scene.remove(mesh);
        (mesh.material as MeshStandardNodeMaterial).dispose();
        this.deviceMeshes.delete(tube);
      }
    }
    for (const tube of tubes) {
      if (this.deviceMeshes.has(tube)) {
        continue;
      }
      const material = new MeshStandardNodeMaterial({
        color: new Color(tube.look.color),
        roughness: this.config.threeD.surfaceRoughness,
        metalness: 0,
      });
      const mesh = new Mesh(tube.tube.geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.deviceMeshes.set(tube, mesh);
    }
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(renderer: WebGPURenderer): void {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
    this.controls.dispose();
    for (const mesh of this.deviceMeshes.values()) {
      (mesh.material as MeshStandardNodeMaterial).dispose();
    }
    for (const child of this.phantomGroup.children) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshStandardNodeMaterial).dispose();
    }
  }
}
