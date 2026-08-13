import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  assessAutosaveEvidence,
  assessBoundedWindowDuration,
  attributeLongTasks,
  classifyResizeSetup,
  classifyConsoleMessage,
  compareCodePoints,
  longTasksOverlappingPhases,
  percentile,
  regenerateEvidenceSummary,
  rendererRuntimeRestored,
  resolvePreWindowLongTasks,
  summarizeSamples,
  summarizeCdpTrace,
  storageWritesInWindow,
  type EvidencePhaseSpan,
  type LongTaskSample,
} from './evidence'

describe('evidence summary helpers', () => {
  it('defaults the optional CDP warm-up input without leaking stop scope', () => {
    const warmup: LongTaskSample = { startMs: -4, durationMs: 4, name: 'warmup' }
    expect(resolvePreWindowLongTasks(undefined)).toEqual([])
    expect(resolvePreWindowLongTasks([warmup])).toEqual([warmup])
  })

  it('regenerates runs in locale-independent JavaScript code-point order', () => {
    const evidenceRoot = mkdtempSync(join(tmpdir(), 'evidence-summary-order-'))
    const rawRoot = join(evidenceRoot, 'raw')
    mkdirSync(rawRoot)
    try {
      for (const file of ['Å.json', 'a.json', 'Z.json']) {
        writeFileSync(
          join(rawRoot, file),
          JSON.stringify({
            criterion: file,
            run: file,
            status: 'PASS',
            checks: [],
            notes: [file],
          }),
        )
      }

      regenerateEvidenceSummary(evidenceRoot)
      const summary = JSON.parse(
        readFileSync(join(evidenceRoot, 'verification-summary.json'), 'utf8'),
      ) as { runs: Record<string, unknown> }

      expect(compareCodePoints('Z.json', 'a.json')).toBe(-1)
      expect(compareCodePoints('Å.json', 'a.json')).toBe(1)
      expect(['Å.json', 'a.json', 'Z.json'].sort(compareCodePoints)).toEqual([
        'Z.json',
        'a.json',
        'Å.json',
      ])
      expect(Object.keys(summary.runs)).toEqual(['Z', 'a', 'Å'])
    } finally {
      rmSync(evidenceRoot, { recursive: true, force: true })
    }
  })

  it('uses the nearest-rank p95 and preserves max for raw timing samples', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10)
    expect(summarizeSamples([1, 2, 3, 4, 5])).toEqual({
      count: 5,
      p95: 5,
      max: 5,
      median: 3,
    })
  })

  it('counts canonical storage writes only inside the bounded evidence window', () => {
    const writes = [
      { key: 'home-lab-scene', atMs: 473.8 },
      { key: 'home-lab-scene', atMs: 810.5 },
      { key: 'home-lab-scene', atMs: 1185 },
      { key: 'home-lab-scene', atMs: 1592 },
      { key: 'home-lab-scene', atMs: 1864.5 },
      { key: 'home-lab-scene', atMs: 3638 },
      { key: 'home-lab-scene', atMs: 5354.6 },
      { key: 'unrelated', atMs: 900 },
    ]

    expect(storageWritesInWindow(writes, 0, 1900).map((write) => write.atMs)).toEqual([
      473.8, 810.5, 1185, 1592, 1864.5,
    ])
    expect(storageWritesInWindow(writes, 0, 5500)).toHaveLength(7)
  })

  it('requires direct schedule evidence while accepting debounced physical writes', () => {
    expect(
      assessAutosaveEvidence({
        successfulOperations: 5,
        directlyObservedSchedules: 5,
        physicalWrites: 4,
        finalSavedMatchesCanonical: true,
      }),
    ).toMatchObject({ status: 'PASS', physicalWriteCoalescingValid: true })

    expect(
      assessAutosaveEvidence({
        successfulOperations: 5,
        directlyObservedSchedules: null,
        physicalWrites: 4,
        finalSavedMatchesCanonical: true,
      }),
    ).toMatchObject({ status: 'UNRESOLVED', physicalWriteCoalescingValid: true })

    expect(
      assessAutosaveEvidence({
        successfulOperations: 5,
        directlyObservedSchedules: null,
        physicalWrites: 4,
        finalSavedMatchesCanonical: false,
      }),
    ).toMatchObject({ status: 'FAIL', physicalWriteCoalescingValid: false })
  })

  it('separates ordinary warnings from the accepted delayed Three.js chunk warning', () => {
    expect(classifyConsoleMessage('warning', 'Three.js chunk loaded after a delay')).toBe(
      'accepted-delayed-three-chunk',
    )
    expect(classifyConsoleMessage('warning', 'A normal browser warning')).toBe('warning')
    expect(classifyConsoleMessage('error', 'WebGL shader compile failed')).toBe(
      'shader-error',
    )
  })

  it('reports phase overlap without claiming causal Long Task attribution', () => {
    const longTasks: LongTaskSample[] = [
      { startMs: 5, durationMs: 106, name: 'self' },
      { startMs: 5170, durationMs: 89, name: 'self' },
    ]
    const phaseSpans: EvidencePhaseSpan[] = [
      { phase: 'pointer-handler', startMs: 5, endMs: 14, durationMs: 9 },
      { phase: 'render', startMs: 14, endMs: 111, durationMs: 97 },
      {
        phase: 'canonical-commit-store-publication',
        startMs: 5170,
        endMs: 5259,
        durationMs: 89,
      },
    ]

    expect(attributeLongTasks(longTasks, phaseSpans)).toEqual([
      expect.objectContaining({
        task: longTasks[0],
        primaryPhase: 'render',
        causalAttribution: 'UNRESOLVED',
        interpretation: 'temporal-overlap-only',
        unattributedMs: 0,
      }),
      expect.objectContaining({
        task: longTasks[1],
        primaryPhase: 'canonical-commit-store-publication',
        causalAttribution: 'UNRESOLVED',
        interpretation: 'temporal-overlap-only',
        unattributedMs: 0,
      }),
    ])
  })

  it('selects every Long Task that overlaps a requested phase, not only its primary phase', () => {
    const attributions = attributeLongTasks(
      [
        { startMs: 5, durationMs: 106, name: 'self' },
        { startMs: 5170, durationMs: 89, name: 'self' },
      ],
      [
        { phase: 'render', startMs: 5, endMs: 111, durationMs: 106 },
        {
          phase: 'pointerup-canonical-commit',
          startMs: 5170,
          endMs: 5259,
          durationMs: 89,
        },
      ],
    )

    expect(longTasksOverlappingPhases(attributions, ['render'])).toHaveLength(1)
    expect(
      longTasksOverlappingPhases(attributions, ['pointerup-canonical-commit']),
    ).toHaveLength(1)
    expect(longTasksOverlappingPhases(attributions, ['pointerdown'])).toHaveLength(0)
  })

  it('keeps resize performance setup unresolved until a real transient change is witnessed', () => {
    expect(
      classifyResizeSetup({
        handleHit: true,
        interactionUpdates: 4,
        transientGeometryChanged: false,
      }),
    ).toBe('EVIDENCE_SETUP_UNRESOLVED')
    expect(
      classifyResizeSetup({
        handleHit: true,
        interactionUpdates: 0,
        transientGeometryChanged: true,
      }),
    ).toBe('READY')
    expect(
      classifyResizeSetup({
        handleHit: false,
        interactionUpdates: 4,
        transientGeometryChanged: true,
      }),
    ).toBe('EVIDENCE_SETUP_UNRESOLVED')
  })

  it('summarizes nested CDP events as timeline evidence while preserving causal limits', () => {
    const summary = summarizeCdpTrace(
      [
        {
          name: 'ac007:evidence-window-start',
          cat: 'blink.user_timing',
          ph: 'R',
          ts: 1_000,
        },
        {
          name: 'RunTask',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 6_000,
          dur: 106_000,
          pid: 1,
          tid: 2,
        },
        {
          name: 'EventDispatch',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 7_000,
          dur: 9_000,
          pid: 1,
          tid: 2,
        },
        { name: 'MajorGC', cat: 'v8', ph: 'X', ts: 20_000, dur: 4_000, pid: 1, tid: 2 },
      ],
      [{ startMs: 5, durationMs: 106, name: 'self' }],
    )

    expect(summary.causalConclusion).toBe('UNRESOLVED')
    expect(summary.longTasks[0]).toEqual(
      expect.objectContaining({
        timelineEvents: expect.arrayContaining([
          expect.objectContaining({ name: 'EventDispatch', overlapMs: 9 }),
          expect.objectContaining({ name: 'MajorGC', overlapMs: 4 }),
        ]),
      }),
    )
  })

  it('separates synthetic nested renderer CPU, GPU-process, and warm-up evidence', () => {
    const summary = summarizeCdpTrace(
      [
        {
          name: 'thread_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 10,
          tid: 11,
          args: { name: 'CrRendererMain' },
        },
        {
          name: 'process_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 20,
          tid: 0,
          args: { name: 'GPU Process' },
        },
        {
          name: 'thread_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 20,
          tid: 21,
          args: { name: 'CrGpuMain' },
        },
        {
          name: 'ac007:evidence-window-start',
          cat: 'blink.user_timing',
          ph: 'R',
          ts: 1_000,
        },
        {
          name: 'RunTask',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 1_000,
          dur: 100_000,
          pid: 10,
          tid: 11,
        },
        {
          name: 'EventDispatch',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 11_000,
          dur: 20_000,
          pid: 10,
          tid: 11,
        },
        {
          name: 'FunctionCall',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 16_000,
          dur: 5_000,
          pid: 10,
          tid: 11,
        },
        {
          name: 'GpuPresent',
          cat: 'gpu',
          ph: 'X',
          ts: 31_000,
          dur: 25_000,
          pid: 20,
          tid: 21,
        },
      ],
      [{ startMs: 0, durationMs: 100, name: 'self' }],
      [{ startMs: -80, durationMs: 80, name: 'warmup' }],
    )

    expect(summary.attributionMethod).toBe(
      'same-thread-interval-union-with-per-event-exclusive-and-gpu-thread-coverage',
    )
    expect(summary.rendererMainThread).toEqual({
      pid: 10,
      tid: 11,
      name: 'CrRendererMain',
    })
    expect(summary.warmup).toMatchObject({
      preWindowCount: 1,
      inWindowCount: 1,
      preWindowTotalMs: 80,
      inWindowTotalMs: 100,
    })
    expect(summary.longTasks[0]?.mainThreadCpu).toEqual(
      expect.objectContaining({
        threadWallClockCoverageMs: 100,
        events: expect.arrayContaining([
          expect.objectContaining({ name: 'RunTask', eventExclusiveMs: 80 }),
        ]),
      }),
    )
    expect(summary.longTasks[0]?.gpu).toEqual(
      expect.objectContaining({
        processIds: [20],
        wallClockCoverageMs: 25,
        threadCoverage: [
          expect.objectContaining({
            pid: 20,
            tid: 21,
            wallClockCoverageMs: 25,
          }),
        ],
      }),
    )
  })

  it('separates event exclusive time from clipped same-thread coverage', () => {
    const summary = summarizeCdpTrace(
      [
        {
          name: 'ac007:evidence-window-start',
          cat: 'blink.user_timing',
          ph: 'R',
          ts: 0,
        },
        {
          name: 'thread_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 1,
          tid: 10,
          args: { name: 'CrRendererMain' },
        },
        {
          name: 'process_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 2,
          tid: 0,
          args: { name: 'GPU Process' },
        },
        {
          name: 'thread_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 2,
          tid: 20,
          args: { name: 'CrGpuMain' },
        },
        {
          name: 'thread_name',
          cat: '__metadata',
          ph: 'M',
          ts: 0,
          pid: 2,
          tid: 21,
          args: { name: 'GpuWorker' },
        },
        {
          name: 'RunTask',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 0,
          dur: 100_000,
          pid: 1,
          tid: 10,
        },
        {
          name: 'CrossBoundary',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: -50_000,
          dur: 70_000,
          pid: 1,
          tid: 10,
        },
        {
          name: 'NestedParent',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 10_000,
          dur: 20_000,
          pid: 1,
          tid: 10,
        },
        {
          name: 'NestedChild',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 10_000,
          dur: 10_000,
          pid: 1,
          tid: 10,
        },
        {
          name: 'Sibling',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 30_000,
          dur: 20_000,
          pid: 1,
          tid: 10,
        },
        {
          name: 'SameTimeWorker',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 0,
          dur: 100_000,
          pid: 1,
          tid: 11,
        },
        {
          name: 'GpuOuter',
          cat: 'gpu',
          ph: 'X',
          ts: 0,
          dur: 100_000,
          pid: 2,
          tid: 20,
        },
        {
          name: 'GpuChild',
          cat: 'gpu',
          ph: 'X',
          ts: 20_000,
          dur: 20_000,
          pid: 2,
          tid: 20,
        },
        {
          name: 'GpuParallel',
          cat: 'gpu',
          ph: 'X',
          ts: 0,
          dur: 100_000,
          pid: 2,
          tid: 21,
        },
      ],
      [{ startMs: 0, durationMs: 100, name: 'task' }],
    )
    const task = summary.longTasks[0]!
    expect(task.mainThreadCpu).toEqual(
      expect.objectContaining({
        threadWallClockCoverageMs: 100,
        events: expect.arrayContaining([
          expect.objectContaining({ name: 'RunTask', eventExclusiveMs: 50 }),
          expect.objectContaining({ name: 'CrossBoundary', eventExclusiveMs: 10 }),
          expect.objectContaining({ name: 'NestedParent', eventExclusiveMs: 10 }),
          expect.objectContaining({ name: 'NestedChild', eventExclusiveMs: 10 }),
          expect.objectContaining({ name: 'Sibling', eventExclusiveMs: 20 }),
        ]),
      }),
    )
    expect(task.gpu).toEqual(
      expect.objectContaining({
        wallClockCoverageMs: 100,
        threadCoverage: expect.arrayContaining([
          expect.objectContaining({ pid: 2, tid: 20, wallClockCoverageMs: 100 }),
          expect.objectContaining({ pid: 2, tid: 21, wallClockCoverageMs: 100 }),
        ]),
      }),
    )
    expect(task.gpu.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'GpuOuter', eventExclusiveMs: 80 }),
        expect.objectContaining({ name: 'GpuChild', eventExclusiveMs: 20 }),
        expect.objectContaining({ name: 'GpuParallel', eventExclusiveMs: 100 }),
      ]),
    )
  })

  it('uses event metadata fallback without inventing a renderer or GPU name', () => {
    const summary = summarizeCdpTrace(
      [
        {
          name: 'ac007:evidence-window-start',
          cat: 'blink.user_timing',
          ph: 'R',
          ts: 0,
        },
        {
          name: 'RunTask',
          cat: 'renderer.timeline',
          ph: 'X',
          ts: 0,
          dur: 100_000,
          pid: 30,
          tid: 31,
        },
        {
          name: 'GpuPresent',
          cat: 'gpu',
          ph: 'X',
          ts: 10_000,
          dur: 20_000,
          pid: 40,
          tid: 41,
        },
      ],
      [{ startMs: 0, durationMs: 100, name: 'task' }],
    )
    expect(summary.rendererMainThread).toEqual({ pid: 30, tid: 31, name: null })
    expect(summary.longTasks[0]?.mainThreadCpu.threadWallClockCoverageMs).toBe(100)
    expect(summary.longTasks[0]?.gpu).toEqual(
      expect.objectContaining({
        processIds: [40],
        wallClockCoverageMs: 20,
        threadCoverage: [
          expect.objectContaining({ pid: 40, tid: 41, wallClockCoverageMs: 20 }),
        ],
      }),
    )
  })

  it('requires a bounded observation window without weakening the requested duration', () => {
    expect(assessBoundedWindowDuration(10_000, 10_000, 20_000)).toEqual({
      passed: true,
      observedMs: 10_000,
      minimumMs: 10_000,
      maximumMs: 20_000,
    })
    expect(assessBoundedWindowDuration(95_000, 10_000, 20_000).passed).toBe(false)
    expect(assessBoundedWindowDuration(9_999, 10_000, 20_000).passed).toBe(false)
  })

  it('requires profile, quality tier, DPR, shadow, and lighting equality for restoration', () => {
    const baseline = {
      available: true,
      profile: 'editor',
      canvas: { width: 100, height: 100, clientWidth: 100, clientHeight: 100 },
      renderer: {
        pixelRatio: 1,
        antialias: false,
        toneMapping: 0,
        toneMappingExposure: 1,
        shadowMapType: 1,
        shadowMapSizes: [1024],
        configuredDpr: [1, 1.5] as [number, number],
        configuredAntialias: false,
        configuredShadowMapSize: 1024,
        configuredExposure: 1,
        lighting: {
          background: '0d121d',
          lights: [{ type: 'HemisphereLight', intensity: 0.55, color: 'b9d1ff' }],
        },
      },
      qualityTier: 'edit' as const,
    }
    expect(rendererRuntimeRestored(baseline, structuredClone(baseline))).toBe(true)
    const changed = structuredClone(baseline)
    changed.renderer.lighting.lights[0]!.intensity = 0.95
    expect(rendererRuntimeRestored(baseline, changed)).toBe(false)
  })
})
