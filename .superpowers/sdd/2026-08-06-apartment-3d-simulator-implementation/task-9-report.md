# Task 9 report — detailed workstation models and preview mode

## Delivered

- Added local procedural models for the catalog's desk, displays, monitor arm,
  computers, shelf/cabinets, printer, lighting, chair, bed, side table, trash
  bin, and power strip. Unsupported catalog IDs continue through `GenericBox`.
- Kept each detailed model within the resolved local width/depth/height envelope
  and retained the existing `EntityRenderer` group as the entity transform,
  selection, Task 8 gizmo, and resize anchor.
- Added a deterministic local `ScreenPlaceholder`; it has no network access,
  timers, canvas state, or persisted UI state.
- Added transient editor/preview quality profiles. Preview hides the room grid
  and excludes direct transform/resize controls from the render tree while
  preserving selection, inspector, camera controls, and the scene document.
- Added preview E2E coverage for exported JSON equality across a mode switch,
  stable selected detailed-entity ID retention, disabled direct-editing
  chrome, profile/canvas-pixel differences, no page errors, and screenshot
  capture at 1440×900 and 390×844 in editor and preview modes.

## Material decisions

- Model routing uses the existing stable catalog `itemId`; no schema, catalog,
  transform, ports, persistence, or editor-store changes were made.
- The model envelope is derived from resolved renderer dimensions. This is the
  guard against origin/bounds drift during numeric changes and Task 8 direct
  resizing.
- Preview uses two shared directional lights plus one hemisphere light—never
  per-entity lights—to keep the ~31-entity template practical on a laptop.
- The preview profile enables antialiasing and a bounded DPR range of 1–2;
  editor remains bounded at 1–1.5 and favors clarity through the grid.

## TDD and verification evidence

- RED: `model-layout.test.tsx` and `quality.test.ts` failed before their
  implementation: the model helper module was missing and `getRendererProfile`
  did not exist. The initial sandboxed Vitest call was blocked by esbuild's
  parent-path access; the escalated rerun produced those expected failures.
- GREEN: focused renderer tests: 28 passing tests.
- Full unit suite: `npm.cmd test` — 22 files, 117 tests passing. Existing
  Three.js deprecation/multiple-instance stderr warnings remain pre-existing
  test-environment warnings, with no test failures.
- Typecheck: `npm.cmd run typecheck` passing.
- Lint: `npm.cmd run lint` passing.
- Formatting: `npm.cmd run format:check` passing.
- Build: `npm.cmd run build` passing. Vite reports the pre-existing large
  production bundle warning (1.30 MB uncompressed); no dependency/configuration
  scope was changed to address it.
- Browser: `npm.cmd run test:e2e -- e2e/preview.spec.ts` — 2 passing tests,
  including captured desktop/mobile editor and preview screenshots. Existing
  direct-resize regression: `npm.cmd run test:e2e -- e2e/editor-sync.spec.ts`
  — passing.
- `git diff --check` passed.

## Self-review

- Reviewed the base-to-head Task 9 renderer diff for persisted preview state,
  remote assets, additional dependencies, model-ID/schema changes, entity-origin
  drift, per-entity lights, and Task 8 control placement. None were introduced.
- Preserved the existing untracked `.playwright-cli/` and `output/` controller
  artifacts; neither is staged or modified by this task.
