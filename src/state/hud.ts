import { create } from 'zustand';
import type { GlyphSet } from '../input/sources/gamepad';
import type { InputMode } from '../sim/core/records';
import type { BackendName } from '../render/renderer';
import type { FluoroImage } from '../render/scenes/fluoro';

/**
 * The HUD's view of the latest snapshot (spec 01 §3): the runtime writes it at tuning/render → hud.uiRefreshRate, while
 * the canvas renders every frame, so React re-renders at most that often.
 */

export interface DeviceHud {
  readonly rodModelId: string;
  readonly name: string;
  readonly generic: string;
  readonly size: string;
  readonly tube: boolean;
  /** Depth past the sheath tip, mm (negative inside the sheath). */
  readonly depthMm: number;
  readonly rotationDeg: number;
  /** Where the tip is: an anatomy segment's name, "sheath", or null in free space. */
  readonly tipIn: string | null;
  /** The tip's arc distance past a junction along its daughter segment, mm (D25); null outside a daughter. */
  readonly pastCarinaMm: number | null;
  readonly hubForceN: number;
  readonly tipForceN: number;
  readonly wallStress: number;
}

export type PadStatus = 'none' | 'waiting' | 'ready' | 'non-standard';

export interface HudView {
  readonly ready: boolean;
  readonly mode: InputMode;
  readonly fine: boolean;
  readonly locked: boolean;
  readonly demo: string | null;
  readonly sheath: { readonly name: string; readonly french: number; readonly lengthCm: number };
  /** Outermost first. */
  readonly devices: readonly DeviceHud[];
  /** The largest hub force, tip force and wall stress in the stack, for the meters. */
  readonly hubForceN: number;
  readonly tipForceN: number;
  readonly wallStress: number;
  readonly imaging: {
    readonly shown: FluoroImage;
    readonly pulseRate: number;
    /** Degrees: positive LAO and cranial. */
    readonly rotationDeg: number;
    readonly angulationDeg: number;
    readonly sidCm: number;
    readonly fieldCm: number;
    readonly collimation: number;
    readonly fluoroTimeS: number;
    readonly roadmap: boolean;
  };
  readonly backend: BackendName | null;
  readonly tier: string | null;
  readonly perf: {
    readonly fps: number;
    readonly frameMs: number;
    readonly physicsMs: number;
    readonly stepsPerFrame: number;
  };
  readonly pad: { readonly status: PadStatus; readonly glyphs: GlyphSet };
  readonly anatomyId: string;
}

interface HudStore {
  readonly hud: HudView | null;
  readonly set: (hud: HudView | null) => void;
}

export const useHud = create<HudStore>((set) => ({
  hud: null,
  set: (hud) => set({ hud }),
}));
