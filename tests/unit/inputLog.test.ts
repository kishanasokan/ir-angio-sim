import { describe, expect, it } from 'vitest';
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { dataHash } from '../../src/data/dataHash';
import {
  checkLog,
  createLogRecorder,
  InputLogError,
  parseLog,
  recordCommand,
  recordFrame,
  serializeLog,
  toLog,
} from '../../src/input/log';
import { NEUTRAL_AXES, neutralFrame, type InputFrame } from '../../src/sim/core/records';
import { DATA_ROOT } from '../helpers/repository';

// Unit test 15 (prompts/M1-foundations.md §8): input logs.

const HASH = dataHash(readDataFiles(DATA_ROOT));

function recorded() {
  const recorder = createLogRecorder({
    appVersion: '0.1.0',
    dataHash: HASH,
    seed: 7,
    caseId: 'sandbox-phantoms',
    anatomyId: 'phantom-c-bifurcation',
    settings: {
      deadZone: 0.12,
      responseExponent: 2,
      invertLeftY: false,
      invertRightY: true,
      mirrorSticks: false,
      rumbleStrength: 1,
    },
  });
  const push: InputFrame = { ...neutralFrame(10, 'gamepad'), axes: { ...NEUTRAL_AXES, innerPush: 0.25 } };
  recordFrame(recorder, neutralFrame(0, 'gamepad'));
  recordFrame(recorder, neutralFrame(1, 'gamepad'));
  recordFrame(recorder, push);
  recordFrame(recorder, { ...push, step: 11 });
  recordFrame(recorder, { ...push, step: 12, buttons: ['lock-pair'] });
  recordFrame(recorder, {
    ...push,
    step: 13,
    mode: 'control',
    source: 'autopilot',
    triggers: { fluoro: 1, inject: 0.5 },
  });
  recordCommand(recorder, { step: 0, cmd: 'set-tier', args: { tier: 'high' } });
  recordCommand(recorder, { step: 40, cmd: 'start-autopilot', args: { script: 'sandbox-c-left' } });
  return toLog(recorder);
}

describe('input logs', () => {
  it('keeps only frames that change', () => {
    const log = recorded();
    expect(log.frames.map((frame) => frame.step)).toEqual([0, 10, 12, 13]);
    expect(log.commands).toHaveLength(2);
    expect(log.schema).toBe('ir-sim/input-log@1');
  });

  it('round-trips frames and commands through JSON unchanged', () => {
    const log = recorded();
    expect(parseLog(serializeLog(log), HASH)).toEqual(log);
  });

  it('refuses a log made with different data', () => {
    const log = recorded();
    const changed = { ...log, dataHash: '00000000' };
    expect(() => parseLog(serializeLog(changed), HASH)).toThrow(InputLogError);
    try {
      parseLog(serializeLog(changed), HASH);
    } catch (error) {
      expect((error as InputLogError).code).toBe('data-mismatch');
    }
  });

  it('refuses anything that is not an input log', () => {
    for (const text of ['not json', '{}', JSON.stringify({ ...recorded(), schema: 'other' })]) {
      expect(() => parseLog(text, HASH)).toThrow(InputLogError);
    }
    const bad = { ...recorded(), commands: [{ step: 1, cmd: 'launch-rockets', args: {} }] };
    expect(() => parseLog(JSON.stringify(bad), HASH)).toThrow(/malformed/);
    const { anatomyId: _anatomyId, ...noAnatomy } = recorded();
    expect(() => parseLog(JSON.stringify(noAnatomy), HASH)).toThrow(InputLogError);
  });

  it('checks a log that is already an object the same way, as the physics worker does for a replay', () => {
    const log = recorded();
    expect(checkLog(log, HASH)).toBe(log);
    expect(() => checkLog({ ...log, dataHash: '00000000' }, HASH)).toThrow(/different data/);
    expect(() => checkLog(null, HASH)).toThrow(/not an ir-sim\/input-log@1/);
  });

  it('hashes /data independently of line endings and file order', () => {
    const files = readDataFiles(DATA_ROOT);
    const crlf = files.map((file) => ({ ...file, text: file.text.replace(/\n/g, '\r\n') })).reverse();
    expect(dataHash(crlf)).toBe(HASH);
    const edited = files.map((file, i) => (i === 0 ? { ...file, text: `${file.text} ` } : file));
    expect(dataHash(edited)).not.toBe(HASH);
  });
});
