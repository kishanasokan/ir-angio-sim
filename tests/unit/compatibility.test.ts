import { describe, expect, it } from 'vitest';
import { buildItemInstance, buildRodInstance, type ItemInstance } from '../../src/data/catalog';
import { ruleEnvironment, ruleSpecs } from '../../src/data/ruleEnvironment';
import { evaluateRule, rulesForPair, type RuleSpec } from '../../src/sim/rules/compatibility';
import { describeResult, statusOfFailure } from '../../src/sim/rules/reasons';
import { statePredicates, wireLeadsCatheter } from '../../src/sim/rules/predicates';
import { repository, tierSegmentLength } from '../helpers/repository';

// Unit test 4 (prompts/M1-foundations.md §8): the compatibility engine on repository devices.

const CASE = 'sandbox-phantoms';

function rule(id: string): RuleSpec {
  const found = ruleSpecs(repository()).find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`No rule ${id}`);
  }
  return found;
}

function item(id: string, select: Record<string, { value: number; unit: string }> = {}): ItemInstance {
  const found = repository().devices.get(id);
  if (found === undefined) {
    throw new Error(`No device ${id}`);
  }
  return buildItemInstance(found, select);
}

const rodItem = (rodModelId: string): ItemInstance =>
  buildRodInstance(repository(), rodModelId, tierSegmentLength('high')).item;

const check = (id: string, instances: Record<string, ItemInstance>) =>
  evaluateRule(rule(id), ruleEnvironment(repository(), instances, CASE));

const catheter5F = () => rodItem('rm-berenstein-5f-65');
const sheath = (french: number) =>
  item('sheath-introducer', { innerDiameter: { value: french, unit: 'Fr' } });
const needle21G = () => item('needle-single-wall-21g');
const wire035 = () => rodItem('rm-glidewire-035-angled-150');
const wire018 = () => item('gw-glidewire', { diameter: { value: 0.018, unit: 'in' } });

describe('compatibility engine', () => {
  it('blocks the 5F catheter in a 4F sheath and allows it in a 5F sheath', () => {
    const blocked = check('fit-catheter-sheath', { catheter: catheter5F(), sheath: sheath(4) });
    expect(blocked?.status).toBe('block');
    expect(blocked?.ruleId).toBe('fit-catheter-sheath');
    expect(blocked?.message).toBe('This catheter will not enter the sheath valve.');
    expect(blocked?.sourceTitle).not.toBe('');
    expect(check('fit-catheter-sheath', { catheter: catheter5F(), sheath: sheath(5) })?.status).toBe('allow');
  });

  it('blocks a 0.035 in wire through a 21G needle and allows a 0.018 in wire', () => {
    expect(check('fit-needle-wire', { needle: needle21G(), wire: wire035() })?.status).toBe('block');
    expect(check('fit-needle-wire', { needle: needle21G(), wire: wire018() })?.status).toBe('allow');
  });

  it('allows a 0.035 in wire into the Berenstein 5F (rightAgg max over 0.035 and 0.038 in)', () => {
    expect(check('fit-wire-catheter', { catheter: catheter5F(), wire: wire035() })?.status).toBe('allow');
  });

  it('allows the 150 cm Glidewire by limit-wire-length (65 + 30 + 15 = 110 cm)', () => {
    expect(check('limit-wire-length', { catheter: catheter5F(), wire: wire035() })?.status).toBe('allow');
  });

  it('returns unknown, never allow, when a value is missing', () => {
    // The trocar needle has no maxWireDiameter.
    const result = check('fit-needle-wire', { needle: item('needle-trocar'), wire: wire035() });
    expect(result?.status).toBe('unknown');
    expect(describeResult(result!)).toMatch(/^Not checked:/);
  });

  it('returns unknown for a device-specific check with no named code yet (D12)', () => {
    expect(check('fit-plug-catheter', { catheter: catheter5F() })?.status).toBe('unknown');
  });

  it('skips state rules in static checks and evaluates them with predicates', () => {
    expect(check('order-catheter-over-wire', { catheter: catheter5F(), wire: wire035() })).toBeNull();
    const sheathLength = 0.11;
    const environment = {
      ...ruleEnvironment(repository(), {}, CASE),
      state: statePredicates({ catheterInserted: 0.2, wireInserted: 0.15, sheathLength }),
    };
    expect(evaluateRule(rule('order-catheter-over-wire'), environment)?.status).toBe('block');
    expect(wireLeadsCatheter(0.1, 0, sheathLength)).toBe(true);
    expect(wireLeadsCatheter(0.15, 0.2, sheathLength)).toBe(true);
  });

  it('maps failure modes to block or degrade (D12)', () => {
    expect(statusOfFailure('block')).toBe('block');
    expect(statusOfFailure('block-or-friction')).toBe('block');
    for (const mode of ['jam', 'degrade', 'rupture', 'warn', 'fail-closure'] as const) {
      expect(statusOfFailure(mode)).toBe('degrade');
    }
  });

  it('finds the rules for a pair of kinds through the roles table, in either order', () => {
    const { roles } = repository().rules;
    const ids = (a: string, b: string) =>
      rulesForPair(ruleSpecs(repository()), roles, a, b).map((match) => match.rule.id);
    expect(ids('selective-catheter', 'sheath')).toContain('fit-catheter-sheath');
    expect(ids('sheath', 'selective-catheter')).toContain('fit-catheter-sheath');
    expect(ids('guidewire', 'selective-catheter')).toEqual(
      expect.arrayContaining(['fit-wire-catheter', 'limit-wire-length', 'order-catheter-over-wire']),
    );
  });
});
