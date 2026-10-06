import { create } from 'zustand';

/**
 * UI state for a session (spec 01 §2): which screen is up, what sandbox setup chose, the open panel, the view, the
 * roadmap outline toggle and the toasts. Simulation state lives in the worker; this is only what the UI shows.
 */

export type Screen = 'start' | 'setup' | 'sandbox';

export interface Launch {
  readonly anatomyId: string;
  readonly sheathFrench: number;
  /** One of the case's stack options; the case's first when absent. */
  readonly stackId?: string;
  /** The rod model in the stack's inner slot. */
  readonly wire: string;
  /** An autopilot script to watch, or null for free play. */
  readonly demo: string | null;
  /** Changes on every launch, so the sandbox remounts even with the same choices. */
  readonly key: number;
}

export type Panel = 'picker' | 'inspector' | 'pause';
export type PausePage = 'menu' | 'settings' | 'controls' | 'phantom';
export type View = 'fluoro' | '3d';

export type ToastKind = 'info' | 'blocked' | 'success' | 'warning';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
  /** The source of a rule's message, linked (CLAUDE.md rule 7). */
  readonly source?: { readonly title: string; readonly url: string | null };
  /** Wall-clock seconds at which the toast goes away. */
  readonly until: number;
}

interface SessionStore {
  readonly screen: Screen;
  readonly launch: Launch | null;
  readonly panel: Panel | null;
  readonly pausePage: PausePage;
  readonly view: View;
  readonly roadmap: boolean;
  readonly perf: boolean;
  readonly toasts: readonly Toast[];
  readonly goTo: (screen: Screen) => void;
  readonly start: (launch: Omit<Launch, 'key'>) => void;
  readonly togglePanel: (panel: Panel) => void;
  readonly closePanel: () => void;
  readonly setPausePage: (page: PausePage) => void;
  readonly toggleView: () => void;
  readonly toggleRoadmap: () => void;
  readonly togglePerf: () => void;
  readonly toast: (toast: Omit<Toast, 'id'>) => void;
  readonly dismissToast: (id: number) => void;
  readonly expireToasts: (now: number) => void;
}

let nextToast = 1;
let nextLaunch = 1;

export const useSession = create<SessionStore>((set, get) => ({
  screen: 'start',
  launch: null,
  panel: null,
  pausePage: 'menu',
  view: 'fluoro',
  roadmap: false,
  perf: false,
  toasts: [],
  goTo: (screen) => set({ screen, panel: null, pausePage: 'menu', toasts: [] }),
  start: (launch) =>
    set({
      screen: 'sandbox',
      launch: { ...launch, key: nextLaunch++ },
      panel: null,
      pausePage: 'menu',
      view: 'fluoro',
      roadmap: false,
      toasts: [],
    }),
  togglePanel: (panel) => set({ panel: get().panel === panel ? null : panel, pausePage: 'menu' }),
  closePanel: () => {
    const { panel, pausePage } = get();
    // Back from a pause-menu page returns to the menu first.
    if (panel === 'pause' && pausePage !== 'menu') {
      set({ pausePage: 'menu' });
    } else {
      set({ panel: null, pausePage: 'menu' });
    }
  },
  setPausePage: (pausePage) => set({ pausePage }),
  toggleView: () => set({ view: get().view === 'fluoro' ? '3d' : 'fluoro' }),
  toggleRoadmap: () => set({ roadmap: !get().roadmap }),
  togglePerf: () => set({ perf: !get().perf }),
  toast: (toast) => set({ toasts: [...get().toasts, { ...toast, id: nextToast++ }] }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  expireToasts: (now) => {
    const toasts = get().toasts;
    if (toasts.some((toast) => toast.until <= now)) {
      set({ toasts: toasts.filter((toast) => toast.until > now) });
    }
  },
}));
