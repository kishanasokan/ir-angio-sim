import { evaluateRule, rulesForPair, worstResult } from '../sim/rules/compatibility';
import type { CompatibilityResult } from '../sim/rules/reasons';
import {
  buildItemInstance,
  buildRodInstance,
  resolveItemPath,
  type ItemInstance,
  type RodDeviceInstance,
} from './catalog';
import { loadCase, type CaseSI, type Repository } from './loaders';
import { ruleEnvironment, ruleSpecs } from './ruleEnvironment';
import { tierParams } from './simConfig';

/**
 * What sandbox setup and the device picker show (prompts/M1-foundations.md §3, §7): device labels with the brand next
 * to the generic name (CLAUDE.md rule 11), and the static compatibility checks for a pairing, with each rule's message
 * and source so a blocked choice explains itself (CLAUDE.md rule 7). State rules are skipped here; the engine runs
 * them (docs/M1-plan.md D12).
 */

export interface DeviceLabel {
  readonly rodModelId: string;
  /** The brand name when there is one, else the generic name. */
  readonly name: string;
  readonly generic: string;
  readonly manufacturer: string | null;
  /** Size as written in /data, for example "0.035 in · 150 cm" or "5 Fr · 65 cm". */
  readonly size: string;
  readonly kind: string;
  /** A tube (catheter) rather than a solid wire. */
  readonly tube: boolean;
}

function written(value: { readonly clinical: { readonly value: number; readonly unit: string } }): string {
  return `${value.clinical.value} ${value.clinical.unit}`;
}

export function deviceLabel(instance: RodDeviceInstance): DeviceLabel {
  const generic = instance.genericName ?? instance.brandName ?? instance.rodModelId;
  return {
    rodModelId: instance.rodModelId,
    name: instance.brandName ?? generic,
    generic,
    manufacturer: instance.manufacturer ?? null,
    size: `${written(instance.outerDiameter)} · ${written(instance.length)}`,
    kind: instance.kind,
    tube: instance.innerDiameter !== null,
  };
}

/** Rod instances for every rod model in a case's inventory, laid out for a tier. */
export function inventoryInstances(repository: Repository, caseId: string, tierId: string): RodDeviceInstance[] {
  const { segmentLength } = tierParams(repository, tierId);
  return loadCase(repository, caseId).inventory.map((id) => buildRodInstance(repository, id, segmentLength));
}

/** The case's sheath item with a French size selected. */
export function sheathInstance(repository: Repository, caseId: string, french: number): ItemInstance {
  const sandbox = loadCase(repository, caseId);
  const item = repository.devices.get(sandbox.sheath.deviceId);
  if (item === undefined) {
    throw new Error(`Case ${caseId}: no sheath device "${sandbox.sheath.deviceId}".`);
  }
  return buildItemInstance(item, { innerDiameter: { value: french, unit: 'Fr' } });
}

/** Every static rule result for two devices, through the rules file's roles table. */
export function pairChecks(
  repository: Repository,
  caseId: string,
  a: ItemInstance,
  b: ItemInstance,
): CompatibilityResult[] {
  const results: CompatibilityResult[] = [];
  for (const match of rulesForPair(ruleSpecs(repository), repository.rules.roles, a.kind, b.kind)) {
    const environment = ruleEnvironment(repository, { [match.roleA]: a, [match.roleB]: b }, caseId);
    const result = evaluateRule(match.rule, environment);
    if (result !== null) {
      results.push(result);
    }
  }
  return results;
}

export interface ChoiceCheck {
  readonly results: readonly CompatibilityResult[];
  /** The most serious result, or null when no rule applies. */
  readonly worst: CompatibilityResult | null;
  readonly blocked: boolean;
}

export function choiceCheck(results: readonly CompatibilityResult[]): ChoiceCheck {
  const worst = worstResult(results);
  return { results, worst, blocked: worst?.status === 'block' };
}

/** A rule's source, for a link: its registry title and URL. */
export function ruleSource(
  repository: Repository,
  ruleId: string,
): { readonly id: string; readonly title: string; readonly url: string } | null {
  const rule = repository.rules.rules.find((entry) => entry.id === ruleId);
  const sourceId = typeof rule?.source === 'string' ? rule.source : undefined;
  const source = sourceId === undefined ? undefined : repository.sources.get(sourceId);
  return source === undefined ? null : { id: source.id, title: source.title, url: source.url };
}

/**
 * The sheath's outer diameter for drawing, m: the selected French size (its inner diameter) plus the largest sourced
 * difference between outer and inner diameter, or the inner diameter alone when that is missing.
 */
export function sheathOuterDiameter(repository: Repository, caseId: string, french: number): number {
  const instance = sheathInstance(repository, caseId, french);
  const inner = resolveItemPath(instance, 'geometry.innerDiameter');
  const over = resolveItemPath(instance, 'geometry.outerDiameterOverInner', 'max');
  const innerSI = inner.status === 'resolved' ? (inner.valueSI ?? 0) : 0;
  const overSI = over.status === 'resolved' ? (over.valueSI ?? 0) : 0;
  return innerSI + overSI;
}

/** The case's starting sheath size, French: its selection, or the first size it offers. */
export function defaultSheathFrench(sandbox: CaseSI): number {
  const selection = sandbox.sheath.select.innerDiameter;
  const value = typeof selection === 'object' ? selection.value : selection;
  const french = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(french) ? french : (sandbox.sheath.choices[0] ?? 0);
}
