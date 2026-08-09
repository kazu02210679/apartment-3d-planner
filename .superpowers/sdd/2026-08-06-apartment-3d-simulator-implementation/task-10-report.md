# Task 10 — Illustrative Port and Cable Routing

## Implemented

- Preserved v1 `ConnectionEndpoint` data and represented free ends as unattached
  `cable.generic` `end-a`/`end-b` ports.
- Added strict, bounded cable routing parsing on cable entity properties, invariant
  enforcement, legacy-net classification/fallback, catalog anchor propagation, and
  cable-safe catalog/duplicate commands.
- Added command-backed draft attach/detach/routing/free-end/waypoint actions with
  transient draft state and interaction-based waypoint drag coalescing.
- Added visible Cable/PortMarker/waypoint rendering, preview guards, accessible
  cable tool and inspector controls, and canonical pairwise workstation cables.

## Evidence

- RED→GREEN focused tests covered legacy occupancy, four-end legacy fallback,
  strict routing, commands, transient draft/autosave/undo, marker rendering, and
  direct waypoint pointer lifecycle.
- `npm.cmd test`: 28 files / 164 tests passed.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`,
  `npm.cmd run build`, and `git diff --check` passed.
- `npm.cmd run test:e2e -- e2e/cables.spec.ts` passed (desktop workflow and
  390x844 mobile capture). It exercised detach/free endpoint, compatible
  reattach, free local X edit, waypoint add/edit/delete/add, JSON export,
  autosave reload, import, preview JSON invariance, and page/console errors.
- Existing `preview.spec.ts` and `editor-sync.spec.ts` also passed. The R3F
  pointer-lifecycle test covers direct on-canvas waypoint dragging and one undo.

## Residual risks

- The existing React Three test renderer emits known multiple-Three/Clock and
  `act(...)` stderr warnings despite passing assertions; the production build has
  no related compilation failure.
- Production build retains Vite's pre-existing large-chunk advisory (about 1.32 MB
  uncompressed JavaScript); Task 10 adds no dependencies or remote assets.
