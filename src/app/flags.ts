/**
 * Test and diagnostic flags read from the page URL. `?fast=1` lets the worker run up to maxStepsPerMessageFast steps
 * per message, for end-to-end tests only (prompts/M1-foundations.md §4). `?webgl=1` forces the WebGL 2 backend so
 * both rendering backends can be tested on a machine that has WebGPU (docs/M1-plan.md Phase D).
 */
export interface AppFlags {
  readonly fast: boolean;
  readonly forceWebGL: boolean;
}

const ON = new Set(['1', 'true', 'yes', '']);

export function readFlags(search: string): AppFlags {
  const params = new URLSearchParams(search);
  const flag = (name: string): boolean => {
    const value = params.get(name);
    return value !== null && ON.has(value.toLowerCase());
  };
  return { fast: flag('fast'), forceWebGL: flag('webgl') };
}
