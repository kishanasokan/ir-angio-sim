import { useCallback, useRef, useState } from 'react';
import { appData } from '../app/appData';
import { DISCLAIMER } from '../app/disclaimer';
import { defaultSheathFrench } from '../data/sandboxChoices';
import { useSession } from '../state/session';
import { ControlsReference, PadPrompt } from './ControlsOverlay';
import { DEMO_TITLES } from './demos';
import { Button, Eyebrow, Panel } from './primitives';
import { SettingsPanel } from './SettingsPanel';
import { useMenuPad } from './useMenuPad';

/**
 * The start screen (prompts/M1-foundations.md §7): the title, the exact disclaimer (golden rule 1), Enter sandbox,
 * Watch a demo, the controls reference with the detected controller's glyphs, and Settings. The D-pad and A work
 * here too.
 */

type Sheet = 'demos' | 'controls' | 'settings' | null;

export function StartScreen() {
  const data = appData();
  const goTo = useSession((state) => state.goTo);
  const start = useSession((state) => state.start);
  const [sheet, setSheet] = useState<Sheet>(null);
  const root = useRef<HTMLElement>(null);
  const back = useCallback(() => setSheet(null), []);
  const pad = useMenuPad(root, back);
  const sandbox = data.sandbox;
  const defaultWire = sandbox.initialStack.at(-1) ?? '';
  const defaultFrench = defaultSheathFrench(sandbox);

  return (
    <main
      ref={root}
      className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(79,179,191,0.10),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(242,184,75,0.05),transparent_50%)]"
      />
      <div className="relative grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Eyebrow>Interventional radiology</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">IR Angio Suite Simulator</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-300">
            Real wires and catheters, modeled as physical rods inside vessels, driven by a game controller.
            Milestone M1: a device sandbox with three test phantoms.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" data-testid="enter-sandbox" autoFocus onClick={() => goTo('setup')}>
              Enter sandbox
            </Button>
            <Button data-testid="watch-demo" onClick={() => setSheet(sheet === 'demos' ? null : 'demos')}>
              Watch a demo
            </Button>
            <Button onClick={() => setSheet(sheet === 'controls' ? null : 'controls')}>Controls</Button>
            <Button onClick={() => setSheet(sheet === 'settings' ? null : 'settings')}>Settings</Button>
          </div>
          <div className="mt-4">
            <PadPrompt status={pad.status} glyphs={pad.glyphs} />
          </div>

          <section
            aria-labelledby="disclaimer-heading"
            className="mt-10 rounded-xl border border-caution-400/30 bg-suite-900/80 p-5 sm:p-6"
          >
            <h2
              id="disclaimer-heading"
              className="text-xs font-semibold tracking-[0.2em] text-caution-400 uppercase"
            >
              Disclaimer
            </h2>
            <p data-testid="disclaimer" className="mt-3 text-sm leading-relaxed text-ink-100">
              {DISCLAIMER}
            </p>
          </section>
        </div>

        <div className="self-center">
          {sheet === 'demos' && (
            <Panel
              title="Watch a demo"
              subtitle="The autopilot drives through the same controls you use. Take over at any time."
            >
              <ul className="space-y-2 p-4">
                {sandbox.autopilot.map((script) => (
                  <li key={script.id}>
                    <button
                      type="button"
                      data-testid={`demo-${script.id}`}
                      onClick={() =>
                        start({
                          anatomyId: script.anatomy,
                          sheathFrench: defaultFrench,
                          wire: defaultWire,
                          demo: script.id,
                        })
                      }
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                      <span className="block text-sm font-semibold text-ink-100">
                        {DEMO_TITLES[script.id] ?? script.id}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-300">
                        {script.description}
                      </span>
                      <span className="mt-2 block text-[11px] text-ink-500">
                        {data.repository.anatomyGraphs.get(script.anatomy)?.name ?? script.anatomy}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {sheet === 'controls' && (
            <Panel title="Controls" subtitle="Y (or C) switches between Cath mode and Control mode.">
              <div className="max-h-[70vh] overflow-auto p-4">
                <ControlsReference glyphs={pad.glyphs} />
              </div>
            </Panel>
          )}
          {sheet === 'settings' && (
            <Panel title="Settings">
              <div className="px-5 py-3">
                <SettingsPanel limits={data.limits} />
              </div>
            </Panel>
          )}
          {sheet === null && (
            <div aria-hidden className="hidden lg:block">
              <MonitorMotif pulseRate={data.render.fluoro.defaultPulseRate} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** A quiet fluoro-monitor motif for the empty side of the start screen. */
function MonitorMotif({ pulseRate }: { readonly pulseRate: number }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.06] bg-[radial-gradient(circle_at_50%_45%,#5d6266,#2b2f33_70%,#121417)] shadow-2xl shadow-black/60">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full opacity-80">
        <path
          d="M50 102 L50 58 Q50 52 62 36 L74 18"
          fill="none"
          stroke="#15181b"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M50 58 Q50 52 38 36 L26 18"
          fill="none"
          stroke="#1d2125"
          strokeWidth="0.5"
          strokeOpacity="0.35"
        />
        <path d="M50 102 L50 66" fill="none" stroke="#2a2f34" strokeWidth="2.6" strokeOpacity="0.7" />
      </svg>
      <span className="absolute top-3 left-3 font-mono text-[10px] text-white/50">
        FLUORO {pulseRate} p/s
      </span>
      <span className="absolute top-3 right-3 font-mono text-[10px] text-white/50">LAO 0 CRA 0</span>
    </div>
  );
}
