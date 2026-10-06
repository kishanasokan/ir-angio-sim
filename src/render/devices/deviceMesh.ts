import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three/webgpu';
import type { DeviceLook } from '../../data/renderConfig';
import type { DeviceSnapshot } from '../../sim/snapshot';
import { createTubeBuffers, tubeSize, writeTube, type TubeBuffers, type TubeLayout } from '../geometry/tube';

/**
 * Tube geometry for both views (prompts/M1-foundations.md §6): devices are rebuilt every frame from the snapshot's
 * nodes, vessels once from their centerlines. Buffers are sized once for the most points a tube can have, then
 * rewritten in place, so a frame allocates nothing. Each vertex carries a `radiopacity` value for the fluoro view.
 * Meshes using these geometries turn frustum culling off: the buffers hold stale vertices past the draw range, and the
 * views are small enough to draw whole.
 */

export class TubeGeometry {
  readonly geometry = new BufferGeometry();
  private readonly buffers: TubeBuffers;
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute;
  private readonly value: BufferAttribute;
  private readonly index: BufferAttribute;

  constructor(
    capacity: number,
    private readonly layout: TubeLayout,
    private readonly domes: { readonly start: boolean; readonly end: boolean },
  ) {
    const size = tubeSize(capacity, layout, domes);
    this.buffers = createTubeBuffers(size.vertices, size.indices);
    this.position = new BufferAttribute(this.buffers.positions, 3).setUsage(DynamicDrawUsage);
    this.normal = new BufferAttribute(this.buffers.normals, 3).setUsage(DynamicDrawUsage);
    this.value = new BufferAttribute(this.buffers.values, 1).setUsage(DynamicDrawUsage);
    this.index = new BufferAttribute(this.buffers.indices, 1).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('normal', this.normal);
    this.geometry.setAttribute('radiopacity', this.value);
    this.geometry.setIndex(this.index);
    this.geometry.setDrawRange(0, 0);
  }

  /** Rewrites the tube around `count` points of `points`, starting at point `offset`. */
  write(
    points: ArrayLike<number>,
    offset: number,
    count: number,
    radius: (i: number) => number,
    value: (i: number) => number,
  ): void {
    const written = writeTube(points, offset, count, radius, value, this.layout, this.domes, this.buffers);
    this.geometry.setDrawRange(0, written.indices);
    this.position.needsUpdate = true;
    this.normal.needsUpdate = true;
    this.value.needsUpdate = true;
    this.index.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** A device's tube, from the sheath valve to the tip: the part outside the patient is never drawn. */
export class DeviceTube {
  readonly tube: TubeGeometry;

  constructor(
    readonly look: DeviceLook,
    nodeCount: number,
    radial: number,
  ) {
    // Devices end in a round tip; the handle end lies outside the patient and stays open.
    this.tube = new TubeGeometry(
      nodeCount,
      { radial, domeRings: Math.max(1, radial / 4) },
      { start: false, end: true },
    );
  }

  update(device: DeviceSnapshot): void {
    const nodes = device.positionsMm.length / 3;
    const segments = nodes - 1;
    // Nodes within the inserted length of the tip, plus one, so the tube reaches the valve.
    const inside = Math.min(segments, Math.ceil(device.insertedMm / this.look.segmentLengthMm) + 1);
    if (device.insertedMm <= 0 || inside < 1) {
      this.tube.geometry.setDrawRange(0, 0);
      return;
    }
    const first = segments - inside;
    const { radiopacity, outerRadiusMm } = this.look;
    this.tube.write(
      device.positionsMm,
      first,
      inside + 1,
      () => outerRadiusMm,
      (i) => radiopacity[Math.min(segments - 1, first + i)] ?? 1,
    );
  }

  dispose(): void {
    this.tube.dispose();
  }
}
