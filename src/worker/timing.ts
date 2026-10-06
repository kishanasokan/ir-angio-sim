/**
 * Pure timing helpers for the loop (spec 01 §3; docs/M1-plan.md D17, D19). Wall time only decides how far the
 * simulation should have advanced; it never enters the simulation.
 */

export interface LoopClock {
  /** Wall time at which step 0 was due, ms. */
  readonly start: number;
  /** When paused: the wall time the pause began. */
  readonly pausedAt: number | null;
  /** Total paused time so far, ms. */
  readonly paused: number;
}

export function startClock(now: number): LoopClock {
  return { start: now, pausedAt: null, paused: 0 };
}

export function pauseClock(clock: LoopClock, now: number): LoopClock {
  return clock.pausedAt === null ? { ...clock, pausedAt: now } : clock;
}

export function resumeClock(clock: LoopClock, now: number): LoopClock {
  return clock.pausedAt === null
    ? clock
    : { ...clock, pausedAt: null, paused: clock.paused + (now - clock.pausedAt) };
}

/** The step the simulation should have reached at wall time `now`; pausing stops it. */
export function targetStep(clock: LoopClock, now: number, stepRate: number): number {
  const running = (clock.pausedAt ?? now) - clock.start - clock.paused;
  const MS_PER_S = 1000;
  return Math.max(0, Math.floor((running * stepRate) / MS_PER_S));
}

/** Physics milliseconds per rendered frame, from a benchmark's cost per step. */
export function physicsPerFrame(msPerStep: number, stepRate: number, frameRate: number): number {
  return (msPerStep * stepRate) / frameRate;
}

/**
 * The startup tier choice (docs/M1-plan.md D17): the high tier unless its physics costs more than
 * `maxPhysicsPerFrame` per frame, then the fallback.
 */
export function chooseTier(
  highMsPerFrame: number,
  maxPhysicsPerFrame: number,
  high: string,
  fallback: string,
): string {
  return highMsPerFrame > maxPhysicsPerFrame ? fallback : high;
}

/**
 * The next target step for a message: wall time's step, never behind what was already requested and at most
 * `maxSteps` ahead of it, because the worker runs at most that many steps per message (spec 01 §3).
 */
export function nextTarget(requested: number, wallStep: number, maxSteps: number): number {
  return Math.min(Math.max(requested, wallStep), requested + maxSteps);
}

/**
 * Moves the clock so that wall time `now` maps to `step`. When the worker cannot keep up, the capped target becomes
 * the new present: the simulation runs in slow motion and never races to catch up, and input applies at once.
 */
export function slipClock(clock: LoopClock, now: number, step: number, stepRate: number): LoopClock {
  const MS_PER_S = 1000;
  const elapsed = (step * MS_PER_S) / stepRate;
  const reference = clock.pausedAt ?? now;
  return { ...clock, start: reference - clock.paused - elapsed };
}
