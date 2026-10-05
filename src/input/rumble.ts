/**
 * Rumble (prompts/M1-foundations.md §5). A pure scheduler maps the tip normal force to the weak motor and events to
 * patterns, scaled by the strength setting and clamped to 0..1, and calls the actuator at most `updateRate` times
 * per second. A thin adapter plays the result on a gamepad and does nothing when rumble is unsupported or off.
 */

export type RumblePatternKind = 'single' | 'double' | 'long' | 'pulsed';

export interface RumblePattern {
  readonly pattern: RumblePatternKind;
  readonly strong: number;
  readonly weak: number;
  /** Seconds. */
  readonly duration: number;
  readonly gap: number;
  readonly repeats: number;
}

export interface RumbleConfig {
  /** Hz: the most actuator calls per second. */
  readonly updateRate: number;
  /** Seconds each contact buzz lasts. */
  readonly contactDuration: number;
  /** N: the tip normal force that drives the weak motor at contactWeakMax. */
  readonly contactFullScaleForce: number;
  readonly contactWeakMax: number;
  /** Patterns by event id (the SimEvent type, for example hub-force-danger). */
  readonly events: Readonly<Record<string, RumblePattern>>;
}

export interface RumbleCommand {
  readonly strong: number;
  readonly weak: number;
  /** Seconds. */
  readonly duration: number;
}

interface Pulse {
  readonly start: number;
  readonly strong: number;
  readonly weak: number;
  readonly duration: number;
}

export interface RumbleState {
  /** Time of the last actuator call, s. */
  readonly lastCall: number;
  readonly pulses: readonly Pulse[];
}

export const INITIAL_RUMBLE: RumbleState = { lastCall: Number.NEGATIVE_INFINITY, pulses: [] };

export interface RumbleInput {
  /** Seconds, from any monotonic clock. */
  readonly time: number;
  /** Tip normal force of the device being driven, N. */
  readonly tipForce: number;
  /** Ids of events since the last call. */
  readonly events: readonly string[];
  /** The strength setting, 0..1. */
  readonly strength: number;
  readonly enabled: boolean;
  readonly supported: boolean;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The pulses of an event's pattern, starting now. */
function pulsesOf(pattern: RumblePattern, time: number): Pulse[] {
  const pulse = (start: number): Pulse => ({
    start,
    strong: pattern.strong,
    weak: pattern.weak,
    duration: pattern.duration,
  });
  const period = pattern.duration + pattern.gap;
  switch (pattern.pattern) {
    case 'double':
      return [pulse(time), pulse(time + period)];
    case 'pulsed':
      return Array.from({ length: Math.max(1, pattern.repeats) }, (_, k) => pulse(time + k * period));
    default:
      return [pulse(time)];
  }
}

/** Advances the scheduler; returns the command to play now, if any. */
export function rumbleStep(
  state: RumbleState,
  config: RumbleConfig,
  input: RumbleInput,
): { readonly state: RumbleState; readonly command: RumbleCommand | null } {
  if (!input.enabled || !input.supported) {
    return { state: { ...state, pulses: [] }, command: null };
  }
  const queued = [...state.pulses];
  for (const id of input.events) {
    const pattern = config.events[id];
    if (pattern !== undefined) {
      queued.push(...pulsesOf(pattern, input.time));
    }
  }
  queued.sort((a, b) => a.start - b.start);
  if (input.time - state.lastCall < 1 / config.updateRate) {
    return { state: { ...state, pulses: queued }, command: null };
  }
  const due = queued.filter((pulse) => pulse.start <= input.time);
  const waiting = queued.filter((pulse) => pulse.start > input.time);
  const contact =
    config.contactFullScaleForce > 0
      ? clamp01(input.tipForce / config.contactFullScaleForce) * config.contactWeakMax
      : 0;
  let strong = 0;
  let weak = contact;
  let duration = contact > 0 ? config.contactDuration : 0;
  for (const pulse of due) {
    strong = Math.max(strong, pulse.strong);
    weak = Math.max(weak, pulse.weak);
    duration = Math.max(duration, pulse.duration);
  }
  if (duration <= 0 || (strong <= 0 && weak <= 0)) {
    return { state: { ...state, pulses: waiting }, command: null };
  }
  const command = {
    strong: clamp01(strong * input.strength),
    weak: clamp01(weak * input.strength),
    duration,
  };
  return { state: { lastCall: input.time, pulses: waiting }, command };
}

/** The part of the Gamepad API the adapter uses. */
export interface RumbleGamepad {
  readonly vibrationActuator?: {
    playEffect(type: 'dual-rumble', params: Record<string, number>): Promise<unknown>;
  } | null;
}

export function rumbleSupported(gamepad: RumbleGamepad | null | undefined): boolean {
  return typeof gamepad?.vibrationActuator?.playEffect === 'function';
}

/** Plays a command on a gamepad; does nothing when the pad has no actuator. */
export function playRumble(gamepad: RumbleGamepad | null | undefined, command: RumbleCommand): void {
  const actuator = gamepad?.vibrationActuator;
  if (actuator === undefined || actuator === null || typeof actuator.playEffect !== 'function') {
    return;
  }
  actuator
    .playEffect('dual-rumble', {
      startDelay: 0,
      duration: command.duration * MS_PER_S,
      strongMagnitude: command.strong,
      weakMagnitude: command.weak,
    })
    .catch(() => undefined);
}

const MS_PER_S = 1000;
