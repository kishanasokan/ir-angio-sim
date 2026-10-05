/**
 * What the simulation needs from a device instance (spec 02 §7.3). The data layer's catalog builds these values
 * from /data, converted to SI and laid out per segment for the tier; any object with this shape works, which keeps
 * src/sim independent of src/data (spec 01 §2).
 */
export interface SimDeviceSpec {
  readonly rodModelId: string;
  readonly segments: {
    /** Segments N, laid out from the handle (0) to the tip (N − 1). */
    readonly count: number;
    /** Rest length of every segment, m. */
    readonly length: number;
    readonly outerRadius: Float64Array;
    readonly innerRadius: Float64Array;
    /** EI, N·m². */
    readonly bendingStiffness: Float64Array;
    /** GJ, N·m². */
    readonly torsionalStiffness: Float64Array;
    /** kg/m. */
    readonly massPerLength: Float64Array;
  };
  readonly restShape: {
    readonly distribution: {
      /** Rest bend per joint toward d1 and toward d2, radians; joint j joins segments j and j+1. */
      readonly towardD1: Float64Array;
      readonly towardD2: Float64Array;
    };
  };
  /** Coulomb coefficient against the vessel wall. */
  readonly wallFriction: { readonly value: number };
  /** Coulomb coefficient inside this device's lumen; null for wires. */
  readonly lumenFriction: { readonly value: number } | null;
}
