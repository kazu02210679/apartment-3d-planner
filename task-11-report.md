# Task 11 — Public v1 acceptance report

Environment: Windows, Playwright Chromium (Desktop Chrome), 1440×900 performance viewport.

## Acceptance evidence

- First run and room sizing: `e2e/first-run.spec.ts` verifies the Future Workstation, Japanese title/save state, 6/8/10/12 presets, `1畳 = 1.62 m²`, OOB IDs, and one-step undo without entity/cable mutation.
- Persistence/import: `e2e/persistence.spec.ts` covers debounce save/reload, last-known-good write failure recovery, export/import, v0 migration and safe unknown-catalog inspection, hostile strings, and rejected imports.
- Responsive/offline/accessibility: `responsive.spec.ts`, `offline.spec.ts`, and `accessibility.spec.ts` cover desktop/tablet/mobile screenshots/workflows, only local/data/blob requests and no websockets, and Axe serious/critical = zero across editor, mobile sheet, cable mode, and preview.
- Performance/delivery: `performance.spec.ts` verifies a manifest-linked lazy `SceneCanvas` chunk and delayed loading fallback. Final serial baseline raw samples were 68.7, 50.8, and 74.7 ms; median 68.7 ms (<250 ms). The entry chunk is 338.77 kB raw / 98.79 kB gzip; the lazy renderer chunk is 986.20 kB raw / 265.57 kB gzip.

## Material fixes

- Added real lazy SceneCanvas loading with accessible pending and error fallbacks.
- Cleared transient cable drafts on mode/import/reset replacement, and made mobile sheets modal/focus-contained.
- Made legacy unknown catalog IDs safe in inspector and SceneRoot.
- Corrected inactive-control contrast for Axe.
- Optimized Outliner to read defensive snapshot getters once and use entity/parent maps; this removed the 100-object interaction bottleneck.

## Validation

- `npm.cmd test`: 176 tests passed.
- `npm.cmd run typecheck`, `lint`, `format:check`, and `build`: passed.
- `npm.cmd run test:e2e`: 14/14 production E2Es passed serially in 34.5 seconds. Serial execution is deliberate: it preserves the fixed single-Chromium performance baseline and avoids competing render processes.

Residual risk: Vite continues to warn that the lazy renderer chunk exceeds 500 kB. The initial editor shell is independently below the 500 kB raw budget and the manifest proves the renderer is deferred.
