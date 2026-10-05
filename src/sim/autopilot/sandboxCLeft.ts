import { centerlineLength, findSegment } from '../anatomy/graph';
import { stepsIn } from '../core/clock';
import { PAD_BUTTONS } from '../core/records';
import { cos } from '../math/detTrig';
import { alignedWithin, arcAlong } from './geometry';
import { IDLE_PAD, param, phaseIds, type AutopilotScript, type Vec3, type VirtualPad } from './types';

/**
 * sandbox-c-left (prompts/M1-foundations.md §5; docs/M1-plan.md D1), phantom C, with the wire starting at hub rotation
 * 180°: advance the wire until its tip is wireStopBelowCarina below the carina; turn it until the tip's bend points
 * into the left daughter within tipAlignTolerance; advance it until its tip is wireAdvanceIntoBranch past the carina
 * (backing off and turning again if it enters the right daughter); then advance the catheter until its tip is
 * catheterPastCarina past the carina. Fluoro is held for fluoroTapLength every fluoroTapEvery.
 */

const PARENT = 'c-parent';
const LEFT = 'c-left';
const RIGHT = 'c-right';

const PHASE = phaseIds(['approach', 'turn', 'branch', 'retreat', 'catheter', 'done'] as const);

export const sandboxCLeft: AutopilotScript = (step, view, params, memo) => {
  const wire = view.devices.at(-1);
  const catheter = view.devices.length > 1 ? view.devices[0] : undefined;
  if (wire === undefined || catheter === undefined) {
    return { pad: IDLE_PAD, done: true };
  }
  const advance = param(params, 'advanceSpeed') / param(params, 'fullAdvanceSpeed');
  const rotate = param(params, 'rotateSpeed') / param(params, 'fullRotateSpeed');
  const parent = findSegment(view.anatomy, PARENT);
  const left = findSegment(view.anatomy, LEFT);
  const carina = centerlineLength(parent);
  const stopArc = carina - param(params, 'wireStopBelowCarina');

  // Fluoro taps: LT held for the first fluoroTapLength of every fluoroTapEvery.
  const every = Math.max(1, stepsIn(param(params, 'fluoroTapEvery'), view.stepRate));
  const tap = step % every < stepsIn(param(params, 'fluoroTapLength'), view.stepRate);
  const buttons = tap ? [PAD_BUTTONS.lt] : [];
  const pad = (fields: Partial<VirtualPad>): VirtualPad => ({ ...IDLE_PAD, buttons, ...fields });

  const wireArc = arcAlong(view.anatomy, PARENT, wire.tip);
  const wirePast = wire.tipSegmentId === LEFT ? arcAlong(view.anatomy, LEFT, wire.tip) : 0;
  // The left daughter's direction where it leaves the carina: the way the tip must face.
  const a = left.centerline[0] ?? [0, 0, 0];
  const b = left.centerline[1] ?? a;
  const target: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const aligned =
    wire.bendDirection !== null &&
    alignedWithin(wire.bendDirection, target, wire.bodyTangent, cos(param(params, 'tipAlignTolerance')));

  let phase = memo[0] ?? PHASE.approach;
  if (phase === PHASE.approach && wireArc >= stopArc) {
    phase = PHASE.turn;
  }
  if (phase === PHASE.turn && aligned) {
    phase = PHASE.branch;
  }
  if (phase === PHASE.branch && wire.tipSegmentId === RIGHT) {
    phase = PHASE.retreat;
  }
  if (phase === PHASE.branch && wirePast >= param(params, 'wireAdvanceIntoBranch')) {
    phase = PHASE.catheter;
  }
  if (phase === PHASE.retreat && wire.tipSegmentId === PARENT && wireArc <= stopArc) {
    phase = PHASE.turn;
  }
  const catheterPast = catheter.tipSegmentId === LEFT ? arcAlong(view.anatomy, LEFT, catheter.tip) : 0;
  if (phase === PHASE.catheter && catheterPast >= param(params, 'catheterPastCarina')) {
    phase = PHASE.done;
  }
  memo[0] = phase;

  switch (phase) {
    case PHASE.approach:
    case PHASE.branch:
      return { pad: pad({ innerPush: advance }), done: false };
    case PHASE.turn: {
      // Turn the short way: +φ turns the bend from d1 toward d2, counterclockwise about the tangent.
      const bend = wire.bendDirection ?? target;
      const t = wire.bodyTangent;
      const twist =
        (bend[1] * target[2] - bend[2] * target[1]) * t[0] +
        (bend[2] * target[0] - bend[0] * target[2]) * t[1] +
        (bend[0] * target[1] - bend[1] * target[0]) * t[2];
      return { pad: pad({ innerRotate: twist >= 0 ? rotate : -rotate }), done: false };
    }
    case PHASE.retreat:
      return { pad: pad({ innerPush: -advance }), done: false };
    case PHASE.catheter:
      return { pad: pad({ outerPush: advance }), done: false };
    default:
      return { pad: IDLE_PAD, done: true };
  }
};
