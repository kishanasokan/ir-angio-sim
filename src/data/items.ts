import { isRecord } from './facts';

/** The property groups of a device item (spec 02 §7.1), searched in this order. */
export const PROPERTY_GROUPS = ['geometry', 'mechanics', 'ratings', 'compatibility'] as const;

export interface ItemProperty {
  /** Where the property lives in the item, for example geometry.diameter. */
  readonly path: string;
  readonly fact: Readonly<Record<string, unknown>>;
}

/**
 * Finds a device item's property by name: in its property groups first, then at the top level. Selections name
 * properties this way, so {"diameter": …} selects geometry.diameter (spec 02 §4.4).
 */
export function findItemProperty(item: Readonly<Record<string, unknown>>, key: string): ItemProperty | undefined {
  for (const group of PROPERTY_GROUPS) {
    const properties = item[group];
    if (isRecord(properties)) {
      const fact = properties[key];
      if (isRecord(fact)) {
        return { path: `${group}.${key}`, fact };
      }
    }
  }
  const top = item[key];
  return isRecord(top) ? { path: key, fact: top } : undefined;
}

/** Reads a dotted path such as mechanics.bodyFlexuralModulus. */
export function getPath(root: unknown, path: string): unknown {
  let node = root;
  for (const part of path.split('.')) {
    if (!isRecord(node)) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}
