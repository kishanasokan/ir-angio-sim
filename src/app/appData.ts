import packageJson from '../../package.json';
import { BUNDLED_DATA_FILES } from '../data/bundledFiles';
import { defaultInputSettings, inputConfig, rumbleConfig, settingRanges } from '../data/inputConfig';
import { loadCase, loadRepository, type CaseSI, type Repository } from '../data/loaders';
import { renderConfig, type RenderConfig } from '../data/renderConfig';
import { deviceLabel, inventoryInstances, type DeviceLabel } from '../data/sandboxChoices';
import { carmParams, sheathLength } from '../data/simConfig';
import { fromSI, valueToSI } from '../data/units';
import type { InputConfig } from '../input/mapping/settings';
import type { RumbleConfig } from '../input/rumble';
import type { CarmParams } from '../sim/imaging/carm';
import type { AppSettings, SettingsLimits } from '../state/settings';

/**
 * What the main thread reads from /data, loaded once: the repository (validated in the browser from the same bytes
 * `npm run validate-data` checked), the sandbox case, and the configurations the views, the HUD, input and rumble
 * use. The worker loads its own copy.
 */

export const CASE_ID = 'sandbox-phantoms';
export const APP_VERSION = packageJson.version;
/** The sandbox draws no random numbers yet; one fixed seed keeps every session replayable (spec 01 §4). */
export const SESSION_SEED = 1;

export interface AppData {
  readonly repository: Repository;
  readonly sandbox: CaseSI;
  readonly render: RenderConfig;
  readonly input: InputConfig;
  readonly rumble: RumbleConfig;
  readonly carm: CarmParams;
  /** m. */
  readonly sheathLength: number;
  /** Inventory rod models with their labels, in case order. */
  readonly labels: Readonly<Record<string, DeviceLabel>>;
  readonly defaultSettings: AppSettings;
  readonly limits: SettingsLimits;
  /** The physics budget per frame, ms (the high tier's autoSelect.maxPhysicsPerFrame), or null without one. */
  readonly physicsBudgetMs: number | null;
}

let cached: AppData | null = null;

export function appData(): AppData {
  if (cached !== null) {
    return cached;
  }
  const repository = loadRepository(BUNDLED_DATA_FILES);
  const render = renderConfig(repository);
  const rodTiers = repository.physics.tiers.filter((tier) => tier.model === 'rod').map((tier) => tier.id);
  const budget = repository.physics.tiers.find((tier) => tier.autoSelect !== undefined)?.autoSelect
    ?.maxPhysicsPerFrame;
  const labels = Object.fromEntries(
    inventoryInstances(repository, CASE_ID, rodTiers[0] ?? 'high').map((instance) => [
      instance.rodModelId,
      deviceLabel(instance),
    ]),
  );
  cached = {
    repository,
    sandbox: loadCase(repository, CASE_ID),
    render,
    input: inputConfig(repository),
    rumble: rumbleConfig(repository),
    carm: carmParams(repository),
    sheathLength: sheathLength(repository, CASE_ID),
    labels,
    defaultSettings: {
      ...defaultInputSettings(repository),
      tier: 'auto',
      muted: false,
      pulseRate: render.fluoro.defaultPulseRate,
    },
    limits: { tiers: rodTiers, pulseRates: render.fluoro.pulseRates, ...settingRanges(repository) },
    physicsBudgetMs: budget === undefined ? null : fromSI(valueToSI(budget.value, budget.unit), 'ms'),
  };
  return cached;
}
