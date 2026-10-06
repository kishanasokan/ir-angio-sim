import { appData } from '../app/appData';
import type { HudView } from '../state/hud';
import { useSession } from '../state/session';
import { ControlsReference } from './ControlsOverlay';
import { Button, Panel } from './primitives';
import { useRuntime } from './runtimeContext';
import { SettingsPanel } from './SettingsPanel';

/**
 * The pause menu (Menu or Esc; prompts/M1-foundations.md §7): resume, change phantom, settings, controls and quit to
 * start. The simulation stops while it is open. Changing the phantom issues a logged set-anatomy command.
 */

export function PauseMenu({ hud }: { readonly hud: HudView }) {
  const data = appData();
  const runtime = useRuntime();
  const page = useSession((state) => state.pausePage);
  const setPage = useSession((state) => state.setPausePage);
  const close = useSession((state) => state.closePanel);
  const goTo = useSession((state) => state.goTo);
  const resume = () => useSession.setState({ panel: null, pausePage: 'menu' });

  if (page === 'settings') {
    return (
      <Panel title="Settings" testId="pause-settings" onClose={close} className="w-[min(32rem,92vw)]">
        <div className="max-h-[70vh] overflow-auto px-5 py-3">
          <SettingsPanel limits={data.limits} />
        </div>
      </Panel>
    );
  }
  if (page === 'controls') {
    return (
      <Panel title="Controls" testId="pause-controls" onClose={close} className="w-[min(56rem,94vw)]">
        <div className="max-h-[72vh] overflow-auto p-4">
          <ControlsReference glyphs={hud.pad.glyphs} />
        </div>
      </Panel>
    );
  }
  if (page === 'phantom') {
    return (
      <Panel
        title="Change phantom"
        subtitle="The devices go back to their starting depth."
        testId="pause-phantom"
        onClose={close}
        className="w-[min(30rem,92vw)]"
      >
        <ul className="space-y-2 p-4">
          {data.sandbox.anatomy.options.map((id) => (
            <li key={id}>
              <Button
                className="w-full text-left"
                variant={id === hud.anatomyId ? 'primary' : 'secondary'}
                data-testid={`pause-phantom-${id}`}
                onClick={() => {
                  runtime?.setAnatomy(id);
                  resume();
                }}
              >
                {data.repository.anatomyGraphs.get(id)?.name ?? id}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
  return (
    <Panel title="Paused" testId="pause-menu" className="w-[min(22rem,90vw)]">
      <div className="grid gap-2 p-4">
        <Button variant="primary" autoFocus data-testid="pause-resume" onClick={resume}>
          Resume
        </Button>
        <Button onClick={() => setPage('phantom')}>Change phantom</Button>
        <Button onClick={() => setPage('settings')}>Settings</Button>
        <Button onClick={() => setPage('controls')}>Controls</Button>
        <Button variant="ghost" data-testid="pause-quit" onClick={() => goTo('start')}>
          Quit to start
        </Button>
      </div>
    </Panel>
  );
}
