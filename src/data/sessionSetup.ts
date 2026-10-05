import type { InputSettings } from '../input/mapping/settings';
import { settingsRecord } from '../input/mapping/settings';
import type { Command } from '../sim/core/records';
import type { SessionSetup } from '../worker/session';
import { dataHash } from './dataHash';
import { defaultInputSettings, inputConfig } from './inputConfig';
import { loadCase, type Repository } from './loaders';
import { sandboxConfig, type SandboxOptions } from './simConfig';
import type { DataFile } from './validate';

/**
 * A session for the sandbox case (prompts/M1-foundations.md §4): the engine configuration, the input mapping, the
 * case's autopilot parameters in SI and the input-log header.
 */
export interface SandboxSessionOptions extends SandboxOptions {
  readonly appVersion: string;
  /** The /data files, for the log's data hash. */
  readonly files: readonly DataFile[];
  readonly settings?: InputSettings;
}

export function sandboxSession(repository: Repository, options: SandboxSessionOptions): SessionSetup {
  const caseId = options.caseId ?? 'sandbox-phantoms';
  const sandbox = loadCase(repository, caseId);
  const settings = options.settings ?? defaultInputSettings(repository);
  return {
    config: sandboxConfig(repository, options),
    input: inputConfig(repository),
    autopilots: Object.fromEntries(
      sandbox.autopilot.map((script) => [
        script.id,
        Object.fromEntries(Object.entries(script.params).map(([name, value]) => [name, value.value])),
      ]),
    ),
    header: {
      appVersion: options.appVersion,
      dataHash: dataHash(options.files),
      caseId,
      settings: settingsRecord(settings),
    },
  };
}

/** The commands that start a demo at a step: its anatomy, then the script (docs/M1-plan.md D8). */
export function demoCommands(repository: Repository, caseId: string, scriptId: string, step: number): Command[] {
  const script = loadCase(repository, caseId).autopilot.find((entry) => entry.id === scriptId);
  if (script === undefined) {
    throw new Error(`Case ${caseId} has no autopilot "${scriptId}".`);
  }
  return [
    { step, cmd: 'set-anatomy', args: { anatomy: script.anatomy } },
    { step, cmd: 'start-autopilot', args: { script: scriptId } },
  ];
}
