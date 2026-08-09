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

## Correction round 1

- Cable ends in legacy nets now have an explicit Japanese read-only status in the
  inspector; only a canonical pairwise attachment exposes an enabled detach
  action.
- A waypoint pointer interaction disables orbit only after the store accepts its
  start. Pointer up commits one history/autosave entry; pointer cancel, Escape,
  cable-mode removal, and root unmount cancel it, restore the original waypoint,
  release pointer capture, and re-enable orbit.
- Invariants/import now reject pairwise connections involving a cable endpoint
  that targets a cable entity, including `end-a` to `end-b` self-links and a
  cable end to a non-end cable port. Legacy multi-target nets with non-cable
  targets remain accepted as read-only data.
- On direct or catalog-resolved cable resizing, the stored local `end-a`/`end-b`
  anchor coordinates are clamped independently to the new resolved half-extents.
  Existing free-end edits therefore remain unchanged whenever already in bounds;
  new out-of-bounds free-end edits are rejected. This keeps arbitrary cable
  lengths possible while ensuring anchors never escape the entity envelope.
- Focused correction evidence: 54 tests in 6 files passed, covering invariant and
  import rejection, store rejection, canonical/legacy inspector controls,
  direct/catalog-resolved 100 mm bounds, and R3F success/cancel/Escape/mode
  switch/unmount pointer lifecycles.

## Correction round 2

- Pairwise cable-to-cable and self-attachment rejection is now intentionally
  limited to two-endpoint attachment shapes. A valid legacy four-end v1 net in
  stored order (`cable end-a`, device, `cable end-b`, device) imports without
  rewriting, stays legacy/read-only, occupies both cable ends, and exports to a
  stable canonical JSON digest.
- Catalog construction now applies the same resolved-dimension end-anchor
  reconciliation as later resize and set-catalog commands. A cable created with
  custom dimensions therefore cannot begin with anchors outside its envelope.
- RED/GREEN evidence: the legacy import and 100 mm initial-custom-cable tests
  failed before the production change, then the focused import/invariant/command
  suite passed 37 tests. The import regression also keeps pairwise same-cable and
  cross-cable links rejected.

## Residual risks

- The existing React Three test renderer emits known multiple-Three/Clock and
  `act(...)` stderr warnings despite passing assertions; the production build has
  no related compilation failure.
- Production build retains Vite's pre-existing large-chunk advisory (about 1.32 MB
  uncompressed JavaScript); Task 10 adds no dependencies or remote assets.
