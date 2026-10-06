import { loadAnatomyGraph, type AnatomyGraphSI } from '../data/loaders';
import { deviceLooks, type DeviceLook } from '../data/renderConfig';
import { ruleSource, sheathOuterDiameter } from '../data/sandboxChoices';
import { demoCommands } from '../data/sessionSetup';
import { fromSI } from '../data/units';
import { createTonePlayer, type TonePlayer } from '../audio/tones';
import { INITIAL_MAPPER_STATE, type MapperState } from '../input/mapping/frame';
import { INITIAL_RUMBLE, playRumble, rumbleStep, rumbleSupported, type RumbleState } from '../input/rumble';
import { createInputLoop, type InputLoop } from '../input/sources/inputLoop';
import { createKeyboardSource, type KeyboardSource } from '../input/sources/keyboard';
import { createPointerSource, type PointerSource } from '../input/sources/pointer';
import type { PadReading } from '../input/sources/gamepad';
import { DeviceTube } from '../render/devices/deviceMesh';
import { createRenderer, type BackendName, type RendererHandle } from '../render/renderer';
import { Anatomy3dView } from '../render/scenes/anatomy3d';
import { FluoroView } from '../render/scenes/fluoro';
import { phantomShape, type PhantomShape } from '../render/scenes/phantom';
import type { SimEvent } from '../sim/core/events';
import type { ButtonAction, RawPad } from '../sim/core/records';
import { initialCarm } from '../sim/imaging/carm';
import type { Snapshot } from '../sim/snapshot';
import { useHud, type DeviceHud, type HudView, type PadStatus } from '../state/hud';
import { useSession, type Launch, type View } from '../state/session';
import { currentSettings, inputSettingsOf } from '../state/settings';
import { degrees, formatAngles } from '../ui/format';
import { anyPress, applyNav, padNav, type NavAction } from '../ui/nav';
import { PhysicsClient } from '../worker/client';
import type { ReadyMessage } from '../worker/protocol';
import { APP_VERSION, CASE_ID, SESSION_SEED, type AppData } from './appData';
import type { AppFlags } from './flags';
import {
  FrameStats,
  NO_PUFF,
  pastJunctionMm,
  RunningMean,
  stepPuff,
  tipLocation,
  type PuffState,
} from './hudView';

/**
 * One sandbox session on the main thread (spec 01 §3). Each animation frame it polls input through the one input
 * path (the frame it sends the worker is the frame the UI acts on), renders the latest snapshot in the fluoro or 3D
 * view, drives rumble and tones from the events, and refreshes the HUD at its own rate. The worker owns the
 * simulation; nothing here changes it except through step-stamped frames and commands.
 */

const MS_PER_S = 1000;
const CM_PER_M = 100;

export class SandboxRuntime {
  private readonly client: PhysicsClient;
  private readonly keyboard: KeyboardSource;
  private readonly pointer: PointerSource;
  private readonly loop: InputLoop;
  private readonly tones: TonePlayer;
  private readonly frames: FrameStats;
  private readonly physicsMs: RunningMean;
  private readonly steps: RunningMean;
  private readonly shapes = new Map<string, PhantomShape>();
  private readonly graphs = new Map<string, AnatomyGraphSI>();
  private readonly blockedAt = new Map<string, number>();
  private readonly unsubscribe: () => void;
  private handle: RendererHandle | null = null;
  private fluoro: FluoroView | null = null;
  private threeD: Anatomy3dView | null = null;
  private resize: ResizeObserver | null = null;
  private snapshot: Snapshot | null = null;
  private fluoroActive = false;
  private renderedStep = -1;
  private tierId: string | null = null;
  private looks: Readonly<Record<string, DeviceLook>> | null = null;
  private tubes: DeviceTube[] = [];
  private phantomId: string | null = null;
  private rumble: RumbleState = INITIAL_RUMBLE;
  private rumbleEvents: string[] = [];
  private puff: PuffState = NO_PUFF;
  private mapper: MapperState = INITIAL_MAPPER_STATE;
  private previousPad: RawPad | null = null;
  private padPressed = false;
  private padStatus: PadStatus = 'none';
  private reading: PadReading | null = null;
  private view: View = 'fluoro';
  private paused = false;
  private lastHud = Number.NEGATIVE_INFINITY;
  private raf = 0;
  private disposed = false;
  private backend: BackendName | null = null;

  constructor(
    private readonly data: AppData,
    private readonly flags: AppFlags,
    private readonly launch: Launch,
    private readonly container: HTMLElement,
  ) {
    const settings = currentSettings();
    const demo =
      launch.demo === null ? undefined : data.sandbox.autopilot.find((script) => script.id === launch.demo);
    const defaultWire = data.sandbox.initialStack.at(-1);
    this.client = new PhysicsClient({
      caseId: CASE_ID,
      anatomyId: demo?.anatomy ?? launch.anatomyId,
      ...(launch.wire === defaultWire ? {} : { innerDevice: launch.wire }),
      ...(settings.tier === 'auto' ? {} : { tierId: settings.tier }),
      seed: SESSION_SEED,
      settings: inputSettingsOf(settings),
      appVersion: APP_VERSION,
      fast: flags.fast,
      onReady: (ready) => this.onReady(ready),
      onSnapshot: (snapshot) => this.onSnapshot(snapshot),
      onEvents: (events) => this.onEvents(events),
      onPerf: (perf) => {
        this.physicsMs.add(perf.physicsMsPerFrame);
        this.steps.add(perf.stepsPerFrame);
      },
      onError: (message) => this.fail(message),
    });
    this.keyboard = createKeyboardSource(window);
    this.pointer = createPointerSource(container);
    this.loop = createInputLoop({
      client: this.client,
      keyboard: this.keyboard,
      pointer: this.pointer,
      gamepads: navigator,
      settings: () => inputSettingsOf(currentSettings()),
      config: data.input,
    });
    this.tones = createTonePlayer(window);
    const window_ = Math.max(1, Math.round(data.render.targetFrameRate));
    this.frames = new FrameStats(window_);
    this.physicsMs = new RunningMean(window_);
    this.steps = new RunningMean(window_);
    this.unsubscribe = useSession.subscribe((state) => this.onSession(state.panel === 'pause', state.view));
    this.raf = requestAnimationFrame(this.tick);
    void this.boot();
  }

  /** Swaps the inner device for another inventory rod model (swap-device, logged for replay). */
  swapDevice(rodModelId: string): void {
    this.client.command({ cmd: 'swap-device', args: { device: rodModelId } });
    const label = this.data.labels[rodModelId];
    this.toast(
      'info',
      `Exchanging for the ${label?.name ?? rodModelId}: withdrawing to the valve, then feeding.`,
    );
  }

  /** Changes the phantom (set-anatomy, logged for replay); devices go back to their starting depth. */
  setAnatomy(anatomyId: string): void {
    this.client.command({ cmd: 'set-anatomy', args: { anatomy: anatomyId } });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsubscribe();
    this.client.dispose();
    this.keyboard.dispose();
    this.pointer.dispose();
    this.tones.dispose();
    this.resize?.disconnect();
    for (const tube of this.tubes) {
      tube.dispose();
    }
    this.fluoro?.dispose();
    this.threeD?.dispose();
    this.handle?.dispose();
    useHud.getState().set(null);
  }

  // ---------------------------------------------------------------------------------------------------------------

  private async boot(): Promise<void> {
    let handle: RendererHandle;
    try {
      handle = await createRenderer(this.container, { forceWebGL: this.flags.forceWebGL });
    } catch (error) {
      this.fail(`The view could not start: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (this.disposed) {
      handle.dispose();
      return;
    }
    this.handle = handle;
    this.backend = handle.backend;
    this.fluoro = new FluoroView(handle.renderer, this.data.render, this.data.carm);
    this.threeD = new Anatomy3dView(handle.renderer, this.data.render);
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(this.container);
    this.fit();
  }

  private fit(): void {
    const handle = this.handle;
    if (handle === null) {
      return;
    }
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const ratio = window.devicePixelRatio;
    handle.renderer.setPixelRatio(ratio);
    handle.renderer.setSize(width, height, false);
    this.fluoro?.setSize(Math.floor(width * ratio), Math.floor(height * ratio));
    this.threeD?.setSize(width, height);
  }

  private onSnapshot(snapshot: Snapshot): void {
    // Fluoro is on for the monitor if any step since the last snapshot ran with it: with ?fast=1 one message covers
    // seconds of simulated time, and its last step alone would alias with the demo's fluoro taps.
    const previous = this.snapshot?.step ?? 0;
    this.fluoroActive = snapshot.input.fluoro > 0 || snapshot.fluoroLastStep >= previous;
    this.snapshot = snapshot;
  }

  private onReady(ready: ReadyMessage): void {
    this.tierId = ready.tierId;
    this.looks = deviceLooks(this.data.repository, ready.tierId, this.data.render);
    if (this.launch.demo !== null) {
      for (const command of demoCommands(this.data.repository, CASE_ID, this.launch.demo, 0)) {
        this.client.command({ cmd: command.cmd, args: command.args });
      }
    }
  }

  private onSession(paused: boolean, view: View): void {
    const now = performance.now();
    if (paused !== this.paused) {
      this.paused = paused;
      if (paused) {
        this.client.pause(now);
      } else {
        this.client.resume(now);
      }
    }
    if (view !== this.view) {
      this.view = view;
      if (view === '3d') {
        const carm = this.snapshot?.carm;
        this.threeD?.frame(carm?.rotation ?? 0, carm?.angulation ?? 0);
      }
    }
  }

  private onEvents(events: readonly SimEvent[]): void {
    const now = performance.now() / MS_PER_S;
    for (const event of events) {
      switch (event.type) {
        case 'hub-force-warning':
          this.rumbleEvents.push(event.type);
          break;
        case 'hub-force-danger':
          this.rumbleEvents.push(event.type);
          this.tones.play(this.data.render.audio.alarm);
          break;
        case 'blocked-action': {
          // The engine reports each block once; the message is debounced so a held push does not flood the screen.
          const last = this.blockedAt.get(event.ruleId) ?? Number.NEGATIVE_INFINITY;
          if (now - last >= this.data.render.hud.blockedMessageDebounce) {
            this.blockedAt.set(event.ruleId, now);
            const source = ruleSource(this.data.repository, event.ruleId);
            this.toast('blocked', event.message, source ?? undefined);
            this.tones.play(this.data.render.audio.blocked);
          }
          break;
        }
        case 'autopilot-done':
          this.toast('success', 'Demo finished. The controls are yours.');
          break;
        case 'tip-entered-segment':
          break;
      }
    }
  }

  private toast(
    kind: 'info' | 'blocked' | 'success' | 'warning',
    text: string,
    source?: { readonly title: string; readonly url: string | null },
  ): void {
    const until = performance.now() / MS_PER_S + this.data.render.hud.toastDuration;
    useSession.getState().toast({ kind, text, until, ...(source === undefined ? {} : { source }) });
  }

  private fail(message: string): void {
    this.toast('warning', message);
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) {
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
    this.frames.add(now);
    const demoRunning = (this.snapshot?.autopilot ?? null) !== null;
    const result = this.loop.frame(now, demoRunning);
    this.mapper = result.mapper;
    this.reading = result.reading;
    const nav = padNav(result.reading.pad, this.previousPad);
    if (anyPress(result.reading.pad, this.previousPad)) {
      this.padPressed = true;
    }
    this.previousPad = result.reading.pad;
    this.padStatus =
      result.reading.gamepad === null
        ? 'none'
        : !result.reading.standard
          ? 'non-standard'
          : this.padPressed
            ? 'ready'
            : 'waiting';
    this.handleButtons(result.frame.buttons, nav.length > 0);
    this.handleNav(nav);
    this.render(now);
    this.rumbleTick(now);
    useSession.getState().expireToasts(now / MS_PER_S);
    if (now - this.lastHud >= MS_PER_S / this.data.render.hud.refreshRate) {
      this.lastHud = now;
      useHud.getState().set(this.hudView());
    }
  };

  /** UI actions from the frame's buttons (the same frame the worker gets). */
  private handleButtons(buttons: readonly ButtonAction[], padNavigated: boolean): void {
    const session = useSession.getState();
    for (const action of buttons) {
      switch (action) {
        case 'pause':
          session.togglePanel('pause');
          break;
        case 'inspector':
          session.togglePanel('inspector');
          break;
        case 'picker':
          session.togglePanel('picker');
          break;
        case 'perf':
          session.togglePerf();
          break;
        case 'view-3d':
          session.toggleView();
          break;
        case 'roadmap':
          session.toggleRoadmap();
          break;
        case 'back':
          session.closePanel();
          break;
        case 'dsa':
          this.toast('info', 'DSA: available in M2');
          break;
        case 'drugs':
          this.toast('info', 'Drugs and sedation: available in M3');
          break;
        case 'act':
          if (session.panel === null) {
            this.toast('info', 'Nothing to deploy in the sandbox');
          }
          break;
        case 'pair-up':
        case 'pair-down':
          // Tab and Shift+Tab move through an open panel; the D-pad does that through padNav.
          if (session.panel !== null && !padNavigated) {
            const root = document.querySelector('[data-panel]');
            if (root !== null) {
              applyNav(root, action === 'pair-up' ? 'up' : 'down');
            }
          }
          break;
        case 'save-angle': {
          const carm = this.snapshot?.carm;
          if (carm !== undefined && carm !== null) {
            this.toast(
              'success',
              `View saved: ${formatAngles(degrees(carm.rotation), degrees(carm.angulation))}`,
            );
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** The D-pad and A move through and activate an open panel's controls; B arrives as the frame's back. */
  private handleNav(nav: readonly NavAction[]): void {
    if (useSession.getState().panel === null) {
      return;
    }
    const root = document.querySelector('[data-panel]');
    if (root === null) {
      return;
    }
    for (const action of nav) {
      if (action !== 'back') {
        applyNav(root, action);
      }
    }
  }

  private shape(anatomyId: string): PhantomShape {
    let shape = this.shapes.get(anatomyId);
    if (shape === undefined) {
      shape = phantomShape(
        this.graph(anatomyId),
        this.data.sandbox.accessId,
        this.data.sheathLength,
        this.data.render.fluoro.softTissueBandMarginMm,
      );
      this.shapes.set(anatomyId, shape);
    }
    return shape;
  }

  private graph(anatomyId: string): AnatomyGraphSI {
    let graph = this.graphs.get(anatomyId);
    if (graph === undefined) {
      graph = loadAnatomyGraph(this.data.repository, anatomyId);
      this.graphs.set(anatomyId, graph);
    }
    return graph;
  }

  private render(now: number): void {
    const snapshot = this.snapshot;
    const handle = this.handle;
    const looks = this.looks;
    const fluoro = this.fluoro;
    const threeD = this.threeD;
    if (snapshot === null || handle === null || looks === null || fluoro === null || threeD === null) {
      return;
    }
    if (snapshot.anatomyId !== this.phantomId) {
      this.phantomId = snapshot.anatomyId;
      const shape = this.shape(snapshot.anatomyId);
      const sheathRadiusMm =
        0.5 * fromSI(sheathOuterDiameter(this.data.repository, CASE_ID, this.launch.sheathFrench), 'mm');
      fluoro.setPhantom(shape);
      threeD.setPhantom(shape, sheathRadiusMm);
      threeD.frame(snapshot.carm?.rotation ?? 0, snapshot.carm?.angulation ?? 0);
    }
    if (snapshot.step !== this.renderedStep) {
      this.renderedStep = snapshot.step;
      let changed = this.tubes.length !== snapshot.devices.length;
      snapshot.devices.forEach((device, i) => {
        const current = this.tubes[i];
        if (current === undefined || current.look.rodModelId !== device.rodModel) {
          const look = looks[device.rodModel];
          if (look === undefined) {
            return;
          }
          current?.dispose();
          this.tubes[i] = new DeviceTube(
            look,
            device.positionsMm.length / 3,
            this.data.render.tubeRadialSegments,
          );
          changed = true;
        }
        this.tubes[i]?.update(device);
      });
      if (changed) {
        for (const tube of this.tubes.splice(snapshot.devices.length)) {
          tube.dispose();
        }
        fluoro.syncDevices(this.tubes);
        threeD.syncDevices(this.tubes);
      }
    }
    const seconds = now / MS_PER_S;
    this.puff = stepPuff(this.puff, snapshot.input.inject, seconds, this.data.render.fluoro.contrastPuffFade);
    if (this.view === 'fluoro') {
      fluoro.render({
        now: seconds,
        fluoro: this.fluoroActive,
        puff: this.puff.level,
        roadmap: useSession.getState().roadmap,
        pulseRate: currentSettings().pulseRate,
        carm: snapshot.carm ?? initialCarm(this.data.carm),
      });
    } else {
      threeD.render(handle.renderer);
    }
  }

  private rumbleTick(now: number): void {
    const gamepad = this.reading?.gamepad ?? null;
    const settings = currentSettings();
    const tipForce = Math.max(0, ...(this.snapshot?.devices ?? []).map((device) => device.tipNormalForceN));
    const result = rumbleStep(this.rumble, this.data.rumble, {
      time: now / MS_PER_S,
      tipForce,
      events: this.rumbleEvents,
      strength: settings.rumbleStrength,
      enabled: settings.rumbleStrength > 0,
      supported: rumbleSupported(gamepad),
    });
    this.rumbleEvents = [];
    this.rumble = result.state;
    if (result.command !== null) {
      playRumble(gamepad, result.command);
    }
    this.tones.setMuted(settings.muted);
  }

  private hudView(): HudView | null {
    const snapshot = this.snapshot;
    const shiftHeld = ['ShiftLeft', 'ShiftRight'].some((code) => this.keyboard.peek().down.has(code));
    const sheathItem = this.data.repository.devices.get(this.data.sandbox.sheath.deviceId);
    const sheath = {
      name: sheathItem?.genericName ?? 'Sheath',
      french: this.launch.sheathFrench,
      lengthCm: this.data.sheathLength * CM_PER_M,
    };
    const glyphs = this.reading?.glyphs ?? 'generic';
    const perf = {
      fps: this.frames.fps,
      frameMs: this.frames.frameMs,
      physicsMs: this.physicsMs.mean,
      stepsPerFrame: this.steps.mean,
    };
    const shown = this.fluoro?.shown ?? 'none';
    if (snapshot === null) {
      return {
        ready: false,
        mode: this.mapper.mode,
        fine: this.mapper.fine || shiftHeld,
        locked: false,
        demo: this.launch.demo,
        sheath,
        devices: [],
        hubForceN: 0,
        tipForceN: 0,
        wallStress: 0,
        imaging: {
          shown,
          pulseRate: currentSettings().pulseRate,
          rotationDeg: 0,
          angulationDeg: 0,
          sidCm: this.data.carm.defaultSourceToImageDistance * CM_PER_M,
          fieldCm: (this.data.carm.zoomFields[this.data.carm.defaultZoomIndex] ?? 0) * CM_PER_M,
          collimation: this.data.carm.collimation.max,
          fluoroTimeS: 0,
          roadmap: useSession.getState().roadmap,
        },
        backend: this.backend,
        tier: this.tierId,
        perf,
        pad: { status: this.padStatus, glyphs },
        anatomyId: this.launch.anatomyId,
      };
    }
    const graph = this.graph(snapshot.anatomyId);
    const devices = snapshot.devices.map((device): DeviceHud => {
      const label = this.data.labels[device.rodModel];
      return {
        rodModelId: device.rodModel,
        name: label?.name ?? device.rodModel,
        generic: label?.generic ?? '',
        size: label?.size ?? '',
        tube: label?.tube ?? false,
        depthMm: device.pastSheathTipMm,
        rotationDeg: device.hubRotationDeg,
        tipIn: tipLocation(device),
        pastCarinaMm: pastJunctionMm(graph, device),
        hubForceN: device.hubForceN,
        tipForceN: device.tipNormalForceN,
        wallStress: device.wallStress,
      };
    });
    const carm = snapshot.carm ?? initialCarm(this.data.carm);
    const demo = snapshot.autopilot;
    return {
      ready: true,
      // A demo drives in its own mode; live input shows the learner's mode at once.
      mode: demo === null ? this.mapper.mode : snapshot.input.mode,
      fine: this.mapper.fine || shiftHeld,
      locked: snapshot.stack.locked,
      demo,
      sheath,
      devices,
      hubForceN: Math.max(0, ...devices.map((device) => device.hubForceN)),
      tipForceN: Math.max(0, ...devices.map((device) => device.tipForceN)),
      wallStress: Math.max(0, ...devices.map((device) => device.wallStress)),
      imaging: {
        shown,
        pulseRate: currentSettings().pulseRate,
        rotationDeg: degrees(carm.rotation),
        angulationDeg: degrees(carm.angulation),
        sidCm: carm.sourceToImageDistance * CM_PER_M,
        fieldCm: (this.data.carm.zoomFields[carm.zoomIndex] ?? 0) * CM_PER_M,
        collimation: carm.collimation,
        fluoroTimeS: snapshot.fluoroTimeS,
        roadmap: useSession.getState().roadmap,
      },
      backend: this.backend,
      tier: this.tierId,
      perf,
      pad: { status: this.padStatus, glyphs },
      anatomyId: snapshot.anatomyId,
    };
  }
}
