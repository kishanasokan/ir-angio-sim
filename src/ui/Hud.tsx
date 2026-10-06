import type { ReactNode } from 'react';
import type { HudConfig } from '../data/renderConfig';
import { useHud, type DeviceHud, type HudView } from '../state/hud';
import { glyph } from './controls';
import { PadPrompt } from './ControlsOverlay';
import { formatAngles, formatDuration, formatMm, formatNumber } from './format';
import { DEMO_TITLES } from './demos';
import { Kbd } from './primitives';

/**
 * The HUD (prompts/M1-foundations.md §7): mode, fine and lock; the device stack from sheath to wire with depth past the
 * sheath tip, hub rotation and where each tip is; the resistance meter for hub force with its amber and red
 * thresholds; tip force and the wall-stress accumulator; the imaging readouts on the monitor; and the DEMO badge.
 * Numbers the end-to-end tests read are also data attributes (docs/M1-plan.md D25).
 */

function Card({ children, className = '' }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.07] bg-suite-900/80 p-4 shadow-xl shadow-black/30 backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

function Label({ children }: { readonly children: ReactNode }) {
  return <p className="text-[10px] font-semibold tracking-[0.22em] text-ink-500 uppercase">{children}</p>;
}

export function ModeBadge({ hud }: { readonly hud: HudView }) {
  const cath = hud.mode === 'cath';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        data-testid="mode"
        className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold tracking-[0.2em] ${
          cath
            ? 'bg-accent-400/15 text-accent-400 ring-1 ring-accent-400/40'
            : 'bg-caution-400/15 text-caution-400 ring-1 ring-caution-400/40'
        }`}
      >
        {cath ? 'CATH' : 'CONTROL'}
      </span>
      <span
        data-testid="fine"
        data-on={hud.fine}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold tracking-wider ${hud.fine ? 'bg-white/10 text-ink-100' : 'text-ink-500'}`}
      >
        FINE
      </span>
      <span
        data-testid="lock"
        data-on={hud.locked}
        className={`rounded-lg px-2 py-1 text-[11px] font-semibold tracking-wider ${hud.locked ? 'bg-white/10 text-ink-100' : 'text-ink-500'}`}
      >
        {hud.locked ? 'LOCKED' : 'UNLOCKED'}
      </span>
    </div>
  );
}

function DeviceRow({
  device,
  stick,
}: {
  readonly device: DeviceHud;
  readonly stick: 'left' | 'right' | null;
}) {
  const { role } = device;
  return (
    <li
      data-testid={`device-${role}`}
      data-rod-model={device.rodModelId}
      data-stick={stick ?? ''}
      data-depth-mm={device.depthMm.toFixed(3)}
      data-rotation-deg={device.rotationDeg.toFixed(3)}
      data-tip-in={device.tipIn ?? ''}
      data-past-carina-mm={device.pastCarinaMm === null ? '' : device.pastCarinaMm.toFixed(3)}
      className="relative border-l border-white/10 pl-4"
    >
      <span
        aria-hidden
        className={`absolute top-1.5 -left-[5px] size-2.5 rounded-full ${device.tube ? 'bg-accent-400' : 'bg-ink-100'}`}
      />
      <p className="text-sm font-semibold text-ink-100">
        {device.name} <span className="font-normal text-ink-500">· {device.generic}</span>
      </p>
      <p className="font-mono text-[11px] text-ink-500">
        {device.size}
        {stick !== null && (
          <span className="ml-2 rounded bg-accent-400/15 px-1.5 py-0.5 text-[10px] text-accent-400">
            {stick === 'left' ? 'Left stick' : 'Right stick'}
          </span>
        )}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="text-ink-500">Depth</dt>
        <dd data-testid={`depth-${role}`} className="text-right text-ink-100 tabular-nums">
          {formatMm(device.depthMm)}
        </dd>
        <dt className="text-ink-500">Rotation</dt>
        <dd className="text-right text-ink-100 tabular-nums">{Math.round(device.rotationDeg)}°</dd>
      </dl>
      <p data-testid={`tip-in-${role}`} className="mt-1.5 text-xs text-ink-300">
        Tip in: {device.tipIn ?? 'free space'}
      </p>
    </li>
  );
}

export function DeviceStack({ hud }: { readonly hud: HudView }) {
  return (
    <Card>
      <Label>Device stack</Label>
      <ol data-testid="device-stack" className="mt-3 space-y-4">
        <li className="relative border-l border-white/10 pl-4">
          <span aria-hidden className="absolute top-1.5 -left-[5px] size-2.5 rounded-full bg-ink-500" />
          <p className="text-sm font-semibold text-ink-100">
            {hud.sheath.name} <span className="font-normal text-ink-500">· {hud.sheath.french}F</span>
          </p>
          <p className="font-mono text-[11px] text-ink-500">
            {formatNumber(hud.sheath.lengthCm, 3)} cm · fixed
          </p>
        </li>
        {hud.devices.map((device, d) => (
          <DeviceRow
            key={device.rodModelId}
            device={device}
            // Shown only when the stack has a choice of pair (three or more devices).
            stick={
              hud.devices.length < 3
                ? null
                : d === hud.activeOuter
                  ? 'left'
                  : d === hud.activeOuter + 1
                    ? 'right'
                    : null
            }
          />
        ))}
      </ol>
    </Card>
  );
}

function Bar({
  value,
  fullScale,
  tone,
  marks = [],
}: {
  readonly value: number;
  readonly fullScale: number;
  readonly tone: string;
  readonly marks?: readonly { readonly at: number; readonly tone: string }[];
}) {
  const fraction = fullScale > 0 ? Math.min(1, Math.max(0, value / fullScale)) : 0;
  return (
    <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full transition-[width] duration-100 ${tone}`}
        style={{ width: `${fraction * 100}%` }}
      />
      {marks.map((mark) => (
        <span
          key={mark.at}
          aria-hidden
          className={`absolute top-0 h-full w-0.5 ${mark.tone}`}
          style={{ left: `${Math.min(1, mark.at / fullScale) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function Meters({ hud, config }: { readonly hud: HudView; readonly config: HudConfig }) {
  const level =
    hud.hubForceN >= config.hubForceDanger
      ? 'danger'
      : hud.hubForceN >= config.hubForceWarning
        ? 'warning'
        : 'ok';
  const tone =
    level === 'danger' ? 'bg-danger-400' : level === 'warning' ? 'bg-caution-400' : 'bg-accent-400';
  return (
    <Card>
      <div data-testid="resistance" data-level={level} data-force-n={hud.hubForceN.toFixed(4)}>
        <div className="flex items-baseline justify-between">
          <Label>Resistance</Label>
          <span
            className={`font-mono text-xs tabular-nums ${level === 'danger' ? 'text-danger-400' : level === 'warning' ? 'text-caution-400' : 'text-ink-100'}`}
          >
            {hud.hubForceN.toFixed(2)} N
          </span>
        </div>
        <Bar
          value={hud.hubForceN}
          fullScale={config.hubForceFullScale}
          tone={tone}
          marks={[
            { at: config.hubForceWarning, tone: 'bg-caution-400/80' },
            { at: config.hubForceDanger, tone: 'bg-danger-400/80' },
          ]}
        />
      </div>
      <div className="mt-4" data-testid="tip-force" data-force-n={hud.tipForceN.toFixed(4)}>
        <div className="flex items-baseline justify-between">
          <Label>Tip force</Label>
          <span className="font-mono text-xs text-ink-100 tabular-nums">{hud.tipForceN.toFixed(3)} N</span>
        </div>
        <Bar value={hud.tipForceN} fullScale={config.tipForceFullScale} tone="bg-ink-300" />
      </div>
      <div className="mt-4" data-testid="wall-stress" data-value={hud.wallStress.toFixed(5)}>
        <div className="flex items-baseline justify-between">
          <Label>Wall stress</Label>
          <span className="font-mono text-xs text-ink-100 tabular-nums">{hud.wallStress.toFixed(3)} N·s</span>
        </div>
        <Bar value={hud.wallStress} fullScale={config.wallStressFullScale} tone="bg-caution-400/80" />
      </div>
    </Card>
  );
}

/** The monitor's corner readouts, in the style of an angio suite display. */
export function ImagingOverlay({ hud }: { readonly hud: HudView }) {
  const { imaging } = hud;
  const state = imaging.shown === 'fluoro' ? 'FLUORO' : imaging.shown === 'hold' ? 'LIH' : 'NO IMAGE';
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-[11px] leading-tight text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] sm:text-xs">
      <div className="absolute top-3 left-3">
        <p
          data-testid="fluoro-state"
          data-state={imaging.shown}
          className={imaging.shown === 'fluoro' ? 'font-bold text-caution-400' : ''}
        >
          {state}
        </p>
        <p>{imaging.pulseRate} p/s</p>
        {imaging.roadmap && <p data-testid="roadmap-on">ROADMAP</p>}
      </div>
      <div className="absolute top-3 right-3 text-right">
        <p
          data-testid="carm-angles"
          data-rotation-deg={imaging.rotationDeg.toFixed(3)}
          data-angulation-deg={imaging.angulationDeg.toFixed(3)}
        >
          {formatAngles(imaging.rotationDeg, imaging.angulationDeg)}
        </p>
      </div>
      <div className="absolute bottom-3 left-3">
        <p data-testid="sid">SID {formatNumber(imaging.sidCm, 4)} cm</p>
        <p data-testid="fov">FOV {formatNumber(imaging.fieldCm, 3)} cm</p>
        {imaging.collimation < 1 && <p>COLL {Math.round(imaging.collimation * 100)}%</p>}
      </div>
      <div className="absolute right-3 bottom-3 text-right">
        <p data-testid="fluoro-time">FL {formatDuration(imaging.fluoroTimeS)}</p>
      </div>
      {imaging.shown === 'none' && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-sans text-sm text-white/45">
          Hold {glyph(hud.pad.glyphs, 'lt')} or Space for fluoro
        </p>
      )}
    </div>
  );
}

export function DemoBadge({ hud }: { readonly hud: HudView }) {
  if (hud.demo === null) {
    return null;
  }
  return (
    <div
      data-testid="demo-badge"
      className="pointer-events-none rounded-full border border-caution-400/40 bg-suite-950/80 px-4 py-1.5 text-xs shadow-lg backdrop-blur"
    >
      <span className="font-bold tracking-[0.25em] text-caution-400">DEMO</span>
      <span className="ml-3 text-ink-100">{DEMO_TITLES[hud.demo] ?? hud.demo}</span>
      <span className="ml-3 text-ink-500">Any input takes over</span>
    </div>
  );
}

export function SystemChip({ hud }: { readonly hud: HudView }) {
  return (
    <Card className="space-y-2 py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-500">Renderer</span>
        <span data-testid="backend" className="font-mono text-ink-100">
          {hud.backend ?? 'starting…'}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-500">Physics tier</span>
        <span data-testid="tier" className="font-mono text-ink-100">
          {hud.tier ?? 'benchmarking…'}
        </span>
      </div>
      <PadPrompt status={hud.pad.status} glyphs={hud.pad.glyphs} />
    </Card>
  );
}

export function HintBar({ hud }: { readonly hud: HudView }) {
  const g = hud.pad.glyphs;
  const hints: readonly (readonly [string, string, string])[] = [
    [glyph(g, 'y'), 'C', 'Mode'],
    [glyph(g, 'lt'), 'Space', 'Fluoro'],
    [glyph(g, 'rb'), 'B', 'Devices'],
    [glyph(g, 'view'), 'G', '3D'],
    ['', 'I', 'Inspector'],
    ['', 'P', 'Perf'],
    [glyph(g, 'menu'), 'Esc', 'Pause'],
  ];
  return (
    <div className="pointer-events-none flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
      {hints.map(([pad, key, action]) => (
        <span key={action} className="flex items-center gap-1">
          {pad !== '' && <Kbd>{pad}</Kbd>}
          <Kbd>{key}</Kbd>
          <span>{action}</span>
        </span>
      ))}
    </div>
  );
}

export function useHudView(): HudView | null {
  return useHud((state) => state.hud);
}
