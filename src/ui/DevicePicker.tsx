import { useMemo } from 'react';
import { appData, CASE_ID } from '../app/appData';
import { choiceCheck, inventoryInstances, pairChecks, ruleSource } from '../data/sandboxChoices';
import type { HudView } from '../state/hud';
import { useSession } from '../state/session';
import { Panel } from './primitives';
import { useRuntime } from './runtimeContext';

/**
 * The device picker (RB, or B on the keyboard; prompts/M1-foundations.md §7): the case inventory with each item's
 * compatibility with the catheter in use. Blocked entries are greyed out with the rule's reason. Picking another wire
 * issues one swap-device command: the engine withdraws the current wire to the sheath valve at full speed and feeds the
 * new one to the catheter tip, animated and logged for replay.
 */

export function DevicePicker({ hud }: { readonly hud: HudView }) {
  const data = appData();
  const runtime = useRuntime();
  const close = useSession((state) => state.closePanel);
  const tier = hud.tier ?? data.limits.tiers[0] ?? 'high';
  const instances = useMemo(() => inventoryInstances(data.repository, CASE_ID, tier), [data, tier]);
  const outer = hud.devices[0];
  const inner = hud.devices.at(-1);
  const catheter = instances.find((instance) => instance.rodModelId === outer?.rodModelId);

  return (
    <Panel
      title="Device picker"
      subtitle="Choose a wire to exchange over the catheter. D-pad or Tab to move, A or Enter to pick, B to close."
      testId="device-picker"
      onClose={close}
      className="w-[min(36rem,92vw)]"
    >
      <ul className="space-y-2 p-4">
        {instances.map((instance) => {
          const label = data.labels[instance.rodModelId];
          const inUse =
            instance.rodModelId === inner?.rodModelId || instance.rodModelId === outer?.rodModelId;
          const isWire = instance.innerDiameter === null;
          const check =
            isWire && catheter !== undefined
              ? choiceCheck(pairChecks(data.repository, CASE_ID, catheter.item, instance.item))
              : null;
          const blocked = check?.blocked ?? false;
          const reason =
            check?.worst !== undefined && check.worst !== null && check.worst.status !== 'allow'
              ? check.worst
              : null;
          const source = reason === null ? null : ruleSource(data.repository, reason.ruleId);
          const disabled = inUse || blocked || !isWire;
          const status = inUse
            ? instance.rodModelId === outer?.rodModelId
              ? 'In use · outer device'
              : 'In use'
            : !isWire
              ? 'Catheter exchange arrives in a later milestone'
              : blocked
                ? 'Blocked'
                : reason?.status === 'degrade'
                  ? 'Allowed, with a warning'
                  : reason?.status === 'unknown'
                    ? 'Not checked'
                    : 'Compatible';
          return (
            <li key={instance.rodModelId}>
              <button
                type="button"
                data-testid={`pick-${instance.rodModelId}`}
                data-blocked={blocked}
                disabled={disabled}
                onClick={() => {
                  runtime?.swapDevice(instance.rodModelId);
                  close();
                }}
                className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-white/[0.02]"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-ink-100">
                    {label?.name} <span className="font-normal text-ink-500">· {label?.generic}</span>
                  </span>
                  <span
                    className={`shrink-0 text-[11px] ${blocked ? 'text-danger-400' : inUse ? 'text-accent-400' : 'text-ink-500'}`}
                  >
                    {status}
                  </span>
                </span>
                <span className="font-mono text-xs text-ink-500">{label?.size}</span>
                {reason !== null && (
                  <span className={`mt-1 block text-xs ${blocked ? 'text-danger-400' : 'text-caution-400'}`}>
                    {reason.status === 'unknown' ? `Not checked: ${reason.message}` : reason.message}
                    {source !== null && <span className="text-ink-500"> · {source.title}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
