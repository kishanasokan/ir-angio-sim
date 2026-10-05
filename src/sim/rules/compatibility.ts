import {
  statusOfFailure,
  type CompatibilityResult,
  type CompatibilityStatus,
  type FailureMode,
} from './reasons';

/**
 * The compatibility engine (prompts/M1-foundations.md §3; spec 02 §8): evaluates rules for a pairing of device
 * instances. It is pure. The data layer resolves paths to values (SI numbers, text or flags), so the simulation never
 * reads /data itself. A value that cannot be resolved makes the rule unknown, never allow.
 */

export type Aggregate = 'max' | 'min';

export type Check =
  | {
      readonly type: 'lte' | 'lt';
      readonly left: string;
      readonly right: string;
      readonly leftAgg?: Aggregate;
      readonly rightAgg?: Aggregate;
    }
  | { readonly type: 'all'; readonly of: readonly Check[] }
  | { readonly type: 'sum-lte'; readonly terms: readonly string[]; readonly limit: string }
  | {
      readonly type: 'flag-required';
      readonly flag: string;
      readonly when: { readonly path: string; readonly equals: string | number | boolean };
    }
  | { readonly type: 'device-specific'; readonly field: string }
  | { readonly type: 'state'; readonly condition: string };

/** A rule as data/rules/compatibility.json holds it. */
export interface RuleSpec {
  readonly id: string;
  readonly text: string;
  readonly pair?: readonly [string, string];
  readonly check: Check;
  readonly failure: { readonly mode: FailureMode; readonly message: string };
  readonly source?: string;
}

export type Resolved =
  | { readonly status: 'resolved'; readonly value: number | string | boolean }
  | { readonly status: 'missing'; readonly reason: string };

/** Named code for a device-specific check: true passes, false fails, null when it cannot tell. */
export type DeviceSpecificCheck = (environment: RuleEnvironment) => boolean | null;

export interface RuleEnvironment {
  /** Resolves a role-prefixed path (wire.geometry.diameter), or a case. or tuning. path. Numbers are SI. */
  resolve(path: string, aggregate?: Aggregate): Resolved;
  /** The title of a source id, for the learner message; empty when there is none. */
  sourceTitle(sourceId: string | undefined): string;
  /** Device-specific checks by rule id. M1 has none, so those rules are unknown (D12). */
  readonly deviceSpecific?: Readonly<Record<string, DeviceSpecificCheck>>;
  /** State predicates by condition name, evaluated by the engine. Static checks leave this out and skip state rules. */
  readonly state?: Readonly<Record<string, () => boolean>>;
}

type Outcome =
  | { readonly kind: 'pass' }
  | { readonly kind: 'fail' }
  | { readonly kind: 'unknown'; readonly reason: string };

const PASS: Outcome = { kind: 'pass' };
const FAIL: Outcome = { kind: 'fail' };

function numberAt(environment: RuleEnvironment, path: string, aggregate?: Aggregate): number | Outcome {
  const resolved = environment.resolve(path, aggregate);
  if (resolved.status === 'missing') {
    return { kind: 'unknown', reason: resolved.reason };
  }
  if (typeof resolved.value !== 'number') {
    return { kind: 'unknown', reason: `${path} is not a number` };
  }
  return resolved.value;
}

function evaluateCheck(check: Check, rule: RuleSpec, environment: RuleEnvironment): Outcome {
  switch (check.type) {
    case 'lte':
    case 'lt': {
      const left = numberAt(environment, check.left, check.leftAgg);
      if (typeof left !== 'number') {
        return left;
      }
      const right = numberAt(environment, check.right, check.rightAgg);
      if (typeof right !== 'number') {
        return right;
      }
      return (check.type === 'lte' ? left <= right : left < right) ? PASS : FAIL;
    }
    case 'all': {
      let unknown: Outcome | null = null;
      for (const part of check.of) {
        const outcome = evaluateCheck(part, rule, environment);
        if (outcome.kind === 'fail') {
          return outcome;
        }
        if (outcome.kind === 'unknown' && unknown === null) {
          unknown = outcome;
        }
      }
      return unknown ?? PASS;
    }
    case 'sum-lte': {
      let sum = 0;
      for (const term of check.terms) {
        const value = numberAt(environment, term);
        if (typeof value !== 'number') {
          return value;
        }
        sum += value;
      }
      const limit = numberAt(environment, check.limit);
      if (typeof limit !== 'number') {
        return limit;
      }
      return sum <= limit ? PASS : FAIL;
    }
    case 'flag-required': {
      const when = environment.resolve(check.when.path);
      if (when.status === 'missing') {
        return { kind: 'unknown', reason: when.reason };
      }
      if (when.value !== check.when.equals) {
        return PASS;
      }
      const flag = environment.resolve(check.flag);
      if (flag.status === 'missing') {
        return { kind: 'unknown', reason: flag.reason };
      }
      return flag.value === true ? PASS : FAIL;
    }
    case 'device-specific': {
      const named = environment.deviceSpecific?.[rule.id];
      if (named === undefined) {
        return { kind: 'unknown', reason: `${rule.id} needs a device-specific check that is not built yet` };
      }
      const result = named(environment);
      return result === null
        ? { kind: 'unknown', reason: `${rule.id} could not be checked for ${check.field}` }
        : result
          ? PASS
          : FAIL;
    }
    case 'state': {
      const predicate = environment.state?.[check.condition];
      if (predicate === undefined) {
        return { kind: 'unknown', reason: `no state predicate "${check.condition}"` };
      }
      return predicate() ? PASS : FAIL;
    }
  }
}

/** True when a rule's check, at any depth, reads simulation state. */
export function isStateRule(rule: RuleSpec): boolean {
  const reads = (check: Check): boolean =>
    check.type === 'state' || (check.type === 'all' && check.of.some(reads));
  return reads(rule.check);
}

/** Evaluates one rule. Returns null for a state rule when the environment has no state (a static check skips it). */
export function evaluateRule(rule: RuleSpec, environment: RuleEnvironment): CompatibilityResult | null {
  if (environment.state === undefined && isStateRule(rule)) {
    return null;
  }
  const outcome = evaluateCheck(rule.check, rule, environment);
  const sourceTitle = environment.sourceTitle(rule.source);
  const base = { ruleId: rule.id, mode: rule.failure.mode, sourceTitle };
  if (outcome.kind === 'pass') {
    return { ...base, status: 'allow', message: '' };
  }
  if (outcome.kind === 'unknown') {
    return { ...base, status: 'unknown', message: outcome.reason };
  }
  return { ...base, status: statusOfFailure(rule.failure.mode), message: rule.failure.message };
}

/** The roles a device kind plays, from the rules file's roles table. */
export function rolesOfKind(roles: Readonly<Record<string, readonly string[]>>, kind: string): string[] {
  return Object.entries(roles)
    .filter(([, kinds]) => kinds.includes(kind))
    .map(([role]) => role);
}

/**
 * Rules that apply to two devices: those whose pair names a role of each. Returns each rule with the role each device
 * plays in it, so the caller can resolve paths for the right device.
 */
export function rulesForPair(
  rules: readonly RuleSpec[],
  roles: Readonly<Record<string, readonly string[]>>,
  kindA: string,
  kindB: string,
): { readonly rule: RuleSpec; readonly roleA: string; readonly roleB: string }[] {
  const rolesA = rolesOfKind(roles, kindA);
  const rolesB = rolesOfKind(roles, kindB);
  const matches: { rule: RuleSpec; roleA: string; roleB: string }[] = [];
  for (const rule of rules) {
    if (rule.pair === undefined) {
      continue;
    }
    const [first, second] = rule.pair;
    if (rolesA.includes(first) && rolesB.includes(second)) {
      matches.push({ rule, roleA: first, roleB: second });
    } else if (rolesA.includes(second) && rolesB.includes(first)) {
      matches.push({ rule, roleA: second, roleB: first });
    }
  }
  return matches;
}

/** The most serious of several results: block, then degrade, then unknown, then allow. */
export function worstResult(results: readonly CompatibilityResult[]): CompatibilityResult | null {
  let worst: CompatibilityResult | null = null;
  for (const result of results) {
    if (worst === null || SEVERITY.indexOf(result.status) > SEVERITY.indexOf(worst.status)) {
      worst = result;
    }
  }
  return worst;
}

/** Statuses from least to most serious. */
const SEVERITY: readonly CompatibilityStatus[] = ['allow', 'unknown', 'degrade', 'block'];
