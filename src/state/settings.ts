import { create } from 'zustand';
import type { InputSettings } from '../input/mapping/settings';

/**
 * The learner's settings (prompts/M1-foundations.md §5; spec 02 §13): input curves, stick inversion and mirroring,
 * rumble strength, a tier override, mute and the fluoro pulse rate. They are saved in localStorage under
 * irsim:settings; the input settings are recorded in every input log. A saved value that is missing or of the wrong
 * kind falls back to its default, so an old or edited save never breaks the app.
 */

export const SETTINGS_KEY = 'irsim:settings';

export interface AppSettings extends InputSettings {
  /** 'auto' runs the startup benchmark (docs/M1-plan.md D17); otherwise a tier id. */
  readonly tier: string;
  readonly muted: boolean;
  /** Fluoro pulse rate, Hz, one of the sourced options. */
  readonly pulseRate: number;
}

export interface SettingsLimits {
  readonly tiers: readonly string[];
  readonly pulseRates: readonly number[];
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Settings from saved JSON, field by field; anything invalid takes its default. */
export function parseSettings(
  text: string | null,
  defaults: AppSettings,
  limits: SettingsLimits,
): AppSettings {
  let saved: unknown = null;
  try {
    saved = text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    saved = null;
  }
  if (!isRecord(saved)) {
    return defaults;
  }
  const unit = (key: keyof AppSettings, fallback: number): number => {
    const value = saved[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
  };
  const flag = (key: keyof AppSettings, fallback: boolean): boolean => {
    const value = saved[key];
    return typeof value === 'boolean' ? value : fallback;
  };
  const exponent = saved.responseExponent;
  const tier = saved.tier;
  const pulseRate = saved.pulseRate;
  return {
    deadZone: unit('deadZone', defaults.deadZone),
    responseExponent:
      typeof exponent === 'number' && Number.isFinite(exponent) && exponent > 0
        ? exponent
        : defaults.responseExponent,
    invertLeftY: flag('invertLeftY', defaults.invertLeftY),
    invertRightY: flag('invertRightY', defaults.invertRightY),
    mirrorSticks: flag('mirrorSticks', defaults.mirrorSticks),
    rumbleStrength: unit('rumbleStrength', defaults.rumbleStrength),
    tier: typeof tier === 'string' && (tier === 'auto' || limits.tiers.includes(tier)) ? tier : defaults.tier,
    muted: flag('muted', defaults.muted),
    pulseRate:
      typeof pulseRate === 'number' && limits.pulseRates.includes(pulseRate) ? pulseRate : defaults.pulseRate,
  };
}

/** Reads the saved settings; storage that is missing or throws (private mode, blocked) gives the defaults. */
export function loadSettings(
  storage: Storage | null,
  defaults: AppSettings,
  limits: SettingsLimits,
): AppSettings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY) ?? null, defaults, limits);
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: Storage | null, settings: AppSettings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Saving is a convenience; the session keeps the settings in memory.
  }
}

/** The input settings alone, as mappers and logs take them. */
export function inputSettingsOf(settings: AppSettings): InputSettings {
  return {
    deadZone: settings.deadZone,
    responseExponent: settings.responseExponent,
    invertLeftY: settings.invertLeftY,
    invertRightY: settings.invertRightY,
    mirrorSticks: settings.mirrorSticks,
    rumbleStrength: settings.rumbleStrength,
  };
}

interface SettingsStore {
  readonly settings: AppSettings | null;
  readonly defaults: AppSettings | null;
  readonly init: (defaults: AppSettings, limits: SettingsLimits, storage: Storage | null) => void;
  readonly update: (patch: Partial<AppSettings>) => void;
  readonly reset: () => void;
}

let storageRef: Storage | null = null;

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: null,
  defaults: null,
  init: (defaults, limits, storage) => {
    storageRef = storage;
    set({ settings: loadSettings(storage, defaults, limits), defaults });
  },
  update: (patch) => {
    const current = get().settings;
    if (current === null) {
      return;
    }
    const settings = { ...current, ...patch };
    saveSettings(storageRef, settings);
    set({ settings });
  },
  reset: () => {
    const defaults = get().defaults;
    if (defaults !== null) {
      saveSettings(storageRef, defaults);
      set({ settings: defaults });
    }
  },
}));

/** The current settings; throws before the app has booted. */
export function currentSettings(): AppSettings {
  const settings = useSettings.getState().settings;
  if (settings === null) {
    throw new Error('Settings are read before the app booted.');
  }
  return settings;
}
