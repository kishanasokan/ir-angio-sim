import { createContext, useContext } from 'react';
import type { SandboxRuntime } from '../app/sandboxRuntime';

/** The running sandbox, for panels that issue commands (the picker's swap-device, the pause menu's set-anatomy). */
export const RuntimeContext = createContext<SandboxRuntime | null>(null);

export function useRuntime(): SandboxRuntime | null {
  return useContext(RuntimeContext);
}
