import type { SimEngine } from '../../src/sim/engine';
import { drive, fullSpeed, highTier, MM } from './helpers';

/** Golden scene 9's setup, shared with scene 10: catheter K 100 mm past the sheath tip, wire W 10 mm beyond it. */
export const SCENE9 = {
  catheterPast: 100 * MM,
  wireBeyond: 10 * MM,
  /** Catheter K's curve spans its distal 15 mm. */
  curveLength: 15 * MM,
  /** The wire tip ends this far proximal to the curve. */
  behindCurve: 50 * MM,
};

/** Pulls the wire back at full speed until its tip is 50 mm proximal to the catheter's curve. */
export function pullWireBehindCurve(engine: SimEngine, each?: () => void): void {
  const distance = SCENE9.wireBeyond + SCENE9.curveLength + SCENE9.behindCurve;
  drive(engine, Math.round((distance / fullSpeed().advance) * highTier().stepRate), { innerPush: -1 }, each);
}
