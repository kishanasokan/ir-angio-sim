import { sandboxABuckle } from './sandboxABuckle';
import { sandboxBBend } from './sandboxBBend';
import { sandboxCLeft } from './sandboxCLeft';
import type { AutopilotScript } from './types';

/** The scripts by the ids cases use (data/cases/sandbox.json → autopilot[].id). */
export const AUTOPILOT_SCRIPTS: Readonly<Record<string, AutopilotScript>> = {
  'sandbox-c-left': sandboxCLeft,
  'sandbox-b-bend': sandboxBBend,
  'sandbox-a-buckle': sandboxABuckle,
};
