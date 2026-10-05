import type { InputAxes } from '../core/records';
import { MIN_DEVICES_TO_MOVE_PAIR } from '../core/types';

/**
 * The device stack (prompts/M1-foundations.md §2). The sheath is fixed and not part of it. Movable devices are
 * ordered outermost first, for example (catheter, wire), and the sticks drive the active pair: the left stick the
 * outer device, the right stick the inner one. With a single device it is the inner device (docs/M1-plan.md D11).
 * D-pad up and down move the active pair only when three or more movable devices exist. Lock moves both devices of
 * the pair as one; every device the sticks do not drive keeps its insertion depth L and hub rotation φ.
 */

export interface StackState {
  readonly count: number;
  /** Index of the active pair's outer device, or −1 when the pair is a lone device. */
  readonly activeOuter: number;
  readonly locked: boolean;
}

export function createStack(count: number): StackState {
  // The innermost pair starts active: the devices doing the work at the tip.
  return { count, activeOuter: count >= 2 ? count - 2 : -1, locked: false };
}

/** The active pair as (outer, inner) device indices; outer is −1 for a lone device. */
export function activePair(stack: StackState): { readonly outer: number; readonly inner: number } {
  if (stack.activeOuter < 0) {
    return { outer: -1, inner: stack.count - 1 };
  }
  return { outer: stack.activeOuter, inner: stack.activeOuter + 1 };
}

/** Moves the active pair by delta along the stack (positive = inward); a no-op with fewer than three devices. */
export function moveActivePair(stack: StackState, delta: number): StackState {
  if (stack.count < MIN_DEVICES_TO_MOVE_PAIR) {
    return stack;
  }
  const activeOuter = Math.min(stack.count - 2, Math.max(0, stack.activeOuter + delta));
  return activeOuter === stack.activeOuter ? stack : { ...stack, activeOuter };
}

export function toggleLock(stack: StackState): StackState {
  return { ...stack, locked: !stack.locked };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

/**
 * Normalized push and rotate inputs (−1..1) for every device. When the pair is locked, both sticks' inputs are
 * summed, clamped and drive both devices together (docs/M1-plan.md D20).
 */
export function deviceInputs(
  stack: StackState,
  axes: InputAxes,
): { readonly push: readonly number[]; readonly rotate: readonly number[] } {
  const push = new Array<number>(stack.count).fill(0);
  const rotate = new Array<number>(stack.count).fill(0);
  const { outer, inner } = activePair(stack);
  if (stack.locked && outer >= 0) {
    const lockedPush = clampUnit(axes.outerPush + axes.innerPush);
    const lockedRotate = clampUnit(axes.outerRotate + axes.innerRotate);
    push[outer] = lockedPush;
    push[inner] = lockedPush;
    rotate[outer] = lockedRotate;
    rotate[inner] = lockedRotate;
    return { push, rotate };
  }
  if (outer >= 0) {
    push[outer] = axes.outerPush;
    rotate[outer] = axes.outerRotate;
  }
  if (inner >= 0) {
    push[inner] = axes.innerPush;
    rotate[inner] = axes.innerRotate;
  }
  return { push, rotate };
}
