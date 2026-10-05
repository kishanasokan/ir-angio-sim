import { findSegment } from '../anatomy/graph';
import { PAD_BUTTONS } from '../core/records';
import { arcAlong, bendEndArc } from './geometry';
import { IDLE_PAD, param, phaseIds, type AutopilotScript } from './types';

/**
 * sandbox-b-bend (prompts/M1-foundations.md §5), phantom B: advance the wire until it leads the catheter by
 * wireLeadOverCatheter; lock the pair and advance both until the catheter tip is catheterPastBend beyond the end of
 * the bend; unlock and pull the wire back until its tip is wireWithdrawBehindCatheterTip behind the catheter tip, so
 * the catheter's tip curve re-forms.
 */

const VESSEL = 'b-main';

const PHASE = phaseIds(['lead', 'lock', 'together', 'unlock', 'withdraw', 'done'] as const);

export const sandboxBBend: AutopilotScript = (_step, view, params, memo) => {
  const wire = view.devices.at(-1);
  const catheter = view.devices.length > 1 ? view.devices[0] : undefined;
  if (wire === undefined || catheter === undefined) {
    return { pad: IDLE_PAD, done: true };
  }
  const advance = param(params, 'advanceSpeed') / param(params, 'fullAdvanceSpeed');
  const bendEnd = bendEndArc(findSegment(view.anatomy, VESSEL));
  const catheterPast = arcAlong(view.anatomy, VESSEL, catheter.tip) - bendEnd;

  let phase = memo[0] ?? PHASE.lead;
  if (phase === PHASE.lead && wire.inserted - catheter.inserted >= param(params, 'wireLeadOverCatheter')) {
    phase = PHASE.lock;
  } else if (phase === PHASE.lock) {
    phase = PHASE.together;
  } else if (phase === PHASE.together && catheterPast >= param(params, 'catheterPastBend')) {
    phase = PHASE.unlock;
  } else if (phase === PHASE.unlock) {
    phase = PHASE.withdraw;
  } else if (
    phase === PHASE.withdraw &&
    catheter.inserted - wire.inserted >= param(params, 'wireWithdrawBehindCatheterTip')
  ) {
    phase = PHASE.done;
  }
  memo[0] = phase;

  switch (phase) {
    case PHASE.lead:
      return { pad: { ...IDLE_PAD, innerPush: advance }, done: false };
    case PHASE.lock:
    case PHASE.unlock:
      // One press of R3 toggles the lock (the next step releases it).
      return { pad: { ...IDLE_PAD, buttons: [PAD_BUTTONS.r3] }, done: false };
    case PHASE.together:
      // Locked, the pair moves as one with the summed sticks (docs/M1-plan.md D20).
      return { pad: { ...IDLE_PAD, innerPush: advance }, done: false };
    case PHASE.withdraw:
      return { pad: { ...IDLE_PAD, innerPush: -advance }, done: false };
    default:
      return { pad: IDLE_PAD, done: true };
  }
};
