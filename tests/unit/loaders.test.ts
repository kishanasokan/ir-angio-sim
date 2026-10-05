import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDataFiles } from '../../scripts/lib/dataFiles';
import { BUNDLED_DATA_FILES } from '../../src/data/bundledFiles';
import { DataLoadError, loadAnatomyGraph, loadCase, loadRepository } from '../../src/data/loaders';
import { DATA_ROOT, FIXTURES_ROOT, repository } from '../helpers/repository';

// Loaders for the anatomy graphs in data/anatomy/phantoms/ and the case data/cases/sandbox.json
// (prompts/M1-foundations.md §1.6).

const millimetre = 1e-3;

describe('loaders', () => {
  it('loads the repository with every singleton file and index', () => {
    const repo = repository();
    expect(repo.devices.get('gw-glidewire')?.brandName).toBe('Glidewire');
    expect([...repo.rodModels.keys()]).toContain('rm-berenstein-5f-65');
    expect(repo.friction.get('fr-device-in-device')?.coefficient.value).toBe(0.1);
    expect(repo.physics.category).toBe('physics');
    expect(repo.input.category).toBe('input');
    expect(repo.render.category).toBe('render');
    expect(repo.sources.get('harrison2011')?.opened).toBe(true);
  });

  it('refuses data that fails validation, listing the errors', () => {
    const files = readDataFiles(join(FIXTURES_ROOT, 'graph'));
    expect(() => loadRepository(files)).toThrow(DataLoadError);
    try {
      loadRepository(files);
    } catch (error) {
      expect(error instanceof DataLoadError && error.errors.map((entry) => entry.code)).toEqual(['graph']);
    }
  });

  it('loads phantom C in metres, in the LPS frame', () => {
    const graph = loadAnatomyGraph(repository(), 'phantom-c-bifurcation');
    const carina = graph.nodes.find((node) => node.id === 'carina');
    expect(carina?.position).toEqual([0, 0, 150 * millimetre]);
    const left = graph.segments.find((segment) => segment.id === 'c-left');
    expect(left?.tags.name).toBe('left daughter');
    expect(left?.radii.every((radius) => Math.abs(radius - 2.5 * millimetre) < 1e-15)).toBe(true);
    // The left daughter runs toward +x, patient left.
    expect(left?.centerline.at(-1)?.[0]).toBeGreaterThan(0);
    expect(graph.access).toEqual([
      { id: 'inlet-sheath', node: 'inlet', position: [0, 0, 0], direction: [0, 0, 1] },
    ]);
  });

  it('loads the sandbox case with SI start values and autopilot parameters', () => {
    const sandbox = loadCase(repository(), 'sandbox-phantoms');
    expect(sandbox.anatomy.default).toBe('phantom-c-bifurcation');
    expect(sandbox.sheath).toEqual({
      deviceId: 'sheath-introducer',
      select: { innerDiameter: { value: 5, unit: 'Fr' } },
      choices: [4, 5, 6],
    });
    expect(sandbox.initialStack).toEqual(['rm-berenstein-5f-65', 'rm-glidewire-035-angled-150']);
    const [catheter, wire] = sandbox.insertion;
    expect(catheter?.tipBeyondAccess.value).toBeCloseTo(20 * millimetre, 15);
    expect(wire?.tipBeyondAccess.value).toBeCloseTo(30 * millimetre, 15);
    expect(wire?.hubRotation.value).toBeCloseTo(Math.PI, 15);
    expect(sandbox.targetDistance?.value).toBeCloseTo(0.3, 15);
    const cLeft = sandbox.autopilot.find((script) => script.id === 'sandbox-c-left');
    expect(cLeft?.params.wireStopBelowCarina?.value).toBeCloseTo(60 * millimetre, 15);
    expect(cLeft?.params.tipAlignTolerance?.value).toBeCloseTo((10 * Math.PI) / 180, 15);
    const buckle = sandbox.autopilot.find((script) => script.id === 'sandbox-a-buckle');
    expect(buckle?.params.pushSpeed?.value).toBeCloseTo(20 * millimetre, 15);
  });

  it('bundles exactly the bytes validate-data reads', () => {
    expect(BUNDLED_DATA_FILES).toEqual(readDataFiles(DATA_ROOT));
  });
});
