# Task 11 — Public v1 acceptance report

Environment: Windows, Playwright Chromium 151.0.7922.34 (Win64), hardware
concurrency 32, 1440×900 performance viewport. E2E artifacts are Playwright
attachments/cache artifacts and are not tracked.

## Acceptance evidence

- First run and room sizing: `e2e/first-run.spec.ts` verifies the Future
  Workstation, Japanese title/save state, 6/8/10/12 presets, `1畳 = 1.62 m²`,
  out-of-bounds state, and one-step undo without entity/cable mutation.
- Persistence/import: `e2e/persistence.spec.ts` verifies pending-to-saved
  autosave, reload, canonical UI export/import equivalence, a one-time real
  localStorage failure with visible continued editing (3400 then 3450), save
  recovery and reload, v0-to-v1 export, safe inspection of the migrated unknown
  catalog entity, hostile inert strings, and export/localStorage-byte invariance
  for malformed, future, structural, dangling, and oversized imports.
- Responsive workflows: `e2e/responsive.spec.ts` runs editor and preview at
  1440×900, 1024×768, and 390×844. Each viewport uses catalog, outliner,
  detailed cable inspector, numeric edit/undo, download/file-input import, and
  nonzero canvas; the mobile run additionally proves bounded internal sheet
  scrolling. Editor and preview screenshots are attached for all three sizes.
- Keyboard/accessibility: `e2e/accessibility.spec.ts` has zero serious/critical
  Axe findings in initial editor, mobile sheet, cable mode, and preview. It uses
  bounded real Tab/Shift+Tab traversal through mode, catalog add, outliner
  selection, numeric Ctrl+A/type/Enter, undo, export/import, a real detached
  cable-end draft, and mobile sheet open/close with exact focus restore. Native
  cable selection uses Home/ArrowDown/Enter rather than programmatic selection;
  every reached visible target asserts its focus indicator. Escape cancels the
  draft with unchanged export and undo state.
- Offline: `e2e/offline.spec.ts` installs request/websocket guards before
  navigation, then completes add/edit/autosave/download/file-input import/preview/
  reload with zero external requests, websockets, page errors, or console errors.
- Performance/delivery: `e2e/performance.spec.ts` asserts that the Vite manifest
  entry dynamically imports the exact `src/renderer/SceneCanvas.tsx` key, delays
  that exact chunk to prove loading fallback then canvas, and measures a real
  selected entity ID/numeric Enter/accessible Undo lifecycle inside the page.
  One warm-up plus final raw samples were 66.4, 65.9, and 68.9 ms; median
  66.4 ms (<250 ms). It then verifies preview export target x=103, undo/redo
  canonical equality, editor renderer restoration, and no browser errors.

## Material correction fixes

- Added a production `Escape` document-listener lifecycle for active cable drafts;
  cancel remains transient and does not create history or autosave work. The
  focused `CableTool` unit test was RED before the listener and is green now.
- Axe found a genuine serious contrast failure on disabled cable-tool controls.
  Disabled and cable-tool control colors now retain AA contrast instead of relying
  on low global opacity.
- Strengthened all acceptance tests to use stable visible Japanese labels and the
  actual download/file-input path, rather than toolbar positional selectors.
- Replaced programmatic focus jumps in the keyboard acceptance workflow with
  bounded real Tab/Shift+Tab traversal and native-select key navigation, so the
  test now proves logical focus order instead of only exercising controls.

## Bundle metrics

- Entry: `assets/index-DJUhVcgC.js`, 338,972 bytes raw / 98,824 bytes gzip.
- Lazy renderer: `assets/SceneCanvas-CroHBbH6.js`, 986,202 bytes raw / 265,572
  bytes gzip.
- The entry remains below the 500 kB raw budget and the renderer is a distinct
  manifest-linked dynamic import.

## Validation

- Focused: `npm.cmd test -- src/editor/CableTool.test.tsx` passed.
- Focused browser: accessibility 1/1 (keyboard traversal correction), responsive
  3/3, offline 1/1, persistence 1/1, and strict performance 1/1 passed.
- `npm.cmd test`: 177 tests passed. Existing R3F unit-test stderr continues to
  report pre-existing Three duplicate-instance/Clock and `act(...)` test-harness
  warnings; browser tests have zero page/console errors.
- `npm.cmd run typecheck`, `lint`, `format:check`, `build`, and
  `git diff --check`: passed.
- `npm.cmd run test:e2e`: 14/14 passed serially in 53.4 seconds. Serial execution
  intentionally keeps the fixed single-Chromium performance baseline free of
  competing renderer processes.

Residual risk: Vite still warns that the deferred renderer exceeds 500 kB. The
initial editor shell is independently below the raw budget, and the manifest plus
delayed-chunk browser assertion prove the renderer is deferred rather than masked.
