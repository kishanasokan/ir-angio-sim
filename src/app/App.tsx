import { lazy, Suspense } from 'react';
import { useSession } from '../state/session';
import { SandboxSetup } from '../ui/SandboxSetup';
import { StartScreen } from '../ui/StartScreen';

// The sandbox brings three.js and the renderer; loading it on demand keeps the first load small (spec 01 §8).
const SandboxScreen = lazy(async () => ({ default: (await import('../ui/SandboxScreen')).SandboxScreen }));

/** The app shell: the start screen, sandbox setup or the sandbox (main.tsx has already loaded /data and settings). */
export function App() {
  const screen = useSession((state) => state.screen);
  const launch = useSession((state) => state.launch);
  if (screen === 'sandbox' && launch !== null) {
    return (
      <Suspense fallback={<main className="h-full bg-suite-950" aria-busy="true" />}>
        <SandboxScreen key={launch.key} launch={launch} />
      </Suspense>
    );
  }
  if (screen === 'setup') {
    return <SandboxSetup />;
  }
  return <StartScreen />;
}

/** Shown instead of the app when /data does not load, with the validator's message. */
export function DataError({ message }: { readonly message: string }) {
  return (
    <main className="flex min-h-full items-center justify-center p-8">
      <div className="max-w-2xl rounded-xl border border-danger-400/40 bg-suite-900 p-6">
        <h1 className="text-lg font-semibold text-danger-400">The simulator data did not load</h1>
        <pre className="mt-3 overflow-auto text-xs whitespace-pre-wrap text-ink-300">{message}</pre>
      </div>
    </main>
  );
}
