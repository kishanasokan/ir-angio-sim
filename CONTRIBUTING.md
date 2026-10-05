# Contributing

Thanks for helping build the IR Angio Suite Simulator. It is an educational simulation, not a medical device: every change must keep it honest about what it models and where its numbers come from.

## Before you start

1. Read [CLAUDE.md](CLAUDE.md). Its twelve golden rules apply to every change, whether a person or an AI assistant makes it.
2. Read [spec/README.md](spec/README.md), then the spec for the area you touch.
3. Read [docs/HANDOFF.md](docs/HANDOFF.md) for the current state of the build and how work moves between sessions.
4. Look for an open issue, or open one before large changes, so the work fits the milestone plan.

## Set up

You need Node.js 24 (see `.nvmrc`) and Git.

```bash
npm ci
npm run dev            # local dev server
npm test               # unit tests and golden physics scenes (about a minute)
npm run lint           # ESLint and Prettier
npm run typecheck
npm run validate-data  # schema and provenance check of /data
npm run build          # validate-data, typecheck, production build
```

## How work is organized

- The product is built milestone by milestone (M1 to M5; see the README). Each milestone has a build prompt in `prompts/` and an implementation plan in `docs/` (for M1, [docs/M1-plan.md](docs/M1-plan.md)).
- The plan's **Decisions** section settles anything the prompt leaves open. Its **Progress log** records what each phase built, every deviation and why, and every value added to `/data`. Add an entry when you finish a phase or a significant change.
- A phase is done only when its Done-when checks pass. Paste their output in the PR.

## Rules that reviewers check

- **The disclaimer stays.** The start screen and the README carry the exact text of spec 00 §2. A unit test enforces it.
- **No invented numbers.** Clinical, anatomical, device and physical values live in `/data` with a unit, a confidence level and a source id when sourced or derived. A missing value goes in as `placeholder` with a note and shows a badge in the app.
- **Design values** (feel, speeds, colors, solver settings) live in `data/tuning/` with confidence `design` and a note saying why.
- **The simulation is pure and deterministic.** `src/sim/` never touches the DOM, three.js, React, wall time, `Math.random` or browser globals; ESLint enforces this, including `no-magic-numbers`.
- **Golden scenes stay green.** Never loosen a tolerance. Change an expected value only with the owner's approval and a written reason in the commit message.
- **Dependencies** must be MIT, BSD, Apache-2.0 or similar. LGPL and GPL code is reading material only.
- **Trademarks:** brand names appear next to generic names; no vendor logos or copied vendor screens.
- **No runtime network calls** beyond the app's own static assets.

## Changing data and specs

`data/` and `spec/` are owned by the project owner and the medical validator.

- To correct a clinical, anatomical or device value, open a **Data correction** issue: give the data id, the correct value with its unit, and a source.
- Other changes to `data/` (outside new design values in `data/tuning/`) or to `spec/` need the owner's approval first.

## Branches, commits and pull requests

- Fork or branch from `main`, keep each pull request to one concern, and fill in the template.
- Write commit messages in the imperative, with a short subject and a body that says what changed and why. Phase commits follow the plan, for example `M1 phase D: rendering, UI and end-to-end tests`.
- CI runs lint, the typecheck, data validation, every test and the build on each pull request; all must pass.
- AI-assisted commits keep a `Co-Authored-By:` trailer naming the assistant.

## Reporting problems

- **Bugs:** open a Bug report issue with steps to reproduce, the browser and the controller.
- **Security issues:** see [SECURITY.md](SECURITY.md); please do not open a public issue.
- **Conduct:** see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
