/**
 * Rod state on typed arrays.
 *
 * Frame convention (prompts/M1-foundations.md §2; every test uses it):
 * - Nodes run from the handle end (index 0) to the tip (last index N); segment j joins nodes j and j+1.
 * - Each segment's material frame (d1, d2, d3) is right-handed, and d3 points along the segment toward the tip.
 * - At hub rotation 0, d1 is world +x projected perpendicular to the access direction. The phantoms run along +z,
 *   so there d1 = +x, d2 = +y, d3 = +z.
 * - A rest Darboux vector Ω₀ = κ·d2 turns the tip toward d1: d3′ = Ω₀ × d3 = κ·d1. In phantom C at hub rotation 0
 *   the Glidewire's angled tip points toward +x, the left daughter; at 180° toward −x.
 * - Quaternions are stored (x, y, z, w) and rotate world axes onto (d1, d2, d3). Angular velocities are world-frame.
 *
 * SI units throughout (CLAUDE.md rule 5).
 */

export interface RodState {
  readonly rodModelId: string;
  /** Segments N; nodes N + 1. */
  readonly segmentCount: number;
  /** Rest length of every segment, m. */
  readonly segmentLength: number;

  // Nodes (N + 1), packed (x, y, z).
  readonly x: Float64Array;
  readonly xPrev: Float64Array;
  readonly v: Float64Array;
  /** Physical node mass, kg: half of each adjacent segment. */
  readonly mass: Float64Array;
  /** Persistent external force per node, N (test hook applyExternalForce). */
  readonly force: Float64Array;
  /** 1 while the node is kinematic: proximal to the sheath tip (inside the sheath or outside the patient). */
  readonly kinematic: Uint8Array;

  // Segments (N).
  readonly q: Float64Array;
  readonly qPrev: Float64Array;
  /** World-frame angular velocity, rad/s. */
  readonly omega: Float64Array;
  /** Rotational inertia about axes perpendicular to d3 and about d3, kg·m², scaled by solver.rotationalInertiaScale. */
  readonly inertiaPerpendicular: Float64Array;
  readonly inertiaAxial: Float64Array;
  readonly outerRadius: Float64Array;
  readonly innerRadius: Float64Array;
  /** EI and GJ per segment, N·m². */
  readonly bendingStiffness: Float64Array;
  readonly torsionalStiffness: Float64Array;
  readonly massPerLength: Float64Array;

  // Joints (N − 1); joint j joins segments j and j+1 at node j+1.
  /**
   * Rest relative rotation of each joint as 2·sin(θ/2)·axis in the frame of segment j (dimensionless). Dividing by
   * the joint's Voronoi length gives the rest Darboux vector Ω₀, so each joint turns exactly its share of the rest
   * bend (docs/M1-plan.md D9).
   */
  readonly restChord: Float64Array;
  /** Joint EI and GJ, the mean of the two segments, N·m². */
  readonly jointBending: Float64Array;
  readonly jointTorsion: Float64Array;

  // Contact memory per node, for friction.
  /** Lumen contact normal force on each node in the last substep, N (0 when free). */
  readonly contactForce: Float64Array;
  /** Outward lumen normal at each node's last contact. */
  readonly contactNormal: Float64Array;
}
