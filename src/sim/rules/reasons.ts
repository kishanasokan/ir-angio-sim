/**
 * How a rule's failure mode maps to a compatibility status (docs/M1-plan.md D12), and the learner-facing text of a
 * result: a blocked or degraded action always explains itself with the rule's message and source (CLAUDE.md rule 7).
 */

export type FailureMode =
  'block' | 'block-or-friction' | 'jam' | 'degrade' | 'rupture' | 'warn' | 'fail-closure';

export type CompatibilityStatus = 'allow' | 'block' | 'degrade' | 'unknown';

/** Block modes stop the action. The rest allow it and show the consequence or warning. */
export function statusOfFailure(mode: FailureMode): 'block' | 'degrade' {
  return mode === 'block' || mode === 'block-or-friction' ? 'block' : 'degrade';
}

export interface CompatibilityResult {
  readonly status: CompatibilityStatus;
  readonly ruleId: string;
  /** The rule's failure mode, kept for the UI even when the status is allow. */
  readonly mode: FailureMode;
  /** The rule's failure message when blocked or degraded; for unknown, what could not be checked. */
  readonly message: string;
  readonly sourceTitle: string;
}

/** One line for a toast or the setup screen. Allowed results need no explanation. */
export function describeResult(result: CompatibilityResult): string {
  if (result.status === 'allow') {
    return '';
  }
  const source = result.sourceTitle === '' ? '' : ` (${result.sourceTitle})`;
  if (result.status === 'unknown') {
    return `Not checked: ${result.message}${source}`;
  }
  return `${result.message}${source}`;
}
