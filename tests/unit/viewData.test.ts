import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRodInstance } from '../../src/data/catalog';
import { inspectorTabs, humanize } from '../../src/data/inspector';
import { loadAnatomyGraph } from '../../src/data/loaders';
import { deviceLook, renderConfig } from '../../src/data/renderConfig';
import {
  choiceCheck,
  deviceLabel,
  inventoryInstances,
  pairChecks,
  ruleSource,
  sheathInstance,
} from '../../src/data/sandboxChoices';
import { carmParams, sheathLength } from '../../src/data/simConfig';
import { createTubeBuffers, tubeSize, writeTube } from '../../src/render/geometry/tube';
import { blurWeights } from '../../src/render/post/fluoroPost';
import { boundingBoxCenter, fluoroCameraPose } from '../../src/render/scenes/carmCamera';
import { phantomShape } from '../../src/render/scenes/phantom';
import { initialCarm, projectToImage, stepCarm } from '../../src/sim/imaging/carm';
import { repository, tierSegmentLength } from '../helpers/repository';

// Phase D's data and view helpers: setup and picker checks, labels, the inspector, render settings, the phantom shape,
// the fluoro camera and tube geometry.

const CASE = 'sandbox-phantoms';
const catheter = () => buildRodInstance(repository(), 'rm-berenstein-5f-65', tierSegmentLength('high'));

describe('sandbox setup and picker checks', () => {
  it('blocks the 5F catheter in a 4F sheath with the rule message and source, and allows 5F and 6F', () => {
    const check = (french: number) =>
      choiceCheck(
        pairChecks(repository(), CASE, sheathInstance(repository(), CASE, french), catheter().item),
      );
    const blocked = check(4);
    expect(blocked.blocked).toBe(true);
    expect(blocked.worst?.ruleId).toBe('fit-catheter-sheath');
    expect(blocked.worst?.message).toBe('This catheter will not enter the sheath valve.');
    expect(blocked.worst?.sourceTitle).toContain('Radiology Key');
    expect(ruleSource(repository(), 'fit-catheter-sheath')?.url).toMatch(/^https:\/\//);
    expect(check(5).blocked).toBe(false);
    expect(check(6).blocked).toBe(false);
  });

  it('allows every inventory wire with the 5F catheter, and labels brand next to generic name', () => {
    const wires = inventoryInstances(repository(), CASE, 'high').filter(
      (instance) => instance.innerDiameter === null,
    );
    expect(wires.map((wire) => wire.rodModelId)).toEqual([
      'rm-glidewire-035-angled-150',
      'rm-bentson-035-145',
      'rm-amplatz-bard-035-180',
    ]);
    for (const wire of wires) {
      expect(choiceCheck(pairChecks(repository(), CASE, catheter().item, wire.item)).blocked).toBe(false);
    }
    // The Bentson and Amplatz items list no length; their rod models' placeholder lengths reach the rule.
    for (const wire of wires) {
      const length = pairChecks(repository(), CASE, catheter().item, wire.item).find(
        (result) => result.ruleId === 'limit-wire-length',
      );
      expect(length?.status).toBe('allow');
    }
    const label = deviceLabel(wires[0]!);
    expect(label).toMatchObject({ name: 'Glidewire', generic: 'Hydrophilic nitinol guidewire', tube: false });
    expect(label.size).toBe('0.035 in · 150 cm');
    expect(deviceLabel(catheter()).tube).toBe(true);
  });
});

describe('device inspector', () => {
  const tabs = inspectorTabs(repository(), {
    caseId: CASE,
    devices: [
      catheter(),
      buildRodInstance(repository(), 'rm-glidewire-035-angled-150', tierSegmentLength('high')),
    ],
    sheathFrench: 5,
    anatomyId: 'phantom-c-bifurcation',
    tierId: 'high',
  });

  it('has a tab per device, then the sheath, the phantom and the solver', () => {
    expect(tabs.map((tab) => tab.id)).toEqual([
      'rm-berenstein-5f-65',
      'rm-glidewire-035-angled-150',
      'sheath',
      'phantom',
      'solver',
    ]);
    expect(humanize('maxStepsPerMessage')).toBe('Max steps per message');
  });

  it('shows the placeholders and the estimated body modulus of the Glidewire with their notes', () => {
    const glidewire = tabs[1]!;
    const placeholders = glidewire.rows.filter((row) => row.confidence === 'placeholder');
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.every((row) => row.note !== null)).toBe(true);
    const body = glidewire.rows.find((row) => row.label === "Body Young's modulus");
    expect(body?.confidence).toBe('estimated');
    expect(body?.clinical).toEqual({ kind: 'number', value: 8, unit: 'GPa' });
    expect(body?.si).toEqual({ kind: 'number', value: 8e9, unit: 'Pa' });
  });

  it('links sourced values to their sources and covers every solver and feedback value', () => {
    const solver = tabs.find((tab) => tab.id === 'solver')!;
    const labels = solver.rows.map((row) => row.label);
    for (const key of Object.keys(repository().physics.solver)) {
      expect(labels).toContain(`Solver: ${humanize(key)}`);
    }
    for (const key of Object.keys(repository().physics.feedback)) {
      expect(labels).toContain(`Feedback: ${humanize(key)}`);
    }
    const rotation = solver.rows.find((row) => row.label === 'C-arm: Rotation speed max');
    expect(rotation?.confidence).toBe('sourced');
    expect(rotation?.sources[0]?.url).toMatch(/^https:\/\//);
    const wallStress = solver.rows.find((row) => row.label === 'Feedback: Wall stress threshold');
    expect(wallStress?.confidence).toBe('placeholder');
    const sheath = tabs.find((tab) => tab.id === 'sheath')!;
    expect(sheath.rows[0]?.clinical).toMatchObject({ kind: 'options', selected: 5 });
  });
});

describe('render settings', () => {
  const config = renderConfig(repository());

  it('converts the display values once, from data', () => {
    expect(config.fluoro.pulseRates).toEqual([3.75, 7.5, 15, 30]);
    expect(config.fluoro.defaultPulseRate).toBe(7.5);
    expect(config.fluoro.softTissueBandMarginMm).toBeCloseTo(15, 9);
    expect(config.hud.wallStressFullScale).toBeCloseTo(0.5 * 5, 12);
    expect(config.hud.hubForceDanger).toBe(0.8);
    expect(config.audio.alarm.duration).toBeCloseTo(0.22, 12);
  });

  it('boosts the radiopacity of the distal section only', () => {
    const look = deviceLook(
      buildRodInstance(repository(), 'rm-glidewire-035-angled-150', tierSegmentLength('high')),
      config,
    );
    const count = look.radiopacity.length;
    // The Glidewire's tip section is the distal 30 mm: 15 segments of 2 mm.
    expect(look.radiopacity[count - 1]).toBeCloseTo(1.5, 6);
    expect(look.radiopacity[count - 15]).toBeCloseTo(1.5, 6);
    expect(look.radiopacity[count - 16]).toBeCloseTo(1, 6);
    expect(look.tube).toBe(false);
    expect(look.outerRadiusMm).toBeCloseTo((0.035 * 25.4) / 2, 9);
  });
});

describe('phantom shape and fluoro camera', () => {
  const graph = loadAnatomyGraph(repository(), 'phantom-c-bifurcation');
  const shape = phantomShape(graph, 'inlet-sheath', sheathLength(repository(), CASE), 15);

  it('puts the isocenter at the lumen bounding-box center and closes caps and the junction', () => {
    expect(shape.isocenter[0]).toBeCloseTo(0, 9);
    expect(shape.isocenter[2]).toBeCloseTo((-4 + 236.6025 + 2.5) / 2, 3);
    const parent = shape.tubes.find((tube) => tube.id === 'c-parent')!;
    const left = shape.tubes.find((tube) => tube.id === 'c-left')!;
    expect(parent).toMatchObject({ domeStart: false, domeEnd: true });
    expect(left).toMatchObject({ domeStart: false, domeEnd: true });
    expect(shape.sheath.valve[2]).toBeCloseTo(-110, 6);
    expect(boundingBoxCenter([], [])).toEqual([0, 0, 0]);
  });

  it('projects like projectToImage once the image is mirrored, at any C-arm pose and table pan', () => {
    const params = carmParams(repository());
    let state = initialCarm(params);
    const poses = [state];
    for (let n = 0; n < 1500; n += 1) {
      state = stepCarm(
        state,
        params,
        {
          rotate: 1,
          angulate: 0.6,
          detector: 0.5,
          panLateral: 0.4,
          panLongitudinal: -0.3,
          height: 0.5,
          collimation: 0,
        },
        1e-3,
      );
    }
    poses.push(state);
    const isocenterM: [number, number, number] = [
      shape.isocenter[0] / 1000,
      shape.isocenter[1] / 1000,
      shape.isocenter[2] / 1000,
    ];
    for (const pose of poses) {
      const camera = new PerspectiveCamera();
      const p = fluoroCameraPose(pose, params, shape.isocenter);
      camera.fov = p.fovDeg;
      camera.aspect = 1;
      camera.near = 1;
      camera.far = 5000;
      camera.position.set(...p.position);
      camera.up.set(...p.up);
      camera.lookAt(...p.target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const point of [
        [20, 0, 150],
        [-30, 5, 100],
        [45, -3, 220],
      ] as const) {
        const scene = new Vector3(
          point[0] + p.patientOffset[0],
          point[1] + p.patientOffset[1],
          point[2] + p.patientOffset[2],
        );
        const ndc = scene.project(camera);
        const expected = projectToImage(
          [point[0] / 1000, point[1] / 1000, point[2] / 1000],
          isocenterM,
          pose,
          params,
        );
        // The post pass mirrors x.
        expect(-ndc.x).toBeCloseTo(expected.u, 6);
        expect(ndc.y).toBeCloseTo(expected.v, 6);
      }
    }
  });
});

describe('tube geometry', () => {
  it('puts every ring vertex at the radius with unit outward normals and outward-facing triangles', () => {
    const points = new Float32Array([0, 0, 0, 0, 0, 10, 2, 0, 20, 6, 0, 28]);
    const layout = { radial: 8, domeRings: 2 };
    const domes = { start: false, end: true };
    const size = tubeSize(4, layout, domes);
    const out = createTubeBuffers(size.vertices, size.indices);
    const written = writeTube(
      points,
      0,
      4,
      () => 1.5,
      (i) => i,
      layout,
      domes,
      out,
    );
    expect(written).toEqual(size);
    // The first ring sits 1.5 mm from the first point, normals point out.
    for (let k = 0; k < layout.radial; k += 1) {
      const x = out.positions[3 * k]!;
      const y = out.positions[3 * k + 1]!;
      expect(Math.hypot(x, y)).toBeCloseTo(1.5, 5);
      expect(Math.hypot(out.normals[3 * k]!, out.normals[3 * k + 1]!, out.normals[3 * k + 2]!)).toBeCloseTo(
        1,
        5,
      );
    }
    // Every triangle's face normal agrees with its vertices' normals (counter-clockwise from outside).
    for (let t = 0; t < written.indices; t += 3) {
      const [a, b, c] = [out.indices[t]!, out.indices[t + 1]!, out.indices[t + 2]!];
      const p = (i: number) =>
        new Vector3(out.positions[3 * i], out.positions[3 * i + 1], out.positions[3 * i + 2]);
      const face = p(b)
        .sub(p(a))
        .cross(p(c).sub(p(a)));
      const normal = new Vector3(out.normals[3 * a], out.normals[3 * a + 1], out.normals[3 * a + 2]);
      expect(face.dot(normal)).toBeGreaterThan(0);
    }
    // Per-vertex values follow their points.
    expect(out.values[0]).toBe(0);
    expect(out.values[3 * layout.radial]).toBe(3);
  });

  it('normalizes the blur kernel', () => {
    const w = blurWeights(0.6);
    expect(w.center + 4 * w.edge + 4 * w.corner).toBeCloseTo(1, 12);
    expect(w.center).toBeGreaterThan(w.edge);
    expect(blurWeights(0)).toEqual({ center: 1, edge: 0, corner: 0 });
  });
});
