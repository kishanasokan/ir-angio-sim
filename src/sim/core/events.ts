/** Events the engine emits; the HUD, rumble scheduler and tests read them (prompts/M1-foundations.md §2). */

export type SimEvent =
  | {
      readonly type: 'hub-force-warning';
      readonly step: number;
      readonly device: string;
      readonly forceN: number;
    }
  | {
      readonly type: 'hub-force-danger';
      readonly step: number;
      readonly device: string;
      readonly forceN: number;
    }
  | {
      readonly type: 'tip-entered-segment';
      readonly step: number;
      readonly device: string;
      readonly segment: string;
      readonly name: string;
    }
  | {
      readonly type: 'blocked-action';
      readonly step: number;
      readonly device: string;
      readonly ruleId: string;
      readonly message: string;
    }
  | { readonly type: 'autopilot-done'; readonly step: number; readonly script: string };

export type SimEventType = SimEvent['type'];
