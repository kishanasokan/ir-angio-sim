import type { HudView } from '../state/hud';

/**
 * The perf overlay (P; prompts/M1-foundations.md §7, spec 01 §10): FPS, frame time, physics time per frame, steps per
 * frame, tier and backend, against the target frame rate and the physics budget.
 */

export function PerfOverlay({
  hud,
  targetFps,
  physicsBudgetMs,
}: {
  readonly hud: HudView;
  readonly targetFps: number;
  readonly physicsBudgetMs: number | null;
}) {
  const { perf } = hud;
  const rows: readonly (readonly [string, string, boolean, string])[] = [
    ['FPS', perf.fps.toFixed(0), perf.fps >= targetFps - 1, 'fps'],
    ['Frame', `${perf.frameMs.toFixed(1)} ms`, true, 'frame-ms'],
    [
      'Physics / frame',
      `${perf.physicsMs.toFixed(2)} ms`,
      physicsBudgetMs === null || perf.physicsMs <= physicsBudgetMs,
      'physics-ms',
    ],
    ['Steps / frame', perf.stepsPerFrame.toFixed(1), true, 'steps'],
    ['Tier', hud.tier ?? '—', true, 'perf-tier'],
    ['Backend', hud.backend ?? '—', true, 'perf-backend'],
  ];
  return (
    <div
      data-testid="perf-overlay"
      className="pointer-events-none rounded-xl border border-white/10 bg-suite-950/85 px-3 py-2 font-mono text-[11px] shadow-xl backdrop-blur"
    >
      {rows.map(([label, value, good, id]) => (
        <div key={label} className="flex justify-between gap-6">
          <span className="text-ink-500">{label}</span>
          <span data-testid={id} className={good ? 'text-ink-100' : 'text-caution-400'}>
            {value}
          </span>
        </div>
      ))}
      <p className="mt-1 text-ink-500">
        Target {targetFps} fps{physicsBudgetMs === null ? '' : `, physics ≤ ${physicsBudgetMs} ms`}
      </p>
    </div>
  );
}
