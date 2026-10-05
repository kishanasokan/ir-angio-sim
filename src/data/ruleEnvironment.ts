import type { Aggregate, Resolved, RuleEnvironment, RuleSpec } from '../sim/rules/compatibility';
import { resolveItemPath, type ItemInstance } from './catalog';
import type { Repository } from './loaders';
import { isConvertibleUnit, valueToSI } from './units';

/**
 * The data side of the compatibility engine: resolves rule paths against device instances, the case and
 * tuning/physics ruleParameters (spec 02 §8), with numbers converted to SI once, here.
 */

/** A fact's value in SI, or missing. */
function factValue(fact: unknown, what: string): Resolved {
  if (typeof fact !== 'object' || fact === null) {
    return { status: 'missing', reason: `no ${what}` };
  }
  const record = fact as { value?: unknown; unit?: unknown };
  if (typeof record.value === 'number' && isConvertibleUnit(record.unit)) {
    return { status: 'resolved', value: valueToSI(record.value, record.unit) };
  }
  if (typeof record.value === 'number' || typeof record.value === 'string' || typeof record.value === 'boolean') {
    return { status: 'resolved', value: record.value };
  }
  return { status: 'missing', reason: `${what} has no single value` };
}

/**
 * A rule environment for devices by role (for example {catheter, sheath}), in a case. State predicates are left out,
 * so state rules are skipped: this is the static check that sandbox setup and the device picker use.
 */
export function ruleEnvironment(
  repository: Repository,
  instances: Readonly<Record<string, ItemInstance>>,
  caseId?: string,
): RuleEnvironment {
  return {
    resolve(path: string, aggregate?: Aggregate): Resolved {
      const dot = path.indexOf('.');
      const prefix = dot < 0 ? path : path.slice(0, dot);
      const rest = dot < 0 ? '' : path.slice(dot + 1);
      if (prefix === 'case') {
        const data = caseId === undefined ? undefined : repository.cases.get(caseId);
        if (data === undefined) {
          return { status: 'missing', reason: `${path} needs a case` };
        }
        return factValue((data as Record<string, unknown>)[rest], path);
      }
      if (prefix === 'tuning') {
        return factValue(repository.physics.ruleParameters[rest], path);
      }
      const instance = instances[prefix];
      if (instance === undefined) {
        return { status: 'missing', reason: `no ${prefix} device for ${path}` };
      }
      const resolved = resolveItemPath(instance, rest, aggregate);
      if (resolved.status === 'missing') {
        return { status: 'missing', reason: resolved.reason };
      }
      return { status: 'resolved', value: resolved.valueSI ?? resolved.value };
    },
    sourceTitle(sourceId: string | undefined): string {
      return sourceId === undefined ? '' : (repository.sources.get(sourceId)?.title ?? sourceId);
    },
  };
}

/** The rules file's rules in the engine's shape. */
export function ruleSpecs(repository: Repository): readonly RuleSpec[] {
  return repository.rules.rules;
}
