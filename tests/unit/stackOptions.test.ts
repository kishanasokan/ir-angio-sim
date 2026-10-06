import { describe, expect, it } from 'vitest';
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { buildRodInstance } from '../../src/data/catalog';
import { loadCase } from '../../src/data/loaders';
import { choiceCheck, pairChecks } from '../../src/data/sandboxChoices';
import { sandboxSession } from '../../src/data/sessionSetup';
import { sandboxConfig, sheathLength } from '../../src/data/simConfig';
import { validateData } from '../../src/data/validate';
import { DATA_ROOT, repository, tierSegmentLength } from '../helpers/repository';

// Sandbox stack options (prompts/M2-core-systems.md §1.7; spec 02 §12): setup offers the M1 catheter and wire, or a
// catheter, microcatheter and microwire, each starting from the case's insertion entries, with the compatibility
// rules checked pair by pair.

const CASE = 'sandbox-phantoms';
const THREE = 'catheter-microcatheter-microwire';
const MM = 1e-3;

describe('sandbox stack options', () => {
  const sandbox = loadCase(repository(), CASE);
  const instance = (id: string) => buildRodInstance(repository(), id, tierSegmentLength('high'));
  const check = (outer: string, inner: string) =>
    choiceCheck(pairChecks(repository(), CASE, instance(outer).item, instance(inner).item));

  it('offers the M1 stack first, then the three-device stack', () => {
    expect(sandbox.stackOptions.map((option) => option.id)).toEqual(['catheter-wire', THREE]);
    expect(sandbox.stackOptions[0]?.stack).toEqual(sandbox.initialStack);
  });

  it('starts the chosen stack at its insertion depths, outermost first', () => {
    const config = sandboxConfig(repository(), { stackId: THREE });
    const sheath = sheathLength(repository(), CASE);
    expect(config.stack.map((entry) => entry.rodModelId)).toEqual([
      'rm-cobra-c2-5f-65',
      'rm-progreat-2.4-130',
      'rm-gt-016-angled-180',
    ]);
    config.stack.forEach((entry, i) => expect(entry.inserted).toBeCloseTo(sheath + (20 + 10 * i) * MM, 12));
    // Without a choice, the case's first stack.
    expect(sandboxConfig(repository()).stack.map((entry) => entry.rodModelId)).toEqual(sandbox.initialStack);
    expect(() => sandboxConfig(repository(), { stackId: 'no-such-stack' })).toThrow(/no stack option/);
  });

  it('records the stack choice in the input log header, so a replay starts with the same devices', () => {
    const setup = sandboxSession(repository(), {
      appVersion: 'test',
      files: [],
      stackId: THREE,
      innerDevice: 'rm-gt-016-angled-180',
    });
    expect(setup.header).toMatchObject({ stackId: THREE, innerDevice: 'rm-gt-016-angled-180' });
    expect(sandboxSession(repository(), { appVersion: 'test', files: [] }).header).not.toHaveProperty(
      'stackId',
    );
  });

  it('allows the default three-device stack and blocks a 0.035 in wire in the microcatheter', () => {
    expect(check('rm-cobra-c2-5f-65', 'rm-progreat-2.4-130').worst?.ruleId).toBe('fit-micro-parent');
    expect(check('rm-cobra-c2-5f-65', 'rm-progreat-2.4-130').blocked).toBe(false);
    expect(check('rm-progreat-2.4-130', 'rm-gt-016-angled-180').blocked).toBe(false);
    const big = check('rm-progreat-2.4-130', 'rm-glidewire-035-angled-150');
    expect(big.blocked).toBe(true);
    expect(big.worst?.ruleId).toBe('fit-wire-microcatheter');
  });

  it('rejects a stack option whose device has no insertion entry or is not in the inventory', () => {
    const files = readDataFiles(DATA_ROOT).map((file) => {
      if (!file.path.endsWith('cases/sandbox.json')) {
        return file;
      }
      const data = JSON.parse(file.text) as { stackOptions: { stack: string[] }[] };
      data.stackOptions[1]?.stack.push('rm-bentson-035-145', 'rm-amplatz-bard-035-180');
      data.stackOptions[1]?.stack.splice(0, 0, 'rm-pigtail-5f-90');
      return { ...file, text: JSON.stringify(data) };
    });
    const errors = validateData(files).errors;
    expect(errors.map((error) => error.code)).toEqual(errors.map(() => 'bad-reference'));
    // The pigtail, Bentson and Amplatz are in the inventory but have no insertion entry.
    expect(errors.map((error) => error.path)).toEqual([
      'cases/sandbox.json#stackOptions[1].stack[0]',
      'cases/sandbox.json#stackOptions[1].stack[4]',
      'cases/sandbox.json#stackOptions[1].stack[5]',
    ]);
  });
});
