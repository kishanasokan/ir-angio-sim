import type { ReactNode } from 'react';
import { useSettings, type AppSettings, type SettingsLimits } from '../state/settings';
import { Button } from './primitives';

/**
 * Settings (prompts/M1-foundations.md §5): dead zone, response curve, invert Y per stick, mirror sticks, rumble
 * strength, the tier override, sound and the fluoro pulse rate. Saved under irsim:settings. The slider ranges are
 * presentation only; any value a slider allows is a valid setting.
 */

function Row({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-2">
      <span className="text-sm text-ink-100">{label}</span>
      <span className="justify-self-end">{children}</span>
      {hint !== undefined && <span className="col-span-2 text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

const INPUT =
  'accent-accent-400 outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-suite-950';

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly format: (value: number) => string;
}) {
  return (
    <span className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`w-36 ${INPUT}`}
      />
      <span className="w-12 text-right font-mono text-xs text-ink-300">{format(value)}</span>
    </span>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className={`size-4 ${INPUT}`}
    />
  );
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function SettingsPanel({ limits }: { readonly limits: SettingsLimits }) {
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const reset = useSettings((state) => state.reset);
  if (settings === null) {
    return null;
  }
  const set = (patch: Partial<AppSettings>) => update(patch);
  return (
    <div className="divide-y divide-white/[0.05]" data-testid="settings">
      <Row label="Stick dead zone">
        <Slider
          value={settings.deadZone}
          min={0}
          max={0.4}
          step={0.01}
          onChange={(v) => set({ deadZone: v })}
          format={percent}
        />
      </Row>
      <Row label="Response curve" hint="1 is linear; higher gives finer control near the center.">
        <Slider
          value={settings.responseExponent}
          min={1}
          max={3}
          step={0.1}
          onChange={(v) => set({ responseExponent: v })}
          format={(v) => v.toFixed(1)}
        />
      </Row>
      <Row label="Invert left stick vertical">
        <Toggle checked={settings.invertLeftY} onChange={(v) => set({ invertLeftY: v })} />
      </Row>
      <Row label="Invert right stick vertical">
        <Toggle checked={settings.invertRightY} onChange={(v) => set({ invertRightY: v })} />
      </Row>
      <Row label="Mirror sticks" hint="The right stick drives the outer device.">
        <Toggle checked={settings.mirrorSticks} onChange={(v) => set({ mirrorSticks: v })} />
      </Row>
      <Row label="Rumble strength">
        <Slider
          value={settings.rumbleStrength}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ rumbleStrength: v })}
          format={percent}
        />
      </Row>
      <Row label="Sound">
        <Toggle checked={!settings.muted} onChange={(v) => set({ muted: !v })} />
      </Row>
      <Row label="Fluoro pulse rate">
        <select
          value={settings.pulseRate}
          onChange={(event) => set({ pulseRate: Number(event.target.value) })}
          className={`rounded-lg border border-white/15 bg-suite-800 px-2 py-1 text-sm ${INPUT}`}
        >
          {limits.pulseRates.map((rate) => (
            <option key={rate} value={rate}>
              {rate} pulses/s
            </option>
          ))}
        </select>
      </Row>
      <Row
        label="Physics tier"
        hint="Auto runs a short benchmark at start. A change applies to the next session."
      >
        <select
          value={settings.tier}
          onChange={(event) => set({ tier: event.target.value })}
          className={`rounded-lg border border-white/15 bg-suite-800 px-2 py-1 text-sm ${INPUT}`}
        >
          <option value="auto">Auto</option>
          {limits.tiers.map((tier) => (
            <option key={tier} value={tier}>
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </option>
          ))}
        </select>
      </Row>
      <div className="pt-3">
        <Button variant="ghost" onClick={reset}>
          Restore defaults
        </Button>
      </div>
    </div>
  );
}
