## What and why

<!-- What this changes, and why. Link the issue and the spec, plan section or decision it follows. -->

## Checks

<!-- Paste the relevant output, for example the test summary and any golden-scene values that moved. -->

- [ ] `npm run lint`, `npm run typecheck`, `npm run validate-data`, `npm test` and `npm run build` pass
- [ ] Every new pure function has a test; physics changes have a golden scene; screen flows have an end-to-end check

## Golden rules (CLAUDE.md)

- [ ] The disclaimer is unchanged
- [ ] No invented numbers: new values are in `/data` with a unit, a confidence and a source (or `placeholder` with a note)
- [ ] Design values are in `data/tuning/` with a note, and logged in the plan's Progress log
- [ ] `src/sim/` stays pure and deterministic
- [ ] No golden tolerance was loosened; any changed expected value has the owner's approval and a reason in the commit message
- [ ] New dependencies are MIT, BSD, Apache-2.0 or similar
- [ ] No runtime network calls; no vendor logos or copied vendor screens
