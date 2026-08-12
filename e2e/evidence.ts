import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import * as os from 'node:os'
import { join, resolve } from 'node:path'

import type { Browser, CDPSession, Page, TestInfo } from '@playwright/test'

export type EvidenceStatus = 'PASS' | 'FAIL' | 'UNRESOLVED'

export type ConsoleClassification =
  'error' | 'warning' | 'info' | 'shader-error' | 'accepted-delayed-three-chunk'

export interface SampleSummary {
  readonly count: number
  readonly p95: number | null
  readonly max: number | null
  readonly median: number | null
}

export interface EvidenceCheck {
  readonly name: string
  readonly passed: boolean
  readonly observed: number | string | null
  readonly threshold?: number | string
}

export interface HandlerSample {
  readonly eventType: string
  readonly target: string
  readonly durationMs: number
  readonly atMs: number
}

export interface LongTaskSample {
  readonly startMs: number
  readonly durationMs: number
  readonly name: string
}

export type EvidencePhase =
  | 'page-chunk-warmup'
  | 'pointerdown'
  | 'pointermove-window'
  | 'pointerup-canonical-commit'
  | 'autosave-wait'
  | 'stop-cleanup'
  | 'observer-test-instrumentation'
  | 'store-notification'
  | 'pointer-handler'
  | 'canonical-interaction-begin'
  | 'canonical-interaction-update'
  | 'canonical-commit-store-publication'
  | 'history-undo'
  | 'history-redo'
  | 'render'
  | 'stable-frame'
  | 'cleanup'
  | 'resize-pointerdown-app-handler'
  | 'resize-commit-app-handler'
  | 'resize-controller-start'
  | 'resize-controller-commit'
  | 'resize-transaction'
  | 'resize-begin-publish'
  | 'resize-history'
  | 'resize-autosave-schedule'
  | 'resize-commit-publish'
  | 'resize-pointerdown-handler-return-to-layout'
  | 'resize-commit-handler-return-to-layout'
  | 'resize-pointerdown-layout-to-first-render'
  | 'resize-commit-layout-to-first-render'
  | 'resize-pointerdown-first-render'
  | 'resize-commit-first-render'
  | 'unattributed'

export interface EvidencePhaseSpan {
  readonly phase: EvidencePhase
  readonly startMs: number
  readonly endMs: number
  readonly durationMs: number
}

export interface LongTaskPhaseOverlap {
  readonly phase: EvidencePhase
  readonly overlapMs: number
  readonly spanCount: number
}

export interface LongTaskAttribution {
  readonly task: LongTaskSample
  readonly primaryPhase: EvidencePhase
  readonly overlaps: readonly LongTaskPhaseOverlap[]
  readonly unattributedMs: number
  readonly causalAttribution: 'UNRESOLVED'
  readonly interpretation: 'temporal-overlap-only'
}

export interface CdpTraceEvent {
  readonly name: string
  readonly cat?: string
  readonly ph: string
  readonly ts: number
  readonly dur?: number
  readonly pid?: number
  readonly tid?: number
}

export interface CdpTraceSummary {
  readonly causalConclusion: 'UNRESOLVED'
  readonly causalLimit: string
  readonly evidenceWindowStartTraceUs: number | null
  readonly longTasks: readonly {
    readonly task: LongTaskSample
    readonly timelineEvents: readonly {
      readonly name: string
      readonly category: string
      readonly overlapMs: number
      readonly durationMs: number
      readonly eventCount: number
      readonly pid: number | null
      readonly tid: number | null
    }[]
  }[]
}

export interface EvidenceProbeWindow {
  readonly label: string
  readonly durationMs: number
  readonly startedAtMs: number
  readonly endedAtMs: number
  readonly handlerDurations: readonly HandlerSample[]
  readonly frameIntervals: readonly number[]
  readonly longTasks: readonly LongTaskSample[]
  readonly preWindowLongTasks: readonly LongTaskSample[]
  readonly phaseSpans: readonly EvidencePhaseSpan[]
  readonly longTaskAttributions: readonly LongTaskAttribution[]
  readonly eventCounts: Readonly<Record<string, number>>
  readonly eventTimes: Readonly<Record<string, readonly number[]>>
  readonly storageWrites: readonly {
    readonly key: string
    readonly atMs: number
  }[]
  readonly saveStatusTransitions: readonly {
    readonly text: string
    readonly atMs: number
  }[]
  readonly unhandledRejections: readonly string[]
}

export interface RendererRuntimeSnapshot {
  readonly available: boolean
  readonly profile: string | null
  readonly canvas: {
    readonly width: number
    readonly height: number
    readonly clientWidth: number
    readonly clientHeight: number
  } | null
  readonly renderer: {
    readonly pixelRatio: number | null
    readonly antialias: boolean | null
    readonly toneMapping: number | null
    readonly toneMappingExposure: number | null
    readonly shadowMapType: number | null
    readonly shadowMapSizes: readonly number[]
    readonly configuredDpr: readonly [number, number]
    readonly configuredAntialias: boolean
    readonly configuredShadowMapSize: number
    readonly configuredExposure: number
    readonly lighting: {
      readonly background: string | null
      readonly lights: readonly {
        readonly type: string
        readonly intensity: number | null
        readonly color: string | null
        readonly castShadow?: boolean
      }[]
    }
  } | null
  readonly qualityTier: 'high' | 'balanced' | 'safe' | 'edit' | null
}

export interface PageConsoleMessage {
  readonly type: string
  readonly text: string
  readonly classification: ConsoleClassification
  readonly location: string | null
}

export interface PageDiagnostics {
  readonly consoleMessages: readonly PageConsoleMessage[]
  readonly pageErrors: readonly string[]
  readonly failedRequests: readonly {
    readonly url: string
    readonly method: string
    readonly failure: string | null
  }[]
  readonly failedResponses: readonly {
    readonly url: string
    readonly status: number
    readonly resourceType: string
  }[]
}

export interface RuntimeEnvironment {
  readonly host: {
    readonly platform: string
    readonly release: string
    readonly version: string
    readonly arch: string
    readonly cpuModel: string | null
    readonly cpuCount: number
    readonly totalMemoryBytes: number
  }
  readonly node: {
    readonly version: string
    readonly platform: NodeJS.Platform
    readonly arch: string
  }
  readonly browser: {
    readonly name: string
    readonly version: string
    readonly userAgent: string
    readonly platform: string
    readonly hardwareConcurrency: number
    readonly deviceMemory: number | null
    readonly devicePixelRatio: number
  }
  readonly build: {
    readonly mode: 'production'
    readonly command: string
    readonly baseUrl: string
  }
}

export interface EvidenceArtifact {
  readonly schemaVersion: 1
  readonly criterion: 'AC-007' | 'AC-008' | 'AC-019' | 'AC-022'
  readonly run: string
  readonly status: EvidenceStatus
  readonly environment: RuntimeEnvironment
  readonly fixture?: {
    readonly entityCount: number
    readonly sha256: string
  }
  readonly viewport: { readonly width: number; readonly height: number }
  readonly probe?: EvidenceProbeWindow
  readonly postCommitProbe?: EvidenceProbeWindow
  readonly handlerSummary?: SampleSummary
  readonly frameSummary?: SampleSummary
  readonly longTaskSummary?: {
    readonly over50Ms: number
    readonly over100Ms: number
    readonly maxMs: number | null
  }
  readonly checks: readonly EvidenceCheck[]
  readonly counters: Record<string, unknown>
  readonly diagnostics: PageDiagnostics
  readonly renderer?: {
    readonly before?: RendererRuntimeSnapshot
    readonly after?: RendererRuntimeSnapshot
    readonly final?: RendererRuntimeSnapshot
  }
  readonly notes: readonly string[]
}

export interface EvidenceAssessment {
  readonly status: EvidenceStatus
  readonly checks: readonly EvidenceCheck[]
  readonly handlerSummary: SampleSummary
  readonly frameSummary: SampleSummary
  readonly longTaskSummary: {
    readonly over50Ms: number
    readonly over100Ms: number
    readonly maxMs: number | null
  }
}

type SummaryArtifact = Pick<
  EvidenceArtifact,
  | 'criterion'
  | 'run'
  | 'status'
  | 'checks'
  | 'handlerSummary'
  | 'frameSummary'
  | 'longTaskSummary'
  | 'notes'
>

export function projectEvidenceSummaryRun(rawFile: string, artifact: SummaryArtifact) {
  return {
    criterion: artifact.criterion,
    run: artifact.run,
    status: artifact.status,
    rawArtifact: `docs/reports/evidence/raw/${rawFile}`,
    checks: artifact.checks,
    handlerSummary: artifact.handlerSummary ?? null,
    frameSummary: artifact.frameSummary ?? null,
    longTaskSummary: artifact.longTaskSummary ?? null,
    notes: artifact.notes,
  }
}

export function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function regenerateEvidenceSummary(evidenceRoot: string): string {
  const rawRoot = join(evidenceRoot, 'raw')
  const runs: Record<string, ReturnType<typeof projectEvidenceSummaryRun>> = {}
  for (const file of readdirSync(rawRoot)
    .filter((file) => file.endsWith('.json'))
    .sort(compareCodePoints)) {
    const rawArtifact = JSON.parse(
      readFileSync(join(rawRoot, file), 'utf8'),
    ) as EvidenceArtifact
    runs[file.replace(/\.json$/, '')] = projectEvidenceSummaryRun(file, rawArtifact)
  }
  const summaryPath = join(evidenceRoot, 'verification-summary.json')
  const summary = {
    schemaVersion: 1 as const,
    repository: 'apartment-3d-planner',
    runs,
  }
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return summaryPath
}

export function percentile(samples: readonly number[], quantile: number): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const rank = Math.max(1, Math.ceil(sorted.length * quantile))
  return sorted[Math.min(sorted.length, rank) - 1]!
}

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  return {
    count: samples.length,
    p95: percentile(samples, 0.95),
    max: samples.length > 0 ? Math.max(...samples) : null,
    median: percentile(samples, 0.5),
  }
}

export interface StorageWriteSample {
  readonly key: string
  readonly atMs: number
}

export function storageWritesInWindow(
  writes: readonly StorageWriteSample[],
  startMs: number,
  endMs: number,
  key = 'home-lab-scene',
): readonly StorageWriteSample[] {
  if (endMs <= startMs) return []
  return writes.filter(
    (write) => write.key === key && write.atMs >= startMs && write.atMs < endMs,
  )
}

export interface AutosaveEvidenceInput {
  readonly successfulOperations: number
  readonly directlyObservedSchedules: number | null
  readonly physicalWrites: number
  readonly finalSavedMatchesCanonical: boolean
}

export interface AutosaveEvidenceAssessment {
  readonly status: 'PASS' | 'FAIL' | 'UNRESOLVED'
  readonly scheduleWitnessAvailable: boolean
  readonly schedulesMatchSuccessfulOperations: boolean | null
  readonly physicalWriteCoalescingValid: boolean
}

export function assessAutosaveEvidence({
  successfulOperations,
  directlyObservedSchedules,
  physicalWrites,
  finalSavedMatchesCanonical,
}: AutosaveEvidenceInput): AutosaveEvidenceAssessment {
  const physicalWriteCoalescingValid =
    successfulOperations > 0 &&
    physicalWrites > 0 &&
    physicalWrites <= successfulOperations &&
    finalSavedMatchesCanonical
  const schedulesMatchSuccessfulOperations =
    directlyObservedSchedules === null
      ? null
      : directlyObservedSchedules === successfulOperations
  const status = !physicalWriteCoalescingValid
    ? 'FAIL'
    : schedulesMatchSuccessfulOperations === null
      ? 'UNRESOLVED'
      : schedulesMatchSuccessfulOperations
        ? 'PASS'
        : 'FAIL'
  return {
    status,
    scheduleWitnessAvailable: directlyObservedSchedules !== null,
    schedulesMatchSuccessfulOperations,
    physicalWriteCoalescingValid,
  }
}

function intervalOverlap(
  leftStartMs: number,
  leftEndMs: number,
  rightStartMs: number,
  rightEndMs: number,
): number {
  return Math.max(
    0,
    Math.min(leftEndMs, rightEndMs) - Math.max(leftStartMs, rightStartMs),
  )
}

function unionDuration(intervals: readonly { startMs: number; endMs: number }[]): number {
  const sorted = [...intervals]
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  let total = 0
  let currentStart: number | undefined
  let currentEnd: number | undefined
  for (const interval of sorted) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = interval.startMs
      currentEnd = interval.endMs
    } else if (interval.startMs > currentEnd) {
      total += currentEnd - currentStart
      currentStart = interval.startMs
      currentEnd = interval.endMs
    } else {
      currentEnd = Math.max(currentEnd, interval.endMs)
    }
  }
  if (currentStart !== undefined && currentEnd !== undefined)
    total += currentEnd - currentStart
  return total
}

export function attributeLongTasks(
  longTasks: readonly LongTaskSample[],
  phaseSpans: readonly EvidencePhaseSpan[],
): readonly LongTaskAttribution[] {
  return longTasks.map((task) => {
    const taskEndMs = task.startMs + task.durationMs
    const matching = phaseSpans
      .map((span) => ({
        span,
        overlapMs: intervalOverlap(task.startMs, taskEndMs, span.startMs, span.endMs),
      }))
      .filter(({ overlapMs }) => overlapMs > 0)
    const byPhase = new Map<EvidencePhase, { overlapMs: number; spanCount: number }>()
    for (const { span, overlapMs } of matching) {
      const current = byPhase.get(span.phase) ?? { overlapMs: 0, spanCount: 0 }
      current.overlapMs += overlapMs
      current.spanCount += 1
      byPhase.set(span.phase, current)
    }
    const overlaps = [...byPhase.entries()]
      .map(([phase, value]) => ({ phase, ...value }))
      .sort(
        (left, right) =>
          right.overlapMs - left.overlapMs || left.phase.localeCompare(right.phase),
      )
    const coveredMs = unionDuration(
      matching.map(({ span }) => ({
        startMs: Math.max(task.startMs, span.startMs),
        endMs: Math.min(taskEndMs, span.endMs),
      })),
    )
    return {
      task,
      primaryPhase: overlaps[0]?.phase ?? 'unattributed',
      overlaps,
      unattributedMs: Math.max(0, task.durationMs - coveredMs),
      causalAttribution: 'UNRESOLVED',
      interpretation: 'temporal-overlap-only',
    }
  })
}

export function longTasksOverlappingPhases(
  attributions: readonly LongTaskAttribution[],
  phases: readonly EvidencePhase[],
): readonly LongTaskAttribution[] {
  const requestedPhases = new Set(phases)
  return attributions.filter((attribution) =>
    attribution.overlaps.some((overlap) => requestedPhases.has(overlap.phase)),
  )
}

export function classifyResizeSetup(witness: {
  readonly handleHit: boolean
  readonly interactionUpdates: number
  readonly transientGeometryChanged: boolean
}): 'READY' | 'EVIDENCE_SETUP_UNRESOLVED' {
  return witness.handleHit && witness.transientGeometryChanged
    ? 'READY'
    : 'EVIDENCE_SETUP_UNRESOLVED'
}

export function summarizeCdpTrace(
  events: readonly CdpTraceEvent[],
  longTasks: readonly LongTaskSample[],
): CdpTraceSummary {
  const marker = events.find((event) => event.name === 'ac007:evidence-window-start')
  const markerUs = marker?.ts ?? null
  return {
    causalConclusion: 'UNRESOLVED',
    causalLimit:
      'CDP timeline events and UserTiming marks establish nesting and temporal overlap, but do not by themselves prove which product, browser, GPU, or GC activity caused the Long Task duration.',
    evidenceWindowStartTraceUs: markerUs,
    longTasks: longTasks.map((task) => {
      if (markerUs === null) return { task, timelineEvents: [] }
      const taskStartUs = markerUs + task.startMs * 1_000
      const taskEndUs = taskStartUs + task.durationMs * 1_000
      const overlappingEvents = events
        .filter((event) => event.ph === 'X' && (event.dur ?? 0) > 0)
        .map((event) => {
          const eventEndUs = event.ts + (event.dur ?? 0)
          const overlapUs = Math.max(
            0,
            Math.min(taskEndUs, eventEndUs) - Math.max(taskStartUs, event.ts),
          )
          return { event, overlapUs }
        })
        .filter(({ overlapUs }) => overlapUs > 0)
      const grouped = new Map<
        string,
        CdpTraceSummary['longTasks'][number]['timelineEvents'][number]
      >()
      for (const { event, overlapUs } of overlappingEvents) {
        const pid = event.pid ?? null
        const tid = event.tid ?? null
        const category = event.cat ?? ''
        const key = `${event.name}\u0000${category}\u0000${pid}\u0000${tid}`
        const current = grouped.get(key)
        grouped.set(key, {
          name: event.name,
          category,
          overlapMs: (current?.overlapMs ?? 0) + overlapUs / 1_000,
          durationMs: Math.max(current?.durationMs ?? 0, (event.dur ?? 0) / 1_000),
          eventCount: (current?.eventCount ?? 0) + 1,
          pid,
          tid,
        })
      }
      const timelineEvents = [...grouped.values()]
        .sort(
          (left, right) =>
            right.overlapMs - left.overlapMs || left.name.localeCompare(right.name),
        )
        .slice(0, 100)
      return { task, timelineEvents }
    }),
  }
}

export function classifyConsoleMessage(
  type: string,
  text: string,
): ConsoleClassification {
  const lower = text.toLowerCase()
  if (
    type === 'warning' &&
    /(three(?:\.js)?|chunk|lazy)/i.test(text) &&
    /(delay|late|load|loaded|fetch)/i.test(text)
  )
    return 'accepted-delayed-three-chunk'
  if (/(shader|compile\s+failed|link\s+failed|webgl.*(?:error|invalid))/i.test(text))
    return 'shader-error'
  if (type === 'error') return 'error'
  if (type === 'warning') return 'warning'
  if (type === 'log' || type === 'info' || type === 'debug' || lower.length > 0)
    return 'info'
  return 'info'
}

export function digestJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function installEvidenceProbe(page: Page): Promise<void> {
  return page
    .addInitScript(() => {
      type HandlerRecord = {
        eventType: string
        target: string
        durationMs: number
        atMs: number
      }
      type LongTaskRecord = { startMs: number; durationMs: number; name: string }
      type PhaseName =
        | 'page-chunk-warmup'
        | 'pointerdown'
        | 'pointermove-window'
        | 'pointerup-canonical-commit'
        | 'autosave-wait'
        | 'stop-cleanup'
        | 'observer-test-instrumentation'
        | 'store-notification'
        | 'pointer-handler'
        | 'canonical-interaction-begin'
        | 'canonical-interaction-update'
        | 'canonical-commit-store-publication'
        | 'history-undo'
        | 'history-redo'
        | 'render'
        | 'stable-frame'
        | 'cleanup'
        | 'resize-pointerdown-app-handler'
        | 'resize-commit-app-handler'
        | 'resize-controller-start'
        | 'resize-controller-commit'
        | 'resize-transaction'
        | 'resize-begin-publish'
        | 'resize-history'
        | 'resize-autosave-schedule'
        | 'resize-commit-publish'
        | 'resize-pointerdown-handler-return-to-layout'
        | 'resize-commit-handler-return-to-layout'
        | 'resize-pointerdown-layout-to-first-render'
        | 'resize-commit-layout-to-first-render'
        | 'resize-pointerdown-first-render'
        | 'resize-commit-first-render'
        | 'unattributed'
      type PhaseRecord = {
        phase: PhaseName
        startMs: number
        endMs: number
        durationMs: number
      }

      const probeKey = '__apartmentEvidenceProbe'
      const originalAddEventListener = EventTarget.prototype.addEventListener
      const originalRemoveEventListener = EventTarget.prototype.removeEventListener
      const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
      const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
      const originalStorageSetItem = Storage.prototype.setItem
      const listenerWrappers = new WeakMap<object, Map<string, EventListener>>()
      const allLongTasks: LongTaskRecord[] = []
      const allUnhandledRejections: string[] = []
      let active = false
      let label = ''
      let startedAtMs = 0
      let frameLastMs: number | undefined
      let frameHandle = 0
      let saveStatusObserver: MutationObserver | undefined
      let lastSaveStatus = ''
      let longTaskObserver: PerformanceObserver | undefined
      let handlerDurations: HandlerRecord[] = []
      let frameIntervals: number[] = []
      let eventCounts: Record<string, number> = {}
      let eventTimes: Record<string, number[]> = {}
      let storageWrites: { key: string; atMs: number }[] = []
      let saveStatusTransitions: { text: string; atMs: number }[] = []
      let preWindowLongTasks: LongTaskRecord[] = []
      let phaseSpans: PhaseRecord[] = []
      let activePhaseStarts = new Map<number, { phase: PhaseName; startMs: number }>()
      let nextPhaseId = 1

      const recordPhase = (phase: PhaseName, startMs: number, endMs: number) => {
        if (endMs < startMs) return
        phaseSpans.push({
          phase,
          startMs: startMs - startedAtMs,
          endMs: endMs - startedAtMs,
          durationMs: endMs - startMs,
        })
      }

      const startPhase = (phase: PhaseName): number | null => {
        if (!active) return null
        const id = nextPhaseId++
        performance.mark(`ac007:phase:${phase}:${id}:start`)
        activePhaseStarts.set(id, { phase, startMs: performance.now() })
        return id
      }

      const endPhase = (id: number | null) => {
        if (id === null) return
        const phase = activePhaseStarts.get(id)
        if (!phase) return
        activePhaseStarts.delete(id)
        const startMark = `ac007:phase:${phase.phase}:${id}:start`
        const endMark = `ac007:phase:${phase.phase}:${id}:end`
        performance.mark(endMark)
        performance.measure(`ac007:phase:${phase.phase}:${id}`, startMark, endMark)
        recordPhase(phase.phase, phase.startMs, performance.now())
      }

      const safeString = (value: unknown): string => {
        if (value instanceof Error) return value.message
        if (typeof value === 'string') return value
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      }

      const targetName = (target: EventTarget): string => {
        if (target === window) return 'window'
        if (target === document) return 'document'
        if (target instanceof HTMLCanvasElement) return 'canvas'
        if (target instanceof HTMLElement) return target.tagName.toLowerCase()
        return target.constructor?.name ?? 'EventTarget'
      }

      const optionCapture = (options: boolean | AddEventListenerOptions | undefined) =>
        typeof options === 'boolean' ? options : Boolean(options?.capture)

      const wrapperKey = (
        type: string,
        options: boolean | AddEventListenerOptions | undefined,
      ) => `${type}:${optionCapture(options)}`

      const monitoredEvents = new Set([
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'mousedown',
        'mousemove',
        'mouseup',
        'wheel',
      ])

      EventTarget.prototype.addEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ) {
        if (!listener || !monitoredEvents.has(type)) {
          return originalAddEventListener.call(this, type, listener, options)
        }
        const listenerObject = listener as object
        let wrappers = listenerWrappers.get(listenerObject)
        if (!wrappers) {
          wrappers = new Map()
          listenerWrappers.set(listenerObject, wrappers)
        }
        const key = wrapperKey(type, options)
        const existing = wrappers.get(key)
        if (existing) return originalAddEventListener.call(this, type, existing, options)
        const wrapped: EventListener = function (this: EventTarget, event: Event) {
          const start = performance.now()
          try {
            if (typeof listener === 'function') return listener.call(this, event)
            return listener.handleEvent(event)
          } finally {
            if (active) {
              const handlerEnd = performance.now()
              recordPhase('pointer-handler', start, handlerEnd)
              const instrumentationStart = performance.now()
              handlerDurations.push({
                eventType: type,
                target: targetName(this),
                durationMs: handlerEnd - start,
                atMs: start - startedAtMs,
              })
              recordPhase(
                'observer-test-instrumentation',
                instrumentationStart,
                performance.now(),
              )
            }
          }
        }
        wrappers.set(key, wrapped)
        return originalAddEventListener.call(this, type, wrapped, options)
      }

      EventTarget.prototype.removeEventListener = function (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
      ) {
        if (!listener || !monitoredEvents.has(type)) {
          return originalRemoveEventListener.call(this, type, listener, options)
        }
        const wrappers = listenerWrappers.get(listener as object)
        const wrapped = wrappers?.get(wrapperKey(type, options))
        return originalRemoveEventListener.call(this, type, wrapped ?? listener, options)
      }

      const captureEvent = (event: Event) => {
        if (!active) return
        const instrumentationStart = performance.now()
        const type = event.type
        eventCounts[type] = (eventCounts[type] ?? 0) + 1
        const times = eventTimes[type] ?? []
        times.push(performance.now() - startedAtMs)
        eventTimes[type] = times
        recordPhase(
          'observer-test-instrumentation',
          instrumentationStart,
          performance.now(),
        )
      }
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        originalAddEventListener.call(document, type, captureEvent, true)
      }

      originalAddEventListener.call(window, 'unhandledrejection', (event: Event) => {
        const rejection = event as PromiseRejectionEvent
        const instrumentationStart = performance.now()
        allUnhandledRejections.push(safeString(rejection.reason))
        if (active)
          recordPhase(
            'observer-test-instrumentation',
            instrumentationStart,
            performance.now(),
          )
      })

      Storage.prototype.setItem = function (key: string, value: string) {
        const start = performance.now()
        const result = originalStorageSetItem.call(this, key, value)
        if (active) {
          storageWrites.push({ key, atMs: start - startedAtMs })
          recordPhase('cleanup', start, performance.now())
        }
        return result
      }

      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const instrumentationStart = performance.now()
            allLongTasks.push({
              startMs: entry.startTime,
              durationMs: entry.duration,
              name: entry.name,
            })
            if (active)
              recordPhase(
                'observer-test-instrumentation',
                instrumentationStart,
                performance.now(),
              )
          }
        })
        longTaskObserver.observe({ entryTypes: ['longtask'] })
      } catch {
        longTaskObserver = undefined
      }

      const observeSaveStatus = () => {
        const element = document.querySelector('.save-state')
        if (!element) return
        lastSaveStatus = element.textContent?.trim() ?? ''
        saveStatusObserver = new MutationObserver(() => {
          const instrumentationStart = performance.now()
          const next = element.textContent?.trim() ?? ''
          if (active && next !== lastSaveStatus) {
            saveStatusTransitions.push({
              text: next,
              atMs: instrumentationStart - startedAtMs,
            })
          }
          lastSaveStatus = next
          if (active)
            recordPhase(
              'observer-test-instrumentation',
              instrumentationStart,
              performance.now(),
            )
        })
        saveStatusObserver.observe(element, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        })
      }

      const sampleFrame = (time: number) => {
        if (!active) return
        const instrumentationStart = performance.now()
        if (frameLastMs !== undefined) frameIntervals.push(time - frameLastMs)
        frameLastMs = time
        frameHandle = originalRequestAnimationFrame(sampleFrame)
        recordPhase(
          'observer-test-instrumentation',
          instrumentationStart,
          performance.now(),
        )
      }

      const start = (nextLabel: string) => {
        if (active) throw new Error('An evidence window is already active.')
        const instrumentationStart = performance.now()
        label = nextLabel
        startedAtMs = instrumentationStart
        performance.mark('ac007:evidence-window-start')
        const flush = longTaskObserver?.takeRecords() ?? []
        for (const entry of flush) {
          allLongTasks.push({
            startMs: entry.startTime,
            durationMs: entry.duration,
            name: entry.name,
          })
        }
        preWindowLongTasks = allLongTasks
          .filter((entry) => entry.startMs + entry.durationMs <= startedAtMs)
          .map((entry) => ({
            startMs: entry.startMs - startedAtMs,
            durationMs: entry.durationMs,
            name: entry.name,
          }))
        active = true
        frameLastMs = undefined
        handlerDurations = []
        frameIntervals = []
        eventCounts = {}
        eventTimes = {}
        storageWrites = []
        saveStatusTransitions = []
        phaseSpans = []
        for (const task of preWindowLongTasks) {
          phaseSpans.push({
            phase: 'page-chunk-warmup',
            startMs: task.startMs,
            endMs: task.startMs + task.durationMs,
            durationMs: task.durationMs,
          })
        }
        activePhaseStarts = new Map()
        observeSaveStatus()
        frameHandle = originalRequestAnimationFrame(sampleFrame)
        recordPhase(
          'observer-test-instrumentation',
          instrumentationStart,
          performance.now(),
        )
      }

      const stop = () => {
        if (!active) throw new Error('No evidence window is active.')
        const endedAtMs = performance.now()
        active = false
        originalCancelAnimationFrame(frameHandle)
        saveStatusObserver?.disconnect()
        saveStatusObserver = undefined
        const flush = longTaskObserver?.takeRecords() ?? []
        for (const entry of flush) {
          allLongTasks.push({
            startMs: entry.startTime,
            durationMs: entry.duration,
            name: entry.name,
          })
        }
        const longTasks = allLongTasks
          .filter(
            (entry) =>
              entry.startMs < endedAtMs &&
              entry.startMs + entry.durationMs > startedAtMs &&
              entry.durationMs >= 0,
          )
          .map((entry) => ({
            startMs: entry.startMs - startedAtMs,
            durationMs: entry.durationMs,
            name: entry.name,
          }))
        const cleanupStart = endedAtMs
        recordPhase('stop-cleanup', cleanupStart, performance.now())
        return {
          label,
          durationMs: endedAtMs - startedAtMs,
          startedAtMs,
          endedAtMs,
          handlerDurations,
          frameIntervals,
          longTasks,
          preWindowLongTasks,
          phaseSpans,
          eventCounts,
          eventTimes,
          storageWrites,
          saveStatusTransitions,
          unhandledRejections: [...allUnhandledRejections],
        }
      }

      const getDiagnostics = () => ({
        unhandledRejections: [...allUnhandledRejections],
        longTasks: allLongTasks.map((entry) => ({ ...entry })),
      })

      Object.defineProperty(window, probeKey, {
        configurable: true,
        value: { getDiagnostics, start, stop, startPhase, endPhase },
      })
    })
    .then(() => undefined)
}

export async function startEvidenceWindow(page: Page, label: string): Promise<void> {
  await page.evaluate((nextLabel) => {
    const probe = (
      window as unknown as {
        __apartmentEvidenceProbe: { start: (value: string) => void }
      }
    ).__apartmentEvidenceProbe
    probe.start(nextLabel)
  }, label)
}

export async function startEvidencePhase(
  page: Page,
  phase: EvidencePhase,
): Promise<number | null> {
  return page.evaluate((nextPhase) => {
    const probe = (
      window as unknown as {
        __apartmentEvidenceProbe: {
          startPhase: (value: EvidencePhase) => number | null
        }
      }
    ).__apartmentEvidenceProbe
    return probe.startPhase(nextPhase)
  }, phase)
}

export async function endEvidencePhase(page: Page, token: number | null): Promise<void> {
  await page.evaluate((phaseToken) => {
    const probe = (
      window as unknown as {
        __apartmentEvidenceProbe: { endPhase: (value: number | null) => void }
      }
    ).__apartmentEvidenceProbe
    probe.endPhase(phaseToken)
  }, token)
}

export async function stopEvidenceWindow(page: Page): Promise<EvidenceProbeWindow> {
  const windowTrace = await page.evaluate(() => {
    const probe = (
      window as unknown as {
        __apartmentEvidenceProbe: { stop: () => EvidenceProbeWindow }
      }
    ).__apartmentEvidenceProbe
    return probe.stop()
  })
  return {
    ...windowTrace,
    longTaskAttributions: attributeLongTasks(
      windowTrace.longTasks,
      windowTrace.phaseSpans,
    ),
  }
}

export async function readProbeDiagnostics(page: Page): Promise<{
  readonly unhandledRejections: readonly string[]
}> {
  return page.evaluate(() => {
    const probe = (
      window as unknown as {
        __apartmentEvidenceProbe: {
          getDiagnostics: () => { unhandledRejections: readonly string[] }
        }
      }
    ).__apartmentEvidenceProbe
    return probe.getDiagnostics()
  })
}

export function attachPageDiagnostics(page: Page): {
  readonly diagnostics: PageDiagnostics
} {
  const consoleMessages: PageConsoleMessage[] = []
  const pageErrors: string[] = []
  const failedRequests: PageDiagnostics['failedRequests'][number][] = []
  const failedResponses: PageDiagnostics['failedResponses'][number][] = []
  page.on('console', (message) => {
    const location = message.location().url || null
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      classification: classifyConsoleMessage(message.type(), message.text()),
      location,
    })
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: safePath(request.url()),
      method: request.method(),
      failure: request.failure()?.errorText ?? null,
    })
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    failedResponses.push({
      url: safePath(response.url()),
      status: response.status(),
      resourceType: response.request().resourceType(),
    })
  })
  return {
    diagnostics: {
      consoleMessages,
      pageErrors,
      failedRequests,
      failedResponses,
    },
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url.replace(/[?#].*$/, '')
  }
}

export async function collectRuntimeEnvironment(
  page: Page,
  browser: Browser,
  viewport: { readonly width: number; readonly height: number },
): Promise<RuntimeEnvironment> {
  const browserInfo = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory:
      'deviceMemory' in navigator
        ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null)
        : null,
    devicePixelRatio: window.devicePixelRatio,
  }))
  return {
    host: {
      platform: os.platform(),
      release: os.release(),
      version: os.version(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model ?? null,
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    browser: {
      name: browser.browserType().name(),
      version: browser.version(),
      ...browserInfo,
    },
    build: {
      mode: 'production',
      command: 'npm.cmd run build && tsx scripts/serve-dist.ts',
      baseUrl: `http://127.0.0.1:4173 (${viewport.width}x${viewport.height})`,
    },
  }
}

export async function readRendererRuntime(page: Page): Promise<RendererRuntimeSnapshot> {
  return page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getSnapshot(): {
            scene: {
              background?: { getHexString?: () => string } | null
              traverse(callback: (object: unknown) => void): void
            }
            camera: unknown
            gl: {
              domElement: HTMLCanvasElement
              getPixelRatio?: () => number
              getContext?: () => {
                getContextAttributes?: () => { antialias?: boolean } | null
              }
              toneMapping?: number
              toneMappingExposure?: number
              shadowMap?: { type?: number }
            }
            profile: {
              id: 'editor' | 'preview'
              qualityTier: 'edit' | 'high' | 'balanced' | 'safe'
              dpr: readonly [number, number]
              antialias: boolean
              shadowMapSize: number
              exposure: number
            }
          }
        }
      }
    ).__apartmentRendererEvidence
    const state = bridge?.getSnapshot()
    const canvas = state?.gl.domElement ?? null
    if (!state || !canvas) {
      return {
        available: false,
        profile:
          document
            .querySelector('[data-testid="scene-canvas"]')
            ?.getAttribute('data-renderer-profile') ?? null,
        canvas: canvas
          ? {
              width: canvas.width,
              height: canvas.height,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight,
            }
          : null,
        renderer: null,
        qualityTier: null,
      }
    }
    const shadowMapSizes: number[] = []
    const lights: {
      type: string
      intensity: number | null
      color: string | null
      castShadow?: boolean
    }[] = []
    state.scene.traverse((object) => {
      const light = object as {
        isLight?: boolean
        type?: string
        intensity?: number
        color?: { getHexString?: () => string }
        castShadow?: boolean
        shadow?: { mapSize?: { x?: number; y?: number } }
      }
      if (light.castShadow && light.shadow?.mapSize?.x)
        shadowMapSizes.push(light.shadow.mapSize.x)
      if (light.isLight)
        lights.push({
          type: light.type ?? 'Light',
          intensity: light.intensity ?? null,
          color: light.color?.getHexString?.() ?? null,
          castShadow: light.castShadow,
        })
    })
    return {
      available: true,
      profile: state.profile.id,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      },
      renderer: {
        pixelRatio: state.gl.getPixelRatio?.() ?? null,
        antialias: state.gl.getContext?.().getContextAttributes?.()?.antialias ?? null,
        toneMapping: state.gl.toneMapping ?? null,
        toneMappingExposure: state.gl.toneMappingExposure ?? null,
        shadowMapType: state.gl.shadowMap?.type ?? null,
        shadowMapSizes,
        configuredDpr: state.profile.dpr,
        configuredAntialias: state.profile.antialias,
        configuredShadowMapSize: state.profile.shadowMapSize,
        configuredExposure: state.profile.exposure,
        lighting: {
          background: state.scene.background?.getHexString?.() ?? null,
          lights,
        },
      },
      qualityTier: state.profile.qualityTier,
    }
  })
}

export async function waitForRendererEvidence(
  page: Page,
  timeoutMs = 10_000,
): Promise<RendererRuntimeSnapshot> {
  try {
    await page.waitForFunction(
      () => {
        const bridge = (
          window as unknown as {
            __apartmentRendererEvidence?: {
              getSnapshot(): { gl?: { domElement?: HTMLCanvasElement } }
            }
          }
        ).__apartmentRendererEvidence
        return Boolean(bridge?.getSnapshot().gl?.domElement?.isConnected)
      },
      undefined,
      { timeout: timeoutMs },
    )
  } catch (error) {
    const cameraControlsDisabled = await page
      .getByRole('button', { name: 'Top view', exact: true })
      .isDisabled()
      .catch(() => true)
    throw new Error(
      `EVIDENCE_SETUP_UNRESOLVED: renderer evidence bridge was not ready within ${timeoutMs}ms (cameraControlsDisabled=${cameraControlsDisabled}): ${String(error)}`,
    )
  }
  const runtime = await readRendererRuntime(page)
  if (!runtime.available || !runtime.renderer)
    throw new Error('EVIDENCE_SETUP_UNRESOLVED: renderer evidence runtime is null.')
  return runtime
}

export interface RendererEvidenceCounters {
  readonly storeNotifications: number
  readonly canonicalCommands: number
  readonly interactionBegins: number
  readonly interactionUpdates: number
  readonly history: {
    readonly undo: number
    readonly redo: number
  }
}

export async function resetRendererEvidenceCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: { resetCounters(): void }
      }
    ).__apartmentRendererEvidence
    if (!bridge)
      throw new Error('EVIDENCE_SETUP_UNRESOLVED: renderer evidence bridge is absent.')
    bridge.resetCounters()
  })
}

export async function readRendererEvidenceCounters(
  page: Page,
): Promise<RendererEvidenceCounters> {
  return page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getCounters(): {
            storeNotifications: number
            canonicalCommands: number
            interactionBegins: number
            interactionUpdates: number
            history: { undo: number; redo: number }
          }
        }
      }
    ).__apartmentRendererEvidence
    if (!bridge)
      throw new Error('EVIDENCE_SETUP_UNRESOLVED: renderer evidence bridge is absent.')
    return bridge.getCounters()
  })
}

export async function waitForStableFrames(
  page: Page,
  stableFrameCount = 2,
  timeoutMs = 5_000,
): Promise<{ readonly elapsedMs: number; readonly stableFrameCount: number }> {
  const startedAt = await page.evaluate(() => performance.now())
  return waitForStableFramesSince(page, startedAt, stableFrameCount, timeoutMs)
}

export async function waitForStableFramesSince(
  page: Page,
  startedAtMs: number,
  stableFrameCount = 2,
  timeoutMs = 5_000,
): Promise<{ readonly elapsedMs: number; readonly stableFrameCount: number }> {
  return page.evaluate(
    ({ startedAtMs: started, stableFrameCount: required, timeoutMs: timeout }) =>
      new Promise<{ elapsedMs: number; stableFrameCount: number }>((resolve, reject) => {
        let previous = ''
        let stable = 0
        const frame = (time: number) => {
          const sceneCanvas = document.querySelector('[data-testid="scene-canvas"]')
          const canvas = sceneCanvas?.querySelector('canvas') as HTMLCanvasElement | null
          const signature = JSON.stringify({
            profile: sceneCanvas?.getAttribute('data-renderer-profile') ?? null,
            canvasWidth: canvas?.width ?? 0,
            canvasHeight: canvas?.height ?? 0,
            clientWidth: canvas?.clientWidth ?? 0,
            clientHeight: canvas?.clientHeight ?? 0,
          })
          stable = signature === previous ? stable + 1 : 1
          previous = signature
          if (canvas && stable >= required) {
            resolve({ elapsedMs: time - started, stableFrameCount: stable })
            return
          }
          if (time - started > timeout) {
            reject(new Error(`Timed out waiting for ${required} stable frames.`))
            return
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    { startedAtMs, stableFrameCount, timeoutMs },
  )
}

export async function waitForRendererRestoration(
  page: Page,
  baseline: RendererRuntimeSnapshot,
  timeoutMs = 250,
): Promise<{
  readonly elapsedMs: number
  readonly restored: boolean
  readonly current: RendererRuntimeSnapshot
}> {
  const startedAt = await page.evaluate(() => performance.now())
  let current = await readRendererRuntime(page)
  while (true) {
    const elapsedMs = (await page.evaluate(() => performance.now())) - startedAt
    const same = rendererRuntimeRestored(baseline, current)
    if (same) return { elapsedMs, restored: true, current }
    if (elapsedMs > timeoutMs) return { elapsedMs, restored: false, current }
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
    current = await readRendererRuntime(page)
  }
}

export function rendererRuntimeRestored(
  baseline: RendererRuntimeSnapshot,
  current: RendererRuntimeSnapshot,
): boolean {
  return (
    baseline.available === current.available &&
    baseline.profile === current.profile &&
    baseline.qualityTier === current.qualityTier &&
    JSON.stringify(baseline.renderer) === JSON.stringify(current.renderer)
  )
}

export async function projectedObjectPoint(
  page: Page,
  objectName: string,
): Promise<{
  readonly x: number
  readonly y: number
}> {
  return page.evaluate((name) => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getSnapshot(): {
            scene: {
              getObjectByName?: (value: string) => unknown
              traverse?: (callback: (object: unknown) => void) => void
            }
            camera: unknown
            gl: { domElement: HTMLCanvasElement }
          }
        }
      }
    ).__apartmentRendererEvidence
    const state = bridge?.getSnapshot()
    const canvas = state?.gl.domElement ?? null
    const object = state?.scene?.getObjectByName?.(name) as
      | {
          getWorldPosition?: (target: unknown) => { x: number; y: number; z: number }
          position?: { clone?: () => { x: number; y: number; z: number } }
        }
      | undefined
    const camera = state?.camera as
      | {
          updateMatrixWorld?: () => void
          projectionMatrix?: unknown
          matrixWorld?: unknown
        }
      | undefined
    if (
      !canvas ||
      !object ||
      !camera ||
      !object.position?.clone ||
      !camera.updateMatrixWorld
    ) {
      const names: string[] = []
      state?.scene?.traverse?.((current) => {
        const value = current as { name?: string }
        if (value.name) names.push(value.name)
      })
      throw new Error(
        `Unable to project Three.js object ${name} (canvas=${Boolean(canvas)}, object=${Boolean(object)}, camera=${Boolean(camera)}, position=${Boolean(object?.position?.clone)}, sceneNames=${names.slice(0, 12).join(',')}).`,
      )
    }
    camera.updateMatrixWorld()
    const point = object.position.clone()
    if (object.getWorldPosition) object.getWorldPosition(point)
    const projected = (
      point as unknown as { project?: (value: unknown) => unknown }
    ).project?.(camera) as unknown as { x: number; y: number } | undefined
    if (!projected) throw new Error(`Unable to project Three.js object ${name}.`)
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    }
  }, objectName)
}

export interface ResizeGeometryWitness {
  readonly objectFound: boolean
  readonly position: readonly [number, number, number] | null
  readonly scale: readonly [number, number, number] | null
  readonly inspectorDimensions: {
    readonly width: string | null
    readonly depth: string | null
    readonly height: string | null
  }
}

export async function readResizeGeometryWitness(
  page: Page,
  entityId: string,
): Promise<ResizeGeometryWitness> {
  return page.evaluate((id) => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getSnapshot(): {
            scene: {
              getObjectByName?: (value: string) => unknown
            }
          }
        }
      }
    ).__apartmentRendererEvidence
    const object = bridge?.getSnapshot().scene.getObjectByName?.(id) as
      | {
          position?: { x: number; y: number; z: number }
          scale?: { x: number; y: number; z: number }
        }
      | undefined
    const value = (testId: string) =>
      (document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | null)
        ?.value ?? null
    return {
      objectFound: Boolean(object),
      position: object?.position
        ? [object.position.x, object.position.y, object.position.z]
        : null,
      scale: object?.scale ? [object.scale.x, object.scale.y, object.scale.z] : null,
      inspectorDimensions: {
        width: value('dimensions-width'),
        depth: value('dimensions-depth'),
        height: value('dimensions-height'),
      },
    }
  }, entityId)
}

export async function projectedTransformHandle(
  page: Page,
  axis: 'X' | 'Y' | 'Z' = 'X',
): Promise<{ readonly x: number; readonly y: number }> {
  return page.evaluate((handleAxis) => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getSnapshot(): {
            scene: { traverse?: (callback: (object: unknown) => void) => void }
            camera: unknown
            gl: { domElement: HTMLCanvasElement }
          }
        }
      }
    ).__apartmentRendererEvidence
    const state = bridge?.getSnapshot()
    const canvas = state?.gl.domElement ?? null
    if (!canvas || !state?.scene?.traverse || !state.camera) {
      throw new Error('Unable to access the R3F scene for TransformControls.')
    }
    type Handle = {
      name?: string
      geometry?: {
        boundingSphere?: {
          center?: { clone?: () => { x: number; y: number; z: number } }
        }
        computeBoundingSphere?: () => void
      }
      matrixWorld?: unknown
      updateWorldMatrix?: (updateParents: boolean, updateChildren: boolean) => void
    }
    let gizmo:
      | {
          picker?: {
            translate?: { children?: Handle[] }
          }
        }
      | undefined
    state.scene.traverse((object) => {
      const current = object as {
        isTransformControlsGizmo?: boolean
        picker?: { translate?: { children?: Handle[] } }
      }
      if (current.isTransformControlsGizmo) gizmo = current
    })
    const candidate = gizmo?.picker?.translate?.children?.find(
      (handle) => handle.name === handleAxis,
    )
    if (!candidate?.geometry || !candidate.matrixWorld) {
      throw new Error(`Unable to find TransformControls ${handleAxis} picker.`)
    }
    candidate.updateWorldMatrix?.(true, false)
    candidate.geometry.computeBoundingSphere?.()
    const center = candidate.geometry.boundingSphere?.center?.clone?.()
    if (!center) throw new Error(`Unable to find the ${handleAxis} handle center.`)
    const world = (
      center as unknown as { applyMatrix4?: (matrix: unknown) => unknown }
    ).applyMatrix4?.(candidate.matrixWorld) as unknown as {
      project?: (camera: unknown) => unknown
      x: number
      y: number
    }
    if (!world?.project) throw new Error(`Unable to project the ${handleAxis} handle.`)
    const projected = world.project(state.camera) as unknown as { x: number; y: number }
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    }
  }, axis)
}

export async function dragForWindow(
  page: Page,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  durationMs: number,
  updateCount: number,
  pointerAlreadyAtStart = false,
  beforePointerUp?: () => Promise<void>,
): Promise<void> {
  if (!pointerAlreadyAtStart) await page.mouse.move(start.x, start.y)
  const pointerDownPhase = await startEvidencePhase(page, 'pointerdown')
  try {
    await page.mouse.down()
  } finally {
    await endEvidencePhase(page, pointerDownPhase)
  }
  const pointerMovePhase = await startEvidencePhase(page, 'pointermove-window')
  const startedAt = Date.now()
  try {
    for (let index = 1; index <= updateCount; index += 1) {
      const targetAt = startedAt + (durationMs * index) / updateCount
      const waitMs = targetAt - Date.now()
      if (waitMs > 0)
        await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, waitMs))
      const progress = index / updateCount
      await page.mouse.move(
        start.x + (end.x - start.x) * progress,
        start.y + (end.y - start.y) * progress,
      )
    }
    const remaining = startedAt + durationMs - Date.now()
    if (remaining > 0)
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, remaining))
  } finally {
    await endEvidencePhase(page, pointerMovePhase)
  }
  await beforePointerUp?.()
  const pointerUpPhase = await startEvidencePhase(page, 'pointerup-canonical-commit')
  try {
    await page.mouse.up()
  } finally {
    await endEvidencePhase(page, pointerUpPhase)
  }
}

export async function orbitForWindow(
  page: Page,
  center: { readonly x: number; readonly y: number },
  radius: number,
  durationMs: number,
  updateCount: number,
  pointerAlreadyAtStart = false,
): Promise<void> {
  if (!pointerAlreadyAtStart) await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  const startedAt = Date.now()
  for (let index = 1; index <= updateCount; index += 1) {
    const targetAt = startedAt + (durationMs * index) / updateCount
    const waitMs = targetAt - Date.now()
    if (waitMs > 0)
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, waitMs))
    const angle = (Math.PI * 2 * index) / updateCount
    await page.mouse.move(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
    )
  }
  const remaining = startedAt + durationMs - Date.now()
  if (remaining > 0)
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, remaining))
  await page.mouse.up()
}

export function assessFrameWindow(
  probe: EvidenceProbeWindow,
  options: {
    readonly durationMs: number
    readonly minimumUpdates: number
    readonly handlerP95Ms?: number
    readonly handlerMaxMs?: number
    readonly frameP95Ms?: number
  },
): EvidenceAssessment {
  const handlerSummary = summarizeSamples(
    probe.handlerDurations.map((sample) => sample.durationMs),
  )
  const frameSummary = summarizeSamples(probe.frameIntervals)
  const longTaskSummary = {
    over50Ms: probe.longTasks.filter((entry) => entry.durationMs > 50).length,
    over100Ms: probe.longTasks.filter((entry) => entry.durationMs > 100).length,
    maxMs:
      probe.longTasks.length > 0
        ? Math.max(...probe.longTasks.map((entry) => entry.durationMs))
        : null,
  }
  const checks: EvidenceCheck[] = [
    {
      name: 'observation-duration',
      passed: probe.durationMs >= options.durationMs,
      observed: probe.durationMs,
      threshold: options.durationMs,
    },
    {
      name: 'pointer-updates',
      passed: (probe.eventCounts.pointermove ?? 0) >= options.minimumUpdates,
      observed: probe.eventCounts.pointermove ?? 0,
      threshold: options.minimumUpdates,
    },
    {
      name: 'handler-p95',
      passed:
        handlerSummary.p95 !== null && handlerSummary.p95 <= (options.handlerP95Ms ?? 4),
      observed: handlerSummary.p95,
      threshold: options.handlerP95Ms ?? 4,
    },
    {
      name: 'handler-max',
      passed:
        handlerSummary.max !== null && handlerSummary.max <= (options.handlerMaxMs ?? 16),
      observed: handlerSummary.max,
      threshold: options.handlerMaxMs ?? 16,
    },
    {
      name: 'frame-interval-p95',
      passed: frameSummary.p95 !== null && frameSummary.p95 <= (options.frameP95Ms ?? 25),
      observed: frameSummary.p95,
      threshold: options.frameP95Ms ?? 25,
    },
    {
      name: 'long-task-over-50ms',
      passed: longTaskSummary.over50Ms <= 1,
      observed: longTaskSummary.over50Ms,
      threshold: 1,
    },
    {
      name: 'long-task-over-100ms',
      passed: longTaskSummary.over100Ms === 0,
      observed: longTaskSummary.over100Ms,
      threshold: 0,
    },
  ]
  return {
    status: checks.every((check) => check.passed) ? 'PASS' : 'FAIL',
    checks,
    handlerSummary,
    frameSummary,
    longTaskSummary,
  }
}

export function mergeDiagnostics(
  diagnostics: PageDiagnostics,
  probeDiagnostics: { readonly unhandledRejections: readonly string[] },
): PageDiagnostics & {
  readonly consoleErrors: readonly PageConsoleMessage[]
  readonly consoleWarnings: readonly PageConsoleMessage[]
  readonly acceptedDelayedThreeChunkWarnings: readonly PageConsoleMessage[]
  readonly shaderErrors: readonly PageConsoleMessage[]
  readonly unhandledRejections: readonly string[]
  readonly missingAssets: readonly PageDiagnostics['failedResponses'][number][]
} {
  const consoleErrors = diagnostics.consoleMessages.filter(
    (message) => message.classification === 'error',
  )
  const consoleWarnings = diagnostics.consoleMessages.filter(
    (message) => message.classification === 'warning',
  )
  const acceptedDelayedThreeChunkWarnings = diagnostics.consoleMessages.filter(
    (message) => message.classification === 'accepted-delayed-three-chunk',
  )
  const shaderErrors = diagnostics.consoleMessages.filter(
    (message) => message.classification === 'shader-error',
  )
  return {
    ...diagnostics,
    consoleErrors,
    consoleWarnings,
    acceptedDelayedThreeChunkWarnings,
    shaderErrors,
    unhandledRejections: [...probeDiagnostics.unhandledRejections],
    missingAssets: diagnostics.failedResponses.filter(
      (response) => response.status === 404,
    ),
  }
}

async function readCdpTraceStream(session: CDPSession, stream: string) {
  const chunks: Buffer[] = []
  while (true) {
    const response = (await session.send('IO.read', { handle: stream })) as {
      readonly data: string
      readonly base64Encoded?: boolean
      readonly eof?: boolean
    }
    chunks.push(Buffer.from(response.data, response.base64Encoded ? 'base64' : 'utf8'))
    if (response.eof) break
  }
  await session.send('IO.close', { handle: stream })
  return Buffer.concat(chunks)
}

export async function startChromiumCdpTrace(
  page: Page,
  name: string,
): Promise<{
  stop(longTasks: readonly LongTaskSample[]): Promise<{
    readonly tracePath: string
    readonly attributionPath: string
    readonly traceSizeBytes: number
    readonly summary: CdpTraceSummary
  }>
}> {
  const session = await page.context().newCDPSession(page)
  await session.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: {
      recordMode: 'recordContinuously',
      includedCategories: [
        'blink.user_timing',
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'disabled-by-default-devtools.timeline.stack',
        'renderer.scheduler',
        'v8',
        'v8.execute',
        'disabled-by-default-v8.cpu_profiler',
        'gpu',
        'cc',
        'latencyInfo',
      ],
    },
  })
  return {
    stop: async (longTasks) => {
      const completed = new Promise<string>((resolvePromise, rejectPromise) => {
        session.once('Tracing.tracingComplete', (event: { readonly stream?: string }) => {
          if (event.stream) resolvePromise(event.stream)
          else rejectPromise(new Error('CDP tracing completed without a stream.'))
        })
      })
      await session.send('Tracing.end')
      const traceBuffer = await readCdpTraceStream(session, await completed)
      const parsed = JSON.parse(traceBuffer.toString('utf8')) as {
        readonly traceEvents?: readonly CdpTraceEvent[]
      }
      const summary = summarizeCdpTrace(parsed.traceEvents ?? [], longTasks)
      const traceRoot = join(
        resolve(process.cwd()),
        'docs',
        'reports',
        'evidence',
        'traces',
      )
      mkdirSync(traceRoot, { recursive: true })
      const tracePath = join(traceRoot, `${name}.trace`)
      const attributionPath = join(traceRoot, `${name}.attribution.json`)
      writeFileSync(tracePath, traceBuffer)
      writeFileSync(attributionPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
      await session.detach()
      return {
        tracePath,
        attributionPath,
        traceSizeBytes: traceBuffer.byteLength,
        summary,
      }
    },
  }
}

export async function persistEvidenceArtifact(
  testInfo: TestInfo,
  name: string,
  artifact: EvidenceArtifact,
): Promise<{ readonly rawPath: string; readonly summaryPath: string }> {
  const repositoryRoot = resolve(process.cwd())
  const evidenceRoot = join(repositoryRoot, 'docs', 'reports', 'evidence')
  const rawRoot = join(evidenceRoot, 'raw')
  mkdirSync(rawRoot, { recursive: true })
  const rawFile = `${name}.json`
  const rawPath = join(rawRoot, rawFile)
  const rawText = `${JSON.stringify(artifact, null, 2)}\n`
  writeFileSync(rawPath, rawText, 'utf8')
  await testInfo.attach(`${name}.json`, {
    body: Buffer.from(rawText),
    contentType: 'application/json',
  })

  const summaryPath = regenerateEvidenceSummary(evidenceRoot)
  return { rawPath, summaryPath }
}
