import { arcAlong } from './geometry';
import { IDLE_PAD, param, phaseIds, type AutopilotScript } from './types';

/**
 * sandbox-a-buckle (prompts/M1-foundations.md §5), phantom A, deliberately bad: advance the wire at pushSpeed until
 * the tip stalls at the cap, then push extraPush more at pushSpeed. The wire buckles, the resistance meter goes red
 * and rumble fires.
 *
 * The tip stalls when, over a window of stallTime, it advances along the vessel centerline less than
 * stallSpeed·stallTime: at the rounded cap it keeps sliding sideways, so its total speed never settles.
 * Memo: phase, the window's first step and the tip's arc then, and L at the stall.
 */

const PHASE = phaseIds(['moving', 'push', 'done'] as const);
const WINDOW_STEP = 1;
const WINDOW_ARC = 2;
const STALL_L = WINDOW_ARC + 1;

export const sandboxABuckle: AutopilotScript = (step, view, params, memo) => {
  const wire = view.devices.at(-1);
  if (wire === undefined) {
    return { pad: IDLE_PAD, done: true };
  }
  const push = param(params, 'pushSpeed') / param(params, 'fullAdvanceSpeed');
  const stallTime = param(params, 'stallTime');
  const arc = wire.tipSegmentId === null ? 0 : arcAlong(view.anatomy, wire.tipSegmentId, wire.tip);

  let phase = memo[0] ?? PHASE.moving;
  if (phase === PHASE.moving) {
    const start = memo[WINDOW_STEP] ?? 0;
    if (start <= 0) {
      memo[WINDOW_STEP] = step + 1;
      memo[WINDOW_ARC] = arc;
    } else if ((step + 1 - start) / view.stepRate >= stallTime) {
      if (arc - (memo[WINDOW_ARC] ?? arc) < param(params, 'stallSpeed') * stallTime) {
        memo[STALL_L] = wire.inserted;
        phase = PHASE.push;
      } else {
        memo[WINDOW_STEP] = step + 1;
        memo[WINDOW_ARC] = arc;
      }
    }
  }
  if (phase === PHASE.push && wire.inserted >= (memo[STALL_L] ?? 0) + param(params, 'extraPush')) {
    phase = PHASE.done;
  }
  memo[0] = phase;
  return phase === PHASE.done
    ? { pad: IDLE_PAD, done: true }
    : { pad: { ...IDLE_PAD, innerPush: push }, done: false };
};
