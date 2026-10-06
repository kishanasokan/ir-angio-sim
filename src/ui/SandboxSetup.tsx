import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { appData, CASE_ID } from '../app/appData';
import { buildRodInstance } from '../data/catalog';
import {
  choiceCheck,
  defaultSheathFrench,
  pairChecks,
  ruleSource,
  sheathInstance,
  type ChoiceCheck,
} from '../data/sandboxChoices';
import { tierParams } from '../data/simConfig';
import type { CompatibilityResult } from '../sim/rules/reasons';
import { useSession } from '../state/session';
import { PadPrompt } from './ControlsOverlay';
import { Button, Eyebrow } from './primitives';
import { useMenuPad } from './useMenuPad';

/**
 * Sandbox setup (prompts/M1-foundations.md §7, prompts/M2-core-systems.md §1.7): the anatomy, the sheath size, the
 * device stack (catheter and wire, or catheter, microcatheter and microwire) and the innermost wire. Every adjacent
 * pairing runs the compatibility rules; a blocked combination shows the rule's message and source, and Start stays
 * disabled (CLAUDE.md rule 7). A 4F sheath with the 5F catheter, for example, shows fit-catheter-sheath, and a
 * 0.035 in wire in a microcatheter shows fit-wire-microcatheter.
 */

function Choice({
  selected,
  onSelect,
  testId,
  children,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
        selected
          ? 'border-accent-400/70 bg-accent-400/10 text-ink-100'
          : 'border-white/[0.08] bg-white/[0.02] text-ink-300 hover:bg-white/[0.05]'
      }`}
    >
      {children}
    </button>
  );
}

function ResultLine({ result }: { readonly result: CompatibilityResult }) {
  const data = appData();
  const source = ruleSource(data.repository, result.ruleId);
  const tone =
    result.status === 'block'
      ? 'border-danger-400/40 bg-danger-400/10 text-danger-400'
      : result.status === 'degrade'
        ? 'border-caution-400/40 bg-caution-400/10 text-caution-400'
        : 'border-white/10 bg-white/[0.03] text-ink-300';
  return (
    <div
      data-testid={`check-${result.ruleId}`}
      data-status={result.status}
      className={`rounded-xl border p-3 text-sm ${tone}`}
    >
      <p className="font-medium">
        {result.status === 'unknown' ? `Not checked: ${result.message}` : result.message}
      </p>
      {source !== null && (
        <p className="mt-1 text-xs text-ink-300">
          Source:{' '}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/30 hover:text-ink-100"
          >
            {source.title}
          </a>
        </p>
      )}
    </div>
  );
}

function Problems({ check }: { readonly check: ChoiceCheck }) {
  const shown = check.results.filter((result) => result.status !== 'allow');
  return (
    <>
      {shown.map((result) => (
        <ResultLine key={result.ruleId} result={result} />
      ))}
    </>
  );
}

export function SandboxSetup() {
  const data = appData();
  const goTo = useSession((state) => state.goTo);
  const start = useSession((state) => state.start);
  const sandbox = data.sandbox;
  const [anatomyId, setAnatomy] = useState(sandbox.anatomy.default);
  const [french, setFrench] = useState(defaultSheathFrench(sandbox));
  const [stackId, setStackId] = useState(sandbox.stackOptions[0]?.id ?? '');
  const option = sandbox.stackOptions.find((entry) => entry.id === stackId) ?? sandbox.stackOptions[0];
  const [wire, setWire] = useState(option?.stack.at(-1) ?? '');
  const root = useRef<HTMLElement>(null);
  const back = useCallback(() => goTo('start'), [goTo]);
  const pad = useMenuPad(root, back);

  const segment = tierParams(data.repository, data.limits.tiers[0] ?? 'high').segmentLength;
  // The stack's devices around the wire, outermost first: fixed for each stack option.
  const fixed = useMemo(
    () => (option?.stack.slice(0, -1) ?? []).map((id) => buildRodInstance(data.repository, id, segment)),
    [data, option, segment],
  );
  const catheter = fixed[0];
  const wires = useMemo(
    () =>
      sandbox.inventory
        .map((id) => buildRodInstance(data.repository, id, segment))
        .filter((instance) => instance.innerDiameter === null),
    [data, sandbox, segment],
  );
  const sheathCheck = choiceCheck(
    catheter === undefined
      ? []
      : pairChecks(data.repository, CASE_ID, sheathInstance(data.repository, CASE_ID, french), catheter.item),
  );
  // Each fixed device inside the one around it.
  const stackCheck = choiceCheck(
    fixed.slice(1).flatMap((inner, i) => {
      const outer = fixed[i];
      return outer === undefined ? [] : pairChecks(data.repository, CASE_ID, outer.item, inner.item);
    }),
  );
  const wireInstance = wires.find((instance) => instance.rodModelId === wire);
  const holder = fixed.at(-1);
  const wireCheck = choiceCheck(
    wireInstance === undefined || holder === undefined
      ? []
      : pairChecks(data.repository, CASE_ID, holder.item, wireInstance.item),
  );
  const blocked = sheathCheck.blocked || stackCheck.blocked || wireCheck.blocked;
  const chooseStack = (id: string) => {
    setStackId(id);
    setWire(sandbox.stackOptions.find((entry) => entry.id === id)?.stack.at(-1) ?? '');
  };

  return (
    <main ref={root} className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <Eyebrow>Sandbox setup</Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a phantom and your devices</h1>
        <div className="mt-2">
          <PadPrompt status={pad.status} glyphs={pad.glyphs} />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-ink-500 uppercase">Phantom</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {sandbox.anatomy.options.map((id) => {
              const graph = data.repository.anatomyGraphs.get(id);
              return (
                <Choice
                  key={id}
                  testId={`setup-phantom-${id}`}
                  selected={anatomyId === id}
                  onSelect={() => setAnatomy(id)}
                >
                  <span className="block font-semibold text-ink-100">{graph?.name ?? id}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                    {typeof graph?.provenance.text === 'string' ? graph.provenance.text : ''}
                  </span>
                </Choice>
              );
            })}
          </div>
        </section>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-ink-500 uppercase">
              Introducer sheath
            </h2>
            <div className="flex gap-2">
              {sandbox.sheath.choices.map((size) => (
                <Choice
                  key={size}
                  testId={`setup-sheath-${size}`}
                  selected={french === size}
                  onSelect={() => setFrench(size)}
                >
                  <span className="font-mono">{size}F</span>
                </Choice>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <Problems check={sheathCheck} />
            </div>
            <h2 className="mt-6 mb-3 text-xs font-semibold tracking-[0.2em] text-ink-500 uppercase">
              Device stack
            </h2>
            <div className="grid gap-2">
              {sandbox.stackOptions.map((entry) => (
                <Choice
                  key={entry.id}
                  testId={`setup-stack-${entry.id}`}
                  selected={option?.id === entry.id}
                  onSelect={() => chooseStack(entry.id)}
                >
                  <span className="block text-ink-100">{entry.label}</span>
                </Choice>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {fixed.map((instance) => {
                const label = data.labels[instance.rodModelId];
                return (
                  <div
                    key={instance.rodModelId}
                    data-testid={`setup-fixed-${instance.rodModelId}`}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm"
                  >
                    <p className="text-ink-100">
                      {label?.name} <span className="text-ink-500">· {label?.generic}</span>
                    </p>
                    <p className="font-mono text-xs text-ink-300">{label?.size}</p>
                  </div>
                );
              })}
              <Problems check={stackCheck} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-ink-500 uppercase">Guidewire</h2>
            <div className="grid gap-2">
              {wires.map((instance) => {
                const label = data.labels[instance.rodModelId];
                return (
                  <Choice
                    key={instance.rodModelId}
                    testId={`setup-wire-${instance.rodModelId}`}
                    selected={wire === instance.rodModelId}
                    onSelect={() => setWire(instance.rodModelId)}
                  >
                    <span className="block text-ink-100">
                      {label?.name} <span className="text-ink-500">· {label?.generic}</span>
                    </span>
                    <span className="font-mono text-xs text-ink-500">{label?.size}</span>
                  </Choice>
                );
              })}
            </div>
            <div className="mt-3 space-y-2">
              <Problems check={wireCheck} />
            </div>
          </section>
        </div>

        <div className="mt-10 flex items-center justify-between gap-4">
          <Button variant="ghost" data-testid="setup-back" onClick={() => goTo('start')}>
            Back
          </Button>
          <div className="flex items-center gap-4">
            {blocked && (
              <p data-testid="setup-blocked" className="text-sm text-danger-400">
                Fix the blocked combination to start.
              </p>
            )}
            <Button
              variant="primary"
              data-testid="setup-start"
              disabled={blocked}
              onClick={() =>
                start({ anatomyId, sheathFrench: french, stackId: option?.id ?? '', wire, demo: null })
              }
            >
              Start
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
