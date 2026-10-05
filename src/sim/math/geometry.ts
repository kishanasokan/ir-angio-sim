/** Rigid-body properties of a rod segment, a hollow cylinder along its own d3 axis. */

export interface SegmentInertia {
  /** About an axis perpendicular to d3 through the segment's center, kg·m². */
  readonly perpendicular: number;
  /** About d3, kg·m². */
  readonly axial: number;
}

/**
 * Inertia of a hollow cylinder of mass m, radii rₒ and rᵢ and length l: I⊥ = m(3(rₒ² + rᵢ²) + l²)/12 and
 * I∥ = m(rₒ² + rᵢ²)/2.
 */
export function cylinderInertia(
  mass: number,
  outerRadius: number,
  innerRadius: number,
  length: number,
): SegmentInertia {
  const radii2 = outerRadius * outerRadius + innerRadius * innerRadius;
  return {
    perpendicular: (mass * (3 * radii2 + length * length)) / 12,
    axial: (mass * radii2) / 2,
  };
}
