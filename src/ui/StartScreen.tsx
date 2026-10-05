import { DISCLAIMER } from '../app/disclaimer';

// Minimal start screen for M1 Phase A. Phase D adds Enter sandbox, Watch a demo, the controls reference and
// Settings (prompts/M1-foundations.md §7).
export function StartScreen() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-medium tracking-[0.3em] text-accent-400 uppercase">
          Interventional radiology
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">IR Angio Suite Simulator</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-300">
          Real wires and catheters, modeled as physical rods inside vessels, driven by a game controller.
        </p>

        <section
          aria-labelledby="disclaimer-heading"
          className="mt-10 rounded-xl border border-caution-400/30 bg-suite-900 p-5 sm:p-6"
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

        <p className="mt-8 text-sm text-ink-500">
          Milestone M1 is under construction. The device sandbox, demos and controls arrive in the next build
          phases.
        </p>
      </div>
    </main>
  );
}
