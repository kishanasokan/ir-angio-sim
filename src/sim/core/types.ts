/**
 * Array layouts and numerical guards shared by the simulation. This folder may hold numeric constants
 * (golden rule 3 override for array strides, hash and PRNG constants).
 */

/** Components per 3-vector in packed Float64Arrays. */
export const VEC3 = 3;
/** Components per quaternion, stored (x, y, z, w). */
export const QUAT = 4;
/** Offsets of the x, y and z components in a packed 3-vector, and of w in a quaternion. */
export const X = 0;
export const Y = 1;
export const Z = 2;
export const W = 3;

/** Entries in a 3×3 matrix stored row-major. */
export const MAT3 = 9;

/**
 * The direct solver works on units of seven constraint rows per dynamic segment: the bend-twist joint at the
 * segment's proximal end (three rows), the segment's stretch-shear constraint (three rows) and the lumen contact of
 * its distal node (one row, a dummy when no contact is active).
 */
export const UNIT_ROWS = 7;
export const BEND_ROW = 0;
export const STRETCH_ROW = 3;
export const CONTACT_ROW = 6;
export const UNIT_BLOCK = UNIT_ROWS * UNIT_ROWS;

/** The three row groups of a unit, their first rows and their sizes. */
export const GROUP_BEND = 0;
export const GROUP_STRETCH = 1;
export const GROUP_CONTACT = 2;
export const GROUPS_PER_UNIT = 3;
export const GROUP_ROW: readonly number[] = [BEND_ROW, STRETCH_ROW, CONTACT_ROW];
export const GROUP_SIZE: readonly number[] = [3, 3, 1];
/** Most variables one row group touches: the junction's stretch rows touch four. */
export const MAX_ENTRIES = 4;
/** The bend rows: two bending components and twist. */
export const BEND_COMPONENTS = 3;

/** Unit factors for snapshots, which carry millimetres and degrees for rendering and the HUD (spec 01 §5). */
export const MILLIMETRES_PER_METRE = 1000;
export const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Guards against division by zero when normalizing; far below any physical length or angle in the sim. */
export const TINY = 1e-15;

/**
 * Positions closer than this to a boundary (for example a node exactly at the sheath tip) count as on it. Far
 * below any physical length in the simulation; it only absorbs floating-point noise in metre values.
 */
export const LENGTH_EPSILON = 1e-12;

/** The active device pair moves along the stack only with at least this many movable devices (prompts/M1-foundations.md §2). */
export const MIN_DEVICES_TO_MOVE_PAIR = 3;

/** Values that describe a device's kinematic placement: L, φ and their two rates. */
export const PLACEMENT_VALUES = 4;

/** Memo slots an autopilot script may use: its phase and three values (docs/M1-plan.md D7). */
export const AUTOPILOT_MEMO_SLOTS = 4;
