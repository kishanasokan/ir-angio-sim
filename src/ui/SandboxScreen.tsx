import { useEffect, useRef, useState } from 'react';
import { appData } from '../app/appData';
import { readFlags } from '../app/flags';
import { SandboxRuntime } from '../app/sandboxRuntime';
import { useHud } from '../state/hud';
import { useSession, type Launch } from '../state/session';
import { DeviceInspector } from './DeviceInspector';
import { DevicePicker } from './DevicePicker';
import { DeviceStack, DemoBadge, HintBar, ImagingOverlay, Meters, ModeBadge, SystemChip } from './Hud';
import { PauseMenu } from './PauseMenu';
import { PerfOverlay } from './PerfOverlay';
import { RuntimeContext } from './runtimeContext';
import { Toasts } from './Toasts';

/**
 * The sandbox (prompts/M1-foundations.md §6, §7): the monitor in the middle (fluoro or 3D), the HUD around it, and
 * the panels over it. The runtime owns the canvas, the worker and input; React only draws the HUD and panels from the
 * stores.
 */

export function SandboxScreen({ launch }: { readonly launch: Launch }) {
  const data = appData();
  const monitor = useRef<HTMLDivElement>(null);
  const [runtime, setRuntime] = useState<SandboxRuntime | null>(null);
  const hud = useHud((state) => state.hud);
  const panel = useSession((state) => state.panel);
  const view = useSession((state) => state.view);
  const perf = useSession((state) => state.perf);

  useEffect(() => {
    const element = monitor.current;
    if (element === null) {
      return;
    }
    const created = new SandboxRuntime(data, readFlags(window.location.search), launch, element);
    setRuntime(created);
    return () => {
      created.dispose();
      setRuntime(null);
    };
  }, [data, launch]);

  return (
    <RuntimeContext.Provider value={runtime}>
      <main
        className="relative flex h-full w-full flex-col overflow-hidden bg-suite-950"
        data-testid="sandbox"
        data-anatomy={hud?.anatomyId}
      >
        <div className="relative flex min-h-0 flex-1 gap-4 p-4">
          <aside className="z-10 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto max-lg:absolute max-lg:top-4 max-lg:left-4 max-lg:w-64">
            {hud !== null && (
              <>
                <ModeBadge hud={hud} />
                <DeviceStack hud={hud} />
              </>
            )}
          </aside>

          <section className="relative min-w-0 flex-1 [container-type:size]">
            <div className="absolute inset-0 m-auto aspect-square w-[min(100cqw,100cqh)] overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
              <div ref={monitor} className="absolute inset-0" data-testid="monitor" data-view={view} />
              {hud !== null && view === 'fluoro' && <ImagingOverlay hud={hud} />}
              {view === '3d' && (
                <p className="pointer-events-none absolute top-3 left-3 font-mono text-xs text-white/60">
                  3D VIEW · Alt + mouse to orbit
                </p>
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
              {hud !== null && <DemoBadge hud={hud} />}
            </div>
          </section>

          <aside className="z-10 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto max-lg:absolute max-lg:top-4 max-lg:right-4 max-lg:w-64">
            {hud !== null && (
              <>
                <Meters hud={hud} config={data.render.hud} />
                <SystemChip hud={hud} />
                {perf && (
                  <PerfOverlay
                    hud={hud}
                    targetFps={data.render.targetFrameRate}
                    physicsBudgetMs={data.physicsBudgetMs}
                  />
                )}
              </>
            )}
          </aside>
        </div>

        <footer className="px-4 pb-3">{hud !== null && <HintBar hud={hud} />}</footer>

        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-30 flex justify-center px-4">
          <Toasts />
        </div>

        {panel !== null && hud !== null && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-suite-950/55 p-4 backdrop-blur-[2px]">
            {panel === 'picker' && <DevicePicker hud={hud} />}
            {panel === 'inspector' && <DeviceInspector hud={hud} sheathFrench={launch.sheathFrench} />}
            {panel === 'pause' && <PauseMenu hud={hud} />}
          </div>
        )}
      </main>
    </RuntimeContext.Provider>
  );
}
