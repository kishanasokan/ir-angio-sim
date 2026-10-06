import { describe, expect, it } from 'vitest';
import {
  FrameStats,
  NO_PUFF,
  pastJunctionMm,
  RunningMean,
  stepPuff,
  tipLocation,
} from '../../src/app/hudView';
import { settingRanges } from '../../src/data/inputConfig';
import { loadAnatomyGraph } from '../../src/data/loaders';
import { neutralPad } from '../../src/input/mapping/mapPad';
import { PAD_BUTTONS } from '../../src/sim/core/records';
import type { DeviceSnapshot } from '../../src/sim/snapshot';
import { useSession } from '../../src/state/session';
import {
  loadSettings,
  parseSettings,
  saveSettings,
  SETTINGS_KEY,
  type AppSettings,
} from '../../src/state/settings';
import { glyph, PAD_ROWS } from '../../src/ui/controls';
import { formatAngles, formatDuration, formatNumber, formatQuantity, formatUnit } from '../../src/ui/format';
import { anyPress, padNav } from '../../src/ui/nav';
import { repository } from '../helpers/repository';

// Phase D's pure UI helpers: settings, controller navigation, formatting, HUD values and the session store.

const DEFAULTS: AppSettings = {
  deadZone: 0.12,
  responseExponent: 2,
  invertLeftY: false,
  invertRightY: false,
  mirrorSticks: false,
  rumbleStrength: 0.8,
  tier: 'auto',
  muted: false,
  pulseRate: 7.5,
};
const LIMITS = {
  tiers: ['high', 'standard'],
  pulseRates: [3.75, 7.5, 15, 30],
  ...settingRanges(repository()),
};

describe('settings (irsim:settings)', () => {
  it('round-trips through storage under irsim:settings', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    const changed: AppSettings = {
      ...DEFAULTS,
      deadZone: 0.2,
      invertRightY: true,
      tier: 'standard',
      pulseRate: 15,
    };
    saveSettings(storage, changed);
    expect([...store.keys()]).toEqual([SETTINGS_KEY]);
    expect(loadSettings(storage, DEFAULTS, LIMITS)).toEqual(changed);
  });

  it('falls back to the default for each missing, invalid or out-of-range value', () => {
    expect(parseSettings(null, DEFAULTS, LIMITS)).toBe(DEFAULTS);
    expect(parseSettings('not json', DEFAULTS, LIMITS)).toBe(DEFAULTS);
    expect(parseSettings('[1, 2]', DEFAULTS, LIMITS)).toBe(DEFAULTS);
    const parsed = parseSettings(
      JSON.stringify({
        deadZone: 3,
        responseExponent: -1,
        mirrorSticks: 'yes',
        tier: 'ultra',
        pulseRate: 60,
        muted: true,
      }),
      DEFAULTS,
      LIMITS,
    );
    expect(parsed).toEqual({ ...DEFAULTS, muted: true });
    // The ranges come from tuning/input → settingsLimits: just past them falls back, the ends are kept.
    const edges = parseSettings(
      JSON.stringify({
        deadZone: LIMITS.deadZone.max + LIMITS.deadZone.step,
        responseExponent: LIMITS.responseExponent.max,
        rumbleStrength: LIMITS.rumbleStrength.max + LIMITS.rumbleStrength.step,
      }),
      DEFAULTS,
      LIMITS,
    );
    expect(edges.deadZone).toBe(DEFAULTS.deadZone);
    expect(edges.responseExponent).toBe(LIMITS.responseExponent.max);
    expect(edges.rumbleStrength).toBe(DEFAULTS.rumbleStrength);
  });

  it('survives storage that throws, as in a private window', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(broken, DEFAULTS, LIMITS)).toBe(DEFAULTS);
    expect(() => saveSettings(broken, DEFAULTS)).not.toThrow();
    expect(loadSettings(null, DEFAULTS, LIMITS)).toBe(DEFAULTS);
  });
});

describe('controller navigation', () => {
  const pad = (pressed: readonly number[]) => {
    const base = neutralPad();
    return { axes: base.axes, buttons: base.buttons.map((value, i) => (pressed.includes(i) ? 1 : value)) };
  };

  it('acts on press edges only: D-pad moves, A selects, B goes back', () => {
    const down = pad([PAD_BUTTONS.down, PAD_BUTTONS.a]);
    expect(padNav(down, null)).toEqual(['down', 'select']);
    expect(padNav(down, down)).toEqual([]);
    expect(padNav(pad([PAD_BUTTONS.b, PAD_BUTTONS.up]), down)).toEqual(['up', 'back']);
    expect(padNav(null, down)).toEqual([]);
  });

  it('notices the first press of any button, which Firefox needs before it shows a pad', () => {
    expect(anyPress(pad([]), null)).toBe(false);
    expect(anyPress(pad([PAD_BUTTONS.rt]), pad([]))).toBe(true);
    expect(anyPress(pad([PAD_BUTTONS.rt]), pad([PAD_BUTTONS.rt]))).toBe(false);
  });

  it('shows the detected glyph set in the controls reference', () => {
    expect(glyph('xbox', 'y')).toBe('Y');
    expect(glyph('playstation', 'y')).toBe('△');
    expect(glyph('playstation', 'rt')).toBe('R2');
    expect(glyph('generic', 'lb')).toBe('LB');
    expect(PAD_ROWS.find((row) => row.control === 'y')?.cath).toMatch(/Control mode/);
  });
});

describe('display formatting', () => {
  it('reads angles as LAO/RAO and cranial/caudal', () => {
    expect(formatAngles(25.2, 9.6)).toBe('LAO 25 CRA 10');
    expect(formatAngles(-30, -15)).toBe('RAO 30 CAU 15');
    expect(formatAngles(0, 0)).toBe('LAO 0 CRA 0');
    expect(formatAngles(-0.2, -0.3)).toBe('LAO 0 CRA 0');
  });

  it('formats durations, numbers and units', () => {
    expect(formatDuration(7.44)).toBe('0:07.4');
    expect(formatDuration(133)).toBe('2:13.0');
    expect(formatNumber(2.91266e-4)).toBe('2.913e-4');
    expect(formatNumber(1.4325)).toBe('1.433');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(8e9)).toBe('8e9');
    expect(formatUnit('N*m2')).toBe('N·m²');
    expect(formatQuantity(45, 'deg')).toBe('45°');
    expect(formatQuantity(0.035, 'in')).toBe('0.035 in');
    expect(formatQuantity(0.02, '1')).toBe('0.02');
  });
});

describe('HUD values', () => {
  const graph = loadAnatomyGraph(repository(), 'phantom-c-bifurcation');
  const device = (tip: [number, number, number], segment: string | null, name: string | null, past = 50) =>
    ({
      rodModel: 'rm-glidewire-035-angled-150',
      positionsMm: new Float32Array([0, 0, -10, ...tip]),
      frames: new Float32Array(4),
      insertedMm: 160,
      pastSheathTipMm: past,
      hubRotationDeg: 0,
      tipSegment: segment,
      tipSegmentName: name,
      tipNormalForceN: 0,
      hubForceN: 0,
      wallStress: 0,
    }) satisfies DeviceSnapshot;

  it('names where the tip is, including the sheath', () => {
    expect(tipLocation(device([0, 0, 50], 'c-parent', 'parent'))).toBe('parent');
    expect(tipLocation(device([0, 0, -5], null, null, -5))).toBe('sheath');
    expect(tipLocation(device([0, 0, 50], null, null, 50))).toBeNull();
  });

  it('measures past the carina along the daughter centerline (D25), and nothing in the parent', () => {
    // 20 mm along the left daughter, which leaves the carina at 30° toward +x.
    const along = 20;
    const tip: [number, number, number] = [
      along * Math.sin(Math.PI / 6),
      0,
      150 + along * Math.cos(Math.PI / 6),
    ];
    expect(pastJunctionMm(graph, device(tip, 'c-left', 'left daughter'))).toBeCloseTo(along, 3);
    expect(pastJunctionMm(graph, device([0, 0, 100], 'c-parent', 'parent'))).toBeNull();
    expect(pastJunctionMm(graph, device([0, 0, 100], null, null))).toBeNull();
  });

  it('follows the contrast puff while RT is held, then fades it out', () => {
    let puff = stepPuff(NO_PUFF, 0.8, 10, 1);
    expect(puff.level).toBe(0.8);
    puff = stepPuff(puff, 0, 10.5, 1);
    expect(puff.level).toBeCloseTo(0.8, 12);
    puff = stepPuff(puff, 0, 11, 1);
    expect(puff.level).toBeCloseTo(0.4, 12);
    puff = stepPuff(puff, 0, 12, 1);
    expect(puff).toEqual(NO_PUFF);
    expect(stepPuff(NO_PUFF, 0, 3, 1)).toEqual(NO_PUFF);
  });

  it('averages frame times and physics times over a window', () => {
    const frames = new FrameStats(3);
    expect(frames.fps).toBe(0);
    for (const t of [0, 16, 32, 48, 64]) {
      frames.add(t);
    }
    expect(frames.frameMs).toBe(16);
    expect(frames.fps).toBeCloseTo(62.5, 9);
    const mean = new RunningMean(2);
    mean.add(1);
    mean.add(2);
    mean.add(4);
    expect(mean.mean).toBe(3);
  });
});

describe('session store', () => {
  it('opens one panel at a time, and back leaves a pause page before the menu', () => {
    const store = useSession.getState();
    store.goTo('start');
    store.togglePanel('inspector');
    expect(useSession.getState().panel).toBe('inspector');
    store.togglePanel('picker');
    expect(useSession.getState().panel).toBe('picker');
    store.togglePanel('picker');
    expect(useSession.getState().panel).toBeNull();
    store.togglePanel('pause');
    store.setPausePage('settings');
    store.closePanel();
    expect(useSession.getState()).toMatchObject({ panel: 'pause', pausePage: 'menu' });
    store.closePanel();
    expect(useSession.getState().panel).toBeNull();
  });

  it('starts a sandbox with a fresh key and expires toasts', () => {
    const store = useSession.getState();
    store.start({
      anatomyId: 'phantom-a-straight',
      sheathFrench: 5,
      wire: 'rm-glidewire-035-angled-150',
      demo: null,
    });
    const first = useSession.getState().launch?.key;
    store.start({
      anatomyId: 'phantom-a-straight',
      sheathFrench: 5,
      wire: 'rm-glidewire-035-angled-150',
      demo: null,
    });
    expect(useSession.getState().launch?.key).not.toBe(first);
    expect(useSession.getState().screen).toBe('sandbox');
    store.toast({ kind: 'info', text: 'DSA: available in M2', until: 5 });
    store.toast({ kind: 'info', text: 'later', until: 9 });
    useSession.getState().expireToasts(6);
    expect(useSession.getState().toasts.map((toast) => toast.text)).toEqual(['later']);
  });
});
