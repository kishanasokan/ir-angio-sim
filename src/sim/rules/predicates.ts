/**
 * Named predicates for `state` rules (spec 02 §8; docs/M1-plan.md D12). Static checks in setup and the picker skip
 * state rules; the engine evaluates these each step.
 */

/**
 * wire-leads-catheter (order-catheter-over-wire): a catheter may stand in the vessel only behind the wire tip. Inside
 * the sheath it may move freely. Insertion depths are measured from the sheath valve, m.
 */
export function wireLeadsCatheter(
  catheterInserted: number,
  wireInserted: number,
  sheathLength: number,
): boolean {
  return catheterInserted <= Math.max(sheathLength, wireInserted);
}

export interface OrderState {
  readonly catheterInserted: number;
  readonly wireInserted: number;
  readonly sheathLength: number;
}

/** The predicates by the condition names data/rules uses, bound to a state; a missing name evaluates to unknown. */
export function statePredicates(state: OrderState): Readonly<Record<string, () => boolean>> {
  return {
    'wire-leads-catheter': () =>
      wireLeadsCatheter(state.catheterInserted, state.wireInserted, state.sheathLength),
  };
}
