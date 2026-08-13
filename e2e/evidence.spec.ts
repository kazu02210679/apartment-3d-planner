import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test, type Browser, type Page } from '@playwright/test'
import { PCFShadowMap } from 'three'

import { createPerformanceScene } from '../src/test/performance-scene'
import { getRendererProfile, type PreviewQualityTier } from '../src/renderer/quality'
import {
  assessAutosaveEvidence,
  assessBoundedWindowDuration,
  assessFrameWindow,
  attachPageDiagnostics,
  classifyLongTaskWindow,
  classifyResizeSetup,
  countEvidencePhaseOccurrences,
  collectRuntimeEnvironment,
  digestJson,
  dragForWindow,
  endEvidencePhase,
  forceEvidencePreviewTier,
  installEvidenceProbe,
  inertPointerMoveTransportBaseline,
  longTasksOverlappingPhases,
  mergeDiagnostics,
  orbitForWindow,
  persistEvidenceArtifact,
  projectedObjectPoint,
  projectedTransformHandle,
  projectEvidenceSummaryRun,
  readProbeDiagnostics,
  readRendererEvidenceCounters,
  readRendererRuntime,
  readResizeGeometryWitness,
  rendererRuntimeRestored,
  resetRendererEvidenceCounters,
  summarizeSamples,
  summarizeLongTaskWindow,
  startEvidencePhase,
  startEvidenceWindow,
  startChromiumCdpTrace,
  stopEvidenceWindow,
  storageWritesInWindow,
  waitForRendererEvidence,
  waitForRendererRestoration,
  waitForStableFrames,
  waitForStableFramesSince,
  type EvidenceArtifact,
  type EvidenceProbeWindow,
  type RendererRuntimeSnapshot,
  type ResizeGeometryWitness,
} from './evidence'

const VIEWPORT = { width: 1440, height: 900 } as const
const LONG_WINDOW_MS = 5_000
const PREVIEW_WINDOW_MS = 10_000
const PREVIEW_WINDOW_MAX_MS = 20_000
const LONG_UPDATE_COUNT = 360
const SINGLE_UPDATE_COUNT = 1
const WARMUP_UPDATE_COUNT = 4
const PREVIEW_UPDATE_COUNT = 720

function readExistingEvidenceFile(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

test.use({ viewport: VIEWPORT })

type Point = { readonly x: number; readonly y: number }

function previewButton(page: Page) {
  return page.locator('.quality-mode-switch .mode-button--primary')
}

function editButton(page: Page) {
  return page.locator('.preview-mode-switch button')
}

function undoButton(page: Page) {
  return page.locator('header .toolbar-button').nth(1)
}

function redoButton(page: Page) {
  return page.locator('header .toolbar-button').nth(2)
}

async function exportedScene(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.locator('header .toolbar-button--export').click()
  const stream = await (await downloadPromise).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let json = ''
  for await (const chunk of stream) json += chunk.toString()
  return json
}

type CameraOrbitSnapshot = {
  readonly position: readonly [number, number, number] | null
  readonly quaternion: readonly [number, number, number, number] | null
  readonly zoom: number | null
  readonly target: readonly [number, number, number] | null
}

const CAMERA_STATE_TOLERANCE = 1e-3
const CAMERA_SETTLE_TOLERANCE = 1e-4
const CAMERA_SETTLE_TIMEOUT_MS = 5_000
const CAMERA_SETTLE_SAMPLE_INTERVAL_MS = 16
const CAMERA_SETTLE_CONSECUTIVE_SAMPLES = 4

async function readCameraOrbitSnapshot(page: Page): Promise<CameraOrbitSnapshot> {
  return page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __apartmentRendererEvidence?: {
          getSnapshot(): {
            camera?: {
              position?: { x?: number; y?: number; z?: number }
              quaternion?: { x?: number; y?: number; z?: number; w?: number }
              zoom?: number
            }
            orbitTarget?: readonly number[] | null
          }
        }
      }
    ).__apartmentRendererEvidence
    const state = bridge?.getSnapshot()
    const camera = state?.camera
    const finite = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value)
    const position = camera?.position
    const quaternion = camera?.quaternion
    const target = state?.orbitTarget
    return {
      position:
        position && finite(position.x) && finite(position.y) && finite(position.z)
          ? ([position.x, position.y, position.z] as const)
          : null,
      quaternion:
        quaternion &&
        finite(quaternion.x) &&
        finite(quaternion.y) &&
        finite(quaternion.z) &&
        finite(quaternion.w)
          ? ([quaternion.x, quaternion.y, quaternion.z, quaternion.w] as const)
          : null,
      zoom: finite(camera?.zoom) ? camera.zoom : null,
      target:
        target?.length === 3 && target.every(finite)
          ? ([target[0]!, target[1]!, target[2]!] as const)
          : null,
    }
  })
}

function cameraOrbitSnapshotsEqualWithin(
  left: CameraOrbitSnapshot,
  right: CameraOrbitSnapshot,
  tolerance: number,
): boolean {
  const arraysEqual = (
    first: readonly number[] | null,
    second: readonly number[] | null,
  ) =>
    first !== null &&
    second !== null &&
    first.length === second.length &&
    first.every((value, index) => Math.abs(value - second[index]!) <= tolerance)
  return (
    arraysEqual(left.position, right.position) &&
    arraysEqual(left.quaternion, right.quaternion) &&
    left.zoom !== null &&
    right.zoom !== null &&
    Math.abs(left.zoom - right.zoom) <= tolerance &&
    arraysEqual(left.target, right.target)
  )
}

function cameraOrbitSnapshotsApproximatelyEqual(
  left: CameraOrbitSnapshot,
  right: CameraOrbitSnapshot,
): boolean {
  return cameraOrbitSnapshotsEqualWithin(left, right, CAMERA_STATE_TOLERANCE)
}

function cameraOrbitSnapshotIsComplete(snapshot: CameraOrbitSnapshot): boolean {
  return (
    snapshot.position !== null &&
    snapshot.quaternion !== null &&
    snapshot.zoom !== null &&
    snapshot.target !== null
  )
}

type CameraSettledResult = {
  readonly status: 'SETTLED' | 'TIMEOUT' | 'UNAVAILABLE'
  readonly elapsedMs: number
  readonly sampleCount: number
  readonly validSampleCount: number
  readonly consecutiveStableSamples: number
  readonly tolerance: number
  readonly requiredConsecutiveSamples: number
  readonly lastSnapshot: CameraOrbitSnapshot | null
}

async function waitForCameraSettled(
  page: Page,
  options: {
    readonly timeoutMs?: number
    readonly sampleIntervalMs?: number
    readonly consecutiveSamples?: number
  } = {},
): Promise<CameraSettledResult> {
  const timeoutMs = options.timeoutMs ?? CAMERA_SETTLE_TIMEOUT_MS
  const sampleIntervalMs = options.sampleIntervalMs ?? CAMERA_SETTLE_SAMPLE_INTERVAL_MS
  const requiredConsecutiveSamples =
    options.consecutiveSamples ?? CAMERA_SETTLE_CONSECUTIVE_SAMPLES
  const startedAt = Date.now()
  let previous: CameraOrbitSnapshot | null = null
  let lastSnapshot: CameraOrbitSnapshot | null = null
  let sampleCount = 0
  let validSampleCount = 0
  let consecutiveStableSamples = 0

  while (Date.now() - startedAt < timeoutMs) {
    const current = await readCameraOrbitSnapshot(page)
    sampleCount += 1
    lastSnapshot = current
    if (cameraOrbitSnapshotIsComplete(current)) {
      validSampleCount += 1
      consecutiveStableSamples =
        previous !== null &&
        cameraOrbitSnapshotsEqualWithin(previous, current, CAMERA_SETTLE_TOLERANCE)
          ? consecutiveStableSamples + 1
          : 1
      previous = current
      if (consecutiveStableSamples >= requiredConsecutiveSamples) {
        return {
          status: 'SETTLED',
          elapsedMs: Date.now() - startedAt,
          sampleCount,
          validSampleCount,
          consecutiveStableSamples,
          tolerance: CAMERA_SETTLE_TOLERANCE,
          requiredConsecutiveSamples,
          lastSnapshot,
        }
      }
    } else {
      previous = null
      consecutiveStableSamples = 0
    }
    await new Promise<void>((resolve) => setTimeout(resolve, sampleIntervalMs))
  }

  return {
    status: validSampleCount === 0 ? 'UNAVAILABLE' : 'TIMEOUT',
    elapsedMs: Date.now() - startedAt,
    sampleCount,
    validSampleCount,
    consecutiveStableSamples,
    tolerance: CAMERA_SETTLE_TOLERANCE,
    requiredConsecutiveSamples,
    lastSnapshot,
  }
}

async function exportedSceneWithoutPointerInteraction(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.locator('header .toolbar-button--export').evaluate((element) => {
    if (!(element instanceof HTMLButtonElement))
      throw new Error('Expected the scene export control to be a button.')
    element.click()
  })
  const stream = await (await downloadPromise).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let json = ''
  for await (const chunk of stream) json += chunk.toString()
  return json
}

function fixtureFile(fixture: unknown, name: string) {
  return {
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  }
}

async function loadFixture(page: Page, fixture: unknown, name: string): Promise<string> {
  await openEvidencePage(page)
  await page.locator('input[type="file"]').setInputFiles(fixtureFile(fixture, name))
  await waitForRendererEvidence(page)
  await page.locator('.tab-list button').nth(1).click()
  const target = page
    .locator('.outliner-row')
    .filter({ hasText: 'Performance table 001' })
  await expect(target).toBeVisible()
  await target.click()
  await expect(page.getByTestId('position-x')).toBeVisible()
  const testId = await target.getAttribute('data-testid')
  if (!testId)
    throw new Error('The performance fixture row did not expose a stable test id.')
  return testId.replace('outliner-entity-', '')
}

async function openEvidencePage(page: Page): Promise<RendererRuntimeSnapshot> {
  await page.goto('/?evidence=1')
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  return waitForRendererEvidence(page)
}

async function findInertPointerPoint(page: Page): Promise<Point> {
  return page.evaluate(() => {
    const candidates = [
      [8, 8],
      [window.innerWidth - 8, 8],
      [8, window.innerHeight - 8],
      [window.innerWidth - 8, window.innerHeight - 8],
    ] as const
    for (const [x, y] of candidates) {
      const element = document.elementFromPoint(x, y)
      if (
        !element ||
        element.closest('canvas,button,input,a,select,textarea,[role="button"]')
      )
        continue
      return { x, y }
    }
    return { x: 8, y: 8 }
  })
}

async function waitForPoint(
  readPoint: () => Promise<Point>,
  description: string,
): Promise<Point> {
  let lastError: unknown
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await readPoint()
    } catch (error) {
      lastError = error
      await new Promise<void>((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error(`Timed out locating ${description}: ${String(lastError)}`)
}

function outwardPoint(center: Point, handle: Point, distance: number): Point {
  const dx = handle.x - center.x
  const dy = handle.y - center.y
  const length = Math.hypot(dx, dy) || 1
  return {
    x: handle.x + (dx / length) * distance,
    y: handle.y + (dy / length) * distance,
  }
}

async function waitForAutosave(page: Page, label: string): Promise<EvidenceProbeWindow> {
  await startEvidenceWindow(page, label)
  await expect(page.locator('.save-state')).toHaveClass(/save-state--saved/, {
    timeout: 2_000,
  })
  return stopEvidenceWindow(page)
}

async function settleInteractionWindow(page: Page) {
  const stablePhase = await startEvidencePhase(page, 'stable-frame')
  let stable: Awaited<ReturnType<typeof waitForStableFrames>>
  try {
    stable = await waitForStableFrames(page)
  } finally {
    await endEvidencePhase(page, stablePhase)
  }
  const cleanupPhase = await startEvidencePhase(page, 'autosave-wait')
  try {
    await expect(page.locator('.save-state')).toHaveClass(/save-state--saved/, {
      timeout: 2_000,
    })
  } finally {
    await endEvidencePhase(page, cleanupPhase)
  }
  return stable
}

async function armPointerUpStableFrames(page: Page, required = 2) {
  await page.evaluate((frameCount) => {
    const evidenceWindow = window as typeof window & {
      __pointerUpStableEvidence?: {
        pointerUpAtMs: number
        frameTimesMs: number[]
        elapsedMs: number | null
      }
    }
    evidenceWindow.__pointerUpStableEvidence = {
      pointerUpAtMs: 0,
      frameTimesMs: [],
      elapsedMs: null,
    }
    document.addEventListener(
      'pointerup',
      () => {
        const pointerUpAtMs = performance.now()
        const frameTimesMs: number[] = []
        const frame = (time: number) => {
          frameTimesMs.push(time)
          if (frameTimesMs.length < frameCount) requestAnimationFrame(frame)
          else
            evidenceWindow.__pointerUpStableEvidence = {
              pointerUpAtMs,
              frameTimesMs,
              elapsedMs: time - pointerUpAtMs,
            }
        }
        requestAnimationFrame(frame)
      },
      { capture: true, once: true },
    )
  }, required)
}

async function readPointerUpStableFrames(page: Page) {
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          __pointerUpStableEvidence?: { elapsedMs: number | null }
        }
      ).__pointerUpStableEvidence?.elapsedMs !== null,
  )
  return page.evaluate(() => {
    const evidenceWindow = window as typeof window & {
      __pointerUpStableEvidence?: {
        pointerUpAtMs: number
        frameTimesMs: number[]
        elapsedMs: number | null
      }
    }
    const result = evidenceWindow.__pointerUpStableEvidence
    delete evidenceWindow.__pointerUpStableEvidence
    if (!result || result.elapsedMs === null)
      throw new Error('Pointer-up stable-frame witness was not completed.')
    return result as {
      pointerUpAtMs: number
      frameTimesMs: number[]
      elapsedMs: number
    }
  })
}

function rendererRuntimeObservable(runtime: RendererRuntimeSnapshot) {
  return (
    runtime.available &&
    runtime.renderer !== null &&
    runtime.renderer.lighting.background !== null &&
    runtime.renderer.lighting.lights.length > 0 &&
    runtime.profile !== null &&
    runtime.qualityTier !== null
  )
}

function rendererTierMatches(
  runtime: RendererRuntimeSnapshot,
  tier: PreviewQualityTier,
): boolean {
  const expected = getRendererProfile('preview', tier)
  const renderer = runtime.renderer
  if (!renderer || runtime.profile !== 'preview' || runtime.qualityTier !== tier)
    return false
  const pixelRatioInRange =
    renderer.pixelRatio !== null &&
    renderer.pixelRatio >= expected.dpr[0] - 0.001 &&
    renderer.pixelRatio <= expected.dpr[1] + 0.001
  return (
    renderer.antialias === expected.antialias &&
    renderer.antialias === renderer.configuredAntialias &&
    pixelRatioInRange &&
    JSON.stringify(renderer.configuredDpr) === JSON.stringify(expected.dpr) &&
    renderer.shadowMapType === PCFShadowMap &&
    renderer.shadowMapSizes.includes(expected.shadowMapSize) &&
    renderer.configuredShadowMapSize === expected.shadowMapSize &&
    Math.abs((renderer.toneMappingExposure ?? Number.NaN) - expected.exposure) < 0.001 &&
    Math.abs(renderer.configuredExposure - expected.exposure) < 0.001
  )
}

type ResizeCalibrationCase = {
  readonly handleName:
    'resize-width-handle' | 'resize-depth-handle' | 'resize-height-handle'
  readonly direction: string
  readonly delta: Point
}

type ResizeCalibrationAttempt = {
  readonly handleName: ResizeCalibrationCase['handleName']
  readonly direction: string
  readonly start: Point
  readonly end: Point
  readonly before: ResizeGeometryWitness
  readonly transient: ResizeGeometryWitness
  readonly afterCancel: ResizeGeometryWitness
  readonly counters: Awaited<ReturnType<typeof readRendererEvidenceCounters>>
  readonly handleHit: boolean
  readonly transientGeometryChanged: boolean
  readonly growsSelectedAxis: boolean
  readonly setupStatus: ReturnType<typeof classifyResizeSetup>
}

function objectTransformChanged(
  before: ResizeGeometryWitness,
  after: ResizeGeometryWitness,
) {
  return (
    JSON.stringify(before.position) !== JSON.stringify(after.position) ||
    JSON.stringify(before.scale) !== JSON.stringify(after.scale)
  )
}

async function calibrateResizeHandle(
  page: Page,
  fixture: ReturnType<typeof createPerformanceScene>,
): Promise<{
  readonly attempts: readonly ResizeCalibrationAttempt[]
  readonly readyCase: ResizeCalibrationCase | null
}> {
  const cases: readonly ResizeCalibrationCase[] = [
    { handleName: 'resize-width-handle', direction: 'screen+x', delta: { x: 2, y: 0 } },
    { handleName: 'resize-width-handle', direction: 'screen-x', delta: { x: -2, y: 0 } },
    { handleName: 'resize-width-handle', direction: 'screen+y', delta: { x: 0, y: 2 } },
    { handleName: 'resize-width-handle', direction: 'screen-y', delta: { x: 0, y: -2 } },
    { handleName: 'resize-depth-handle', direction: 'screen+x', delta: { x: 2, y: 0 } },
    { handleName: 'resize-depth-handle', direction: 'screen-x', delta: { x: -2, y: 0 } },
    { handleName: 'resize-depth-handle', direction: 'screen+y', delta: { x: 0, y: 2 } },
    { handleName: 'resize-depth-handle', direction: 'screen-y', delta: { x: 0, y: -2 } },
    { handleName: 'resize-height-handle', direction: 'screen+y', delta: { x: 0, y: 2 } },
    { handleName: 'resize-height-handle', direction: 'screen-y', delta: { x: 0, y: -2 } },
  ]
  const attempts: ResizeCalibrationAttempt[] = []
  for (const [index, calibrationCase] of cases.entries()) {
    const targetId = await loadFixture(
      page,
      fixture,
      `ac-007-resize-calibration-${index + 1}.json`,
    )
    await page.getByTestId('tool-resize').click()
    const start = await waitForPoint(
      () => projectedObjectPoint(page, calibrationCase.handleName),
      calibrationCase.handleName,
    )
    const end = {
      x: start.x + calibrationCase.delta.x,
      y: start.y + calibrationCase.delta.y,
    }
    await resetRendererEvidenceCounters(page)
    const before = await readResizeGeometryWitness(page, targetId)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(
        start.x + (calibrationCase.delta.x * step) / 4,
        start.y + (calibrationCase.delta.y * step) / 4,
      )
    }
    const transient = await readResizeGeometryWitness(page, targetId)
    const counters = await readRendererEvidenceCounters(page)
    const transientGeometryChanged = objectTransformChanged(before, transient)
    const axisIndex =
      calibrationCase.handleName === 'resize-width-handle'
        ? 0
        : calibrationCase.handleName === 'resize-height-handle'
          ? 1
          : 2
    const growsSelectedAxis =
      before.scale !== null &&
      transient.scale !== null &&
      transient.scale[axisIndex] > before.scale[axisIndex]
    const setupStatus = classifyResizeSetup({
      handleHit: counters.interactionBegins > 0,
      interactionUpdates: counters.interactionUpdates,
      transientGeometryChanged,
    })
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel')))
    await page.mouse.up()
    const afterCancel = await readResizeGeometryWitness(page, targetId)
    attempts.push({
      handleName: calibrationCase.handleName,
      direction: calibrationCase.direction,
      start,
      end,
      before,
      transient,
      afterCancel,
      counters,
      handleHit: counters.interactionBegins > 0,
      transientGeometryChanged,
      growsSelectedAxis,
      setupStatus,
    })
    if (setupStatus === 'READY' && growsSelectedAxis)
      return { attempts, readyCase: calibrationCase }
  }
  return { attempts, readyCase: null }
}

async function proveSingleCanonicalCommand(
  page: Page,
  before: string,
  after: string,
): Promise<{
  readonly exact: boolean
  readonly undoEnabled: boolean
  readonly redoEnabled: boolean
  readonly undone: string | null
  readonly redone: string | null
}> {
  const undo = undoButton(page)
  const redo = redoButton(page)
  const undoEnabled = await undo.isEnabled()
  if (!undoEnabled)
    return {
      exact: false,
      undoEnabled,
      redoEnabled: await redo.isEnabled(),
      undone: null,
      redone: null,
    }
  await undo.click()
  const undone = await exportedScene(page)
  const redoEnabled = await redo.isEnabled()
  if (!redoEnabled)
    return { exact: false, undoEnabled, redoEnabled, undone, redone: null }
  await redo.click()
  const redone = await exportedScene(page)
  return {
    exact: undone === before && redone === after,
    undoEnabled,
    redoEnabled,
    undone,
    redone,
  }
}

function longWindowAssessment(probe: EvidenceProbeWindow, durationMs = LONG_WINDOW_MS) {
  return assessFrameWindow(probe, {
    durationMs,
    minimumUpdates: durationMs === PREVIEW_WINDOW_MS ? 600 : 300,
  })
}

async function environment(page: Page, browser: Browser) {
  return collectRuntimeEnvironment(page, browser, VIEWPORT)
}

function diagnosticsFor(
  pageDiagnostics: ReturnType<typeof attachPageDiagnostics>,
  probeDiagnostics: { readonly unhandledRejections: readonly string[] },
) {
  return mergeDiagnostics(pageDiagnostics.diagnostics, probeDiagnostics)
}

function performanceArtifactBase(
  criterion: 'AC-007' | 'AC-008' | 'AC-019',
  run: string,
  status: EvidenceArtifact['status'],
  env: Awaited<ReturnType<typeof environment>>,
  diagnostics: ReturnType<typeof mergeDiagnostics>,
  fixture: unknown,
  entityCount: number,
  viewport = VIEWPORT,
): EvidenceArtifact {
  return {
    schemaVersion: 1,
    criterion,
    run,
    status,
    environment: env,
    fixture: { entityCount, sha256: digestJson(fixture) },
    viewport,
    checks: [],
    counters: {},
    diagnostics,
    notes: [],
  }
}

type ResizeDiagnosticMeasurement = {
  readonly label: string
  readonly updateCount: number
  readonly configuredDurationMs: number
  readonly start: Point
  readonly end: Point
  readonly status: 'PASS' | 'UNRESOLVED'
  readonly checks: readonly EvidenceArtifact['checks'][number][]
  readonly probe: EvidenceProbeWindow
  readonly handlerSummary: ReturnType<typeof summarizeSamples>
  readonly frameSummary: ReturnType<typeof summarizeSamples>
  readonly longTaskSummary: {
    readonly over50Ms: number
    readonly over100Ms: number
    readonly maxMs: number | null
  }
  readonly phaseDurationsMs: {
    readonly pointerdown: number | null
    readonly pointermoveWindow: number | null
    readonly commit: number | null
  }
  readonly longTasksByPhase: {
    readonly pointerdown: ReturnType<typeof longTasksOverlappingPhases>
    readonly commit: ReturnType<typeof longTasksOverlappingPhases>
  }
  readonly counters: Awaited<ReturnType<typeof readRendererEvidenceCounters>>
  readonly finalCounters: Awaited<ReturnType<typeof readRendererEvidenceCounters>>
  readonly canonicalCommandWitness: {
    readonly exact: boolean
    readonly undoEnabled: boolean
    readonly redoEnabled: boolean
    readonly beforeDigest: string
    readonly afterDigest: string
    readonly undoneDigest: string | null
    readonly redoneDigest: string | null
  }
  readonly strictTransientWitness: {
    readonly before: ResizeGeometryWitness
    readonly beforePointerUp: ResizeGeometryWitness | null
    readonly changed: boolean
  }
  readonly stableFrameWitness: Awaited<ReturnType<typeof settleInteractionWindow>>
  readonly autosave: {
    readonly writes: number
    readonly storageWrites: EvidenceProbeWindow['storageWrites']
    readonly saveStatusTransitions: EvidenceProbeWindow['saveStatusTransitions']
  }
  readonly rendererAfter: RendererRuntimeSnapshot
}

function phaseDuration(
  probe: EvidenceProbeWindow,
  phase: 'pointerdown' | 'pointermove-window' | 'pointerup-canonical-commit',
): number | null {
  const durations = probe.phaseSpans
    .filter((span) => span.phase === phase)
    .map((span) => span.durationMs)
  return durations.length > 0 ? Math.max(...durations) : null
}

function diagnosticLongTaskSummary(probe: EvidenceProbeWindow) {
  return {
    over50Ms: probe.longTasks.filter((entry) => entry.durationMs > 50).length,
    over100Ms: probe.longTasks.filter((entry) => entry.durationMs > 100).length,
    maxMs:
      probe.longTasks.length > 0
        ? Math.max(...probe.longTasks.map((entry) => entry.durationMs))
        : null,
  }
}

function compactCanonicalCommandWitness(
  before: string,
  after: string,
  proof: Awaited<ReturnType<typeof proveSingleCanonicalCommand>>,
) {
  return {
    exact: proof.exact,
    undoEnabled: proof.undoEnabled,
    redoEnabled: proof.redoEnabled,
    beforeDigest: digestJson(before),
    afterDigest: digestJson(after),
    undoneDigest: proof.undone === null ? null : digestJson(proof.undone),
    redoneDigest: proof.redone === null ? null : digestJson(proof.redone),
  }
}

async function savedScene(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('home-lab-scene'))
}

async function persistDiagnosticArtifact(
  testInfo: Parameters<typeof persistEvidenceArtifact>[0],
  name: string,
  artifact: unknown,
) {
  const diagnosticsRoot = join(
    resolve(process.cwd()),
    'docs',
    'reports',
    'evidence',
    'diagnostics',
  )
  mkdirSync(diagnosticsRoot, { recursive: true })
  const path = join(diagnosticsRoot, `${name}.json`)
  const body = `${JSON.stringify(artifact, null, 2)}\n`
  writeFileSync(path, body, 'utf8')
  await testInfo.attach(`${name}.json`, {
    body: Buffer.from(body),
    contentType: 'application/json',
  })
  return path
}

async function runResizeDiagnosticMeasurement(
  page: Page,
  targetId: string,
  start: Point,
  end: Point,
  updateCount: number,
  label: string,
): Promise<ResizeDiagnosticMeasurement> {
  const before = await exportedScene(page)
  await page.mouse.move(start.x, start.y)
  await resetRendererEvidenceCounters(page)
  const strictBefore = await readResizeGeometryWitness(page, targetId)
  let strictTransient: ResizeGeometryWitness | null = null
  await startEvidenceWindow(page, label)
  await dragForWindow(page, start, end, LONG_WINDOW_MS, updateCount, true, async () => {
    strictTransient = await readResizeGeometryWitness(page, targetId)
  })
  const stable = await settleInteractionWindow(page)
  const probe = await stopEvidenceWindow(page)
  const counters = await readRendererEvidenceCounters(page)
  const after = await exportedScene(page)
  const proof = await proveSingleCanonicalCommand(page, before, after)
  const finalCounters = await readRendererEvidenceCounters(page)
  const rendererAfter = await readRendererRuntime(page)
  const autosaveWrites = probe.storageWrites.filter(
    (write) => write.key === 'home-lab-scene',
  ).length
  const strictTransientChanged =
    strictTransient !== null && objectTransformChanged(strictBefore, strictTransient)
  const checks: EvidenceArtifact['checks'] = [
    {
      name: 'configured-five-second-window',
      passed: probe.durationMs >= LONG_WINDOW_MS,
      observed: probe.durationMs,
      threshold: LONG_WINDOW_MS,
    },
    {
      name: 'observed-exact-pointermove-count',
      passed: (probe.eventCounts.pointermove ?? 0) === updateCount,
      observed: probe.eventCounts.pointermove ?? 0,
      threshold: updateCount,
    },
    {
      name: 'single-pointerdown-boundary',
      passed: (probe.eventCounts.pointerdown ?? 0) === 1,
      observed: probe.eventCounts.pointerdown ?? 0,
      threshold: 1,
    },
    {
      name: 'single-pointerup-commit-boundary',
      passed: (probe.eventCounts.pointerup ?? 0) === 1,
      observed: probe.eventCounts.pointerup ?? 0,
      threshold: 1,
    },
    {
      name: 'transient-production-resize-witness',
      passed: strictTransientChanged,
      observed: strictTransientChanged ? 'changed' : 'unchanged',
      threshold: 'changed',
    },
    {
      name: 'exactly-one-canonical-command',
      passed: proof.exact && counters.canonicalCommands === 1,
      observed: counters.canonicalCommands,
      threshold: 1,
    },
    {
      name: 'canonical-scene-changed-after-commit',
      passed: after !== before,
      observed: after !== before ? 'changed' : 'unchanged',
      threshold: 'changed',
    },
    {
      name: 'stable-frame-witness-after-pointer-up',
      passed: stable.stableFrameCount >= 2,
      observed: stable.stableFrameCount,
      threshold: 2,
    },
    {
      name: 'exactly-one-autosave-storage-write',
      passed: autosaveWrites === 1,
      observed: autosaveWrites,
      threshold: 1,
    },
  ]
  return {
    label,
    updateCount,
    configuredDurationMs: LONG_WINDOW_MS,
    start,
    end,
    status: checks.every((check) => check.passed) ? 'PASS' : 'UNRESOLVED',
    checks,
    probe,
    handlerSummary: summarizeSamples(
      probe.handlerDurations.map((sample) => sample.durationMs),
    ),
    frameSummary: summarizeSamples(probe.frameIntervals),
    longTaskSummary: diagnosticLongTaskSummary(probe),
    phaseDurationsMs: {
      pointerdown: phaseDuration(probe, 'pointerdown'),
      pointermoveWindow: phaseDuration(probe, 'pointermove-window'),
      commit: phaseDuration(probe, 'pointerup-canonical-commit'),
    },
    longTasksByPhase: {
      pointerdown: longTasksOverlappingPhases(probe.longTaskAttributions, [
        'pointerdown',
      ]),
      commit: longTasksOverlappingPhases(probe.longTaskAttributions, [
        'pointerup-canonical-commit',
      ]),
    },
    counters,
    finalCounters,
    canonicalCommandWitness: compactCanonicalCommandWitness(before, after, proof),
    strictTransientWitness: {
      before: strictBefore,
      beforePointerUp: strictTransient,
      changed: strictTransientChanged,
    },
    stableFrameWitness: stable,
    autosave: {
      writes: autosaveWrites,
      storageWrites: probe.storageWrites,
      saveStatusTransitions: probe.saveStatusTransitions,
    },
    rendererAfter,
  }
}

type ResizeDiagnosticWarmup = {
  readonly probe: EvidenceProbeWindow
  readonly status: 'PASS' | 'UNRESOLVED'
  readonly checks: readonly EvidenceArtifact['checks'][number][]
  readonly beforeCanonicalDigest: string
  readonly afterCanonicalDigest: string
  readonly beforeSavedDigest: string | null
  readonly afterSavedDigest: string | null
  readonly beforeGeometry: ResizeGeometryWitness
  readonly duringGeometry: ResizeGeometryWitness
  readonly afterGeometry: ResizeGeometryWitness
  readonly counters: Awaited<ReturnType<typeof readRendererEvidenceCounters>>
  readonly longTasksByPhase: {
    readonly pointerdown: ReturnType<typeof longTasksOverlappingPhases>
  }
}

function longTasksRetainedInPreWindow(
  warmupLongTasks: readonly EvidenceProbeWindow['longTasks'][number][],
  preWindowLongTasks: readonly EvidenceProbeWindow['preWindowLongTasks'][number][],
) {
  const remaining = [...preWindowLongTasks]
  return warmupLongTasks.every((warmupTask) => {
    const matchIndex = remaining.findIndex(
      (candidate) =>
        candidate.name === warmupTask.name &&
        candidate.durationMs === warmupTask.durationMs,
    )
    if (matchIndex < 0) return false
    remaining.splice(matchIndex, 1)
    return true
  })
}

async function runCancelledResizeWarmup(
  page: Page,
  targetId: string,
  start: Point,
  end: Point,
): Promise<ResizeDiagnosticWarmup> {
  const beforeCanonical = await exportedScene(page)
  const beforeSaved = await savedScene(page)
  await resetRendererEvidenceCounters(page)
  const beforeGeometry = await readResizeGeometryWitness(page, targetId)
  await page.mouse.move(start.x, start.y)
  await startEvidenceWindow(page, 'ac-007-resize-diagnostic-warmup')
  const pointerDownPhase = await startEvidencePhase(page, 'pointerdown')
  try {
    await page.mouse.down()
  } finally {
    await endEvidencePhase(page, pointerDownPhase)
  }
  const pointerMovePhase = await startEvidencePhase(page, 'pointermove-window')
  try {
    for (let index = 1; index <= WARMUP_UPDATE_COUNT; index += 1) {
      const progress = index / WARMUP_UPDATE_COUNT
      await page.mouse.move(
        start.x + (end.x - start.x) * progress,
        start.y + (end.y - start.y) * progress,
      )
    }
  } finally {
    await endEvidencePhase(page, pointerMovePhase)
  }
  const duringGeometry = await readResizeGeometryWitness(page, targetId)
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })),
  )
  await page.mouse.up()
  const stablePhase = await startEvidencePhase(page, 'stable-frame')
  try {
    await waitForStableFrames(page)
  } finally {
    await endEvidencePhase(page, stablePhase)
  }
  const autosavePhase = await startEvidencePhase(page, 'autosave-wait')
  try {
    await expect(page.locator('.save-state')).toHaveClass(/save-state--saved/, {
      timeout: 2_000,
    })
  } finally {
    await endEvidencePhase(page, autosavePhase)
  }
  const probe = await stopEvidenceWindow(page)
  const counters = await readRendererEvidenceCounters(page)
  const afterCanonical = await exportedScene(page)
  const afterSaved = await savedScene(page)
  const afterGeometry = await readResizeGeometryWitness(page, targetId)
  const checks: EvidenceArtifact['checks'] = [
    {
      name: 'warmup-transient-production-resize-witness',
      passed: objectTransformChanged(beforeGeometry, duringGeometry),
      observed: objectTransformChanged(beforeGeometry, duringGeometry)
        ? 'changed'
        : 'unchanged',
      threshold: 'changed',
    },
    {
      name: 'warmup-cancel-restores-renderer-geometry',
      passed: !objectTransformChanged(beforeGeometry, afterGeometry),
      observed: objectTransformChanged(beforeGeometry, afterGeometry)
        ? 'changed'
        : 'unchanged',
      threshold: 'unchanged',
    },
    {
      name: 'warmup-canonical-command-count',
      passed: counters.canonicalCommands === 0,
      observed: counters.canonicalCommands,
      threshold: 0,
    },
    {
      name: 'warmup-canonical-scene-unchanged',
      passed: beforeCanonical === afterCanonical,
      observed: beforeCanonical === afterCanonical ? 'unchanged' : 'changed',
      threshold: 'unchanged',
    },
    {
      name: 'warmup-history-unchanged',
      passed: counters.history.undo === 0 && counters.history.redo === 0,
      observed: `${counters.history.undo}/${counters.history.redo}`,
      threshold: '0/0',
    },
    {
      name: 'warmup-autosave-storage-writes',
      passed:
        probe.storageWrites.filter((write) => write.key === 'home-lab-scene').length ===
        0,
      observed: probe.storageWrites.filter((write) => write.key === 'home-lab-scene')
        .length,
      threshold: 0,
    },
    {
      name: 'warmup-saved-scene-unchanged',
      passed: beforeSaved === afterSaved,
      observed: beforeSaved === afterSaved ? 'unchanged' : 'changed',
      threshold: 'unchanged',
    },
  ]
  return {
    probe,
    status: checks.every((check) => check.passed) ? 'PASS' : 'UNRESOLVED',
    checks,
    beforeCanonicalDigest: digestJson(beforeCanonical),
    afterCanonicalDigest: digestJson(afterCanonical),
    beforeSavedDigest: beforeSaved === null ? null : digestJson(beforeSaved),
    afterSavedDigest: afterSaved === null ? null : digestJson(afterSaved),
    beforeGeometry,
    duringGeometry,
    afterGeometry,
    counters,
    longTasksByPhase: {
      pointerdown: longTasksOverlappingPhases(probe.longTaskAttributions, [
        'pointerdown',
      ]),
    },
  }
}

function maxLongTaskDuration(
  attributions: ReturnType<typeof longTasksOverlappingPhases>,
): number | null {
  const durations = attributions.map((attribution) => attribution.task.durationMs)
  return durations.length > 0 ? Math.max(...durations) : null
}

function prefixedChecks(
  prefix: string,
  checks: readonly EvidenceArtifact['checks'][number][],
) {
  return checks.map((check) => ({ ...check, name: `${prefix}:${check.name}` }))
}

test('AC-007 resize diagnostic A compares 360 updates with one update', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000)
  const summaryPath = join(
    resolve(process.cwd()),
    'docs',
    'reports',
    'evidence',
    'verification-summary.json',
  )
  const summaryBefore = readExistingEvidenceFile(summaryPath)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  const calibration = await calibrateResizeHandle(page, fixture)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  if (!calibration.readyCase) {
    const summaryAfter = readExistingEvidenceFile(summaryPath)
    await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-1-update', {
      schemaVersion: 1,
      criterion: 'AC-007',
      diagnostic: 'A',
      run: 'resize-diagnostic-1-update',
      status: 'UNRESOLVED',
      environment: await environment(page, browser),
      fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
      viewport: VIEWPORT,
      configuration: {
        durationMs: LONG_WINDOW_MS,
        updateCounts: [LONG_UPDATE_COUNT, SINGLE_UPDATE_COUNT],
      },
      calibration,
      measurements: null,
      checks: [
        {
          name: 'resize-calibration-real-transient-change',
          passed: false,
          observed: 'no ready handle',
          threshold: 'ready handle',
        },
      ],
      diagnostics,
      summaryProjection: {
        summaryPath: 'docs/reports/evidence/verification-summary.json',
        beforeDigest: digestJson(summaryBefore),
        afterDigest: digestJson(summaryAfter),
        unchanged: summaryBefore === summaryAfter,
      },
      hypothesisUpdate: {
        updateCountDependence: 'UNRESOLVED',
        causalConclusion: 'UNRESOLVED',
      },
      notes: [
        'Calibration did not prove a real production resize; no performance window was run.',
        'Diagnostic artifacts are written outside the normal raw/summary projection.',
      ],
    })
    return
  }

  const baselineTargetId = await loadFixture(
    page,
    fixture,
    'ac-007-resize-diagnostic-360-update.json',
  )
  await page.getByTestId('tool-resize').click()
  const baselineStart = await waitForPoint(
    () => projectedObjectPoint(page, calibration.readyCase!.handleName),
    calibration.readyCase.handleName,
  )
  const baselineEnd = {
    x: baselineStart.x + calibration.readyCase.delta.x,
    y: baselineStart.y + calibration.readyCase.delta.y,
  }
  const baseline = await runResizeDiagnosticMeasurement(
    page,
    baselineTargetId,
    baselineStart,
    baselineEnd,
    LONG_UPDATE_COUNT,
    'ac-007-resize-diagnostic-360-updates',
  )

  const singleTargetId = await loadFixture(
    page,
    fixture,
    'ac-007-resize-diagnostic-1-update.json',
  )
  await page.getByTestId('tool-resize').click()
  const singleStart = await waitForPoint(
    () => projectedObjectPoint(page, calibration.readyCase!.handleName),
    calibration.readyCase.handleName,
  )
  const singleEnd = {
    x: singleStart.x + calibration.readyCase.delta.x,
    y: singleStart.y + calibration.readyCase.delta.y,
  }
  const single = await runResizeDiagnosticMeasurement(
    page,
    singleTargetId,
    singleStart,
    singleEnd,
    SINGLE_UPDATE_COUNT,
    'ac-007-resize-diagnostic-1-update',
  )
  const summaryAfter = readExistingEvidenceFile(summaryPath)
  const summaryUnchanged = summaryBefore === summaryAfter
  const baselinePointerdownLongTaskMs = maxLongTaskDuration(
    baseline.longTasksByPhase.pointerdown,
  )
  const singlePointerdownLongTaskMs = maxLongTaskDuration(
    single.longTasksByPhase.pointerdown,
  )
  const checks = [
    ...prefixedChecks('360', baseline.checks),
    ...prefixedChecks('1', single.checks),
    {
      name: 'diagnostic-summary-not-projected',
      passed: summaryUnchanged,
      observed: summaryUnchanged ? 'unchanged' : 'changed',
      threshold: 'unchanged',
    },
  ]
  await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-1-update', {
    schemaVersion: 1,
    criterion: 'AC-007',
    diagnostic: 'A',
    run: 'resize-diagnostic-1-update',
    status:
      checks.every((check) => check.passed) &&
      baseline.status === 'PASS' &&
      single.status === 'PASS'
        ? 'PASS'
        : 'UNRESOLVED',
    environment: await environment(page, browser),
    fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
    viewport: VIEWPORT,
    configuration: {
      durationMs: LONG_WINDOW_MS,
      updateCounts: [LONG_UPDATE_COUNT, SINGLE_UPDATE_COUNT],
      changedVariable: 'pointermove count only',
    },
    calibration,
    measurements: { updates360: baseline, update1: single },
    checks,
    diagnostics: diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page)),
    summaryProjection: {
      summaryPath: 'docs/reports/evidence/verification-summary.json',
      beforeDigest: digestJson(summaryBefore),
      afterDigest: digestJson(summaryAfter),
      unchanged: summaryUnchanged,
    },
    hypothesisUpdate: {
      pointerdownLongTaskMs: {
        updates360: baselinePointerdownLongTaskMs,
        update1: singlePointerdownLongTaskMs,
        retainedInOneUpdate: singlePointerdownLongTaskMs !== null,
      },
      updateCountDependence:
        baselinePointerdownLongTaskMs !== null && singlePointerdownLongTaskMs !== null
          ? 'REFUTED'
          : 'UNRESOLVED',
      commitPhaseMs: {
        updates360: baseline.phaseDurationsMs.commit,
        update1: single.phaseDurationsMs.commit,
        differenceOneMinus360Ms:
          baseline.phaseDurationsMs.commit === null ||
          single.phaseDurationsMs.commit === null
            ? null
            : single.phaseDurationsMs.commit - baseline.phaseDurationsMs.commit,
      },
      causalConclusion: 'UNRESOLVED',
    },
    notes: [
      'Both windows use the same 100-entity fixture, calibrated production resize handle, headed Chromium, observer, and five-second duration.',
      'Handler/frame samples, phase spans, raw Long Tasks, canonical command witness, and autosave writes are retained per measurement.',
      'No CDP trace is generated; this artifact is not projected into verification-summary.json.',
    ],
  })
})

test('AC-007 resize diagnostic B compares a cancelled warm-up with the 360-update window', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000)
  const summaryPath = join(
    resolve(process.cwd()),
    'docs',
    'reports',
    'evidence',
    'verification-summary.json',
  )
  const summaryBefore = readExistingEvidenceFile(summaryPath)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  const calibration = await calibrateResizeHandle(page, fixture)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  if (!calibration.readyCase) {
    const summaryAfter = readExistingEvidenceFile(summaryPath)
    await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-warmup', {
      schemaVersion: 1,
      criterion: 'AC-007',
      diagnostic: 'B',
      run: 'resize-diagnostic-warmup',
      status: 'UNRESOLVED',
      environment: await environment(page, browser),
      fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
      viewport: VIEWPORT,
      configuration: { durationMs: LONG_WINDOW_MS, updateCount: LONG_UPDATE_COUNT },
      calibration,
      warmup: null,
      mainMeasurement: null,
      checks: [
        {
          name: 'resize-calibration-real-transient-change',
          passed: false,
          observed: 'no ready handle',
          threshold: 'ready handle',
        },
      ],
      diagnostics,
      summaryProjection: {
        summaryPath: 'docs/reports/evidence/verification-summary.json',
        beforeDigest: digestJson(summaryBefore),
        afterDigest: digestJson(summaryAfter),
        unchanged: summaryBefore === summaryAfter,
      },
      hypothesisUpdate: { initialCost: 'UNRESOLVED', causalConclusion: 'UNRESOLVED' },
      notes: [
        'Calibration did not prove a real production resize; no warm-up or performance window was run.',
        'Diagnostic artifacts are written outside the normal raw/summary projection.',
      ],
    })
    return
  }

  const targetId = await loadFixture(
    page,
    fixture,
    'ac-007-resize-diagnostic-warmup.json',
  )
  await page.getByTestId('tool-resize').click()
  const start = await waitForPoint(
    () => projectedObjectPoint(page, calibration.readyCase!.handleName),
    calibration.readyCase.handleName,
  )
  const end = {
    x: start.x + calibration.readyCase.delta.x,
    y: start.y + calibration.readyCase.delta.y,
  }
  const warmup = await runCancelledResizeWarmup(page, targetId, start, end)
  const mainStart = await waitForPoint(
    () => projectedObjectPoint(page, calibration.readyCase!.handleName),
    calibration.readyCase.handleName,
  )
  const mainEnd = {
    x: mainStart.x + calibration.readyCase.delta.x,
    y: mainStart.y + calibration.readyCase.delta.y,
  }
  const mainMeasurement = await runResizeDiagnosticMeasurement(
    page,
    targetId,
    mainStart,
    mainEnd,
    LONG_UPDATE_COUNT,
    'ac-007-resize-diagnostic-warmup-360-updates',
  )
  const summaryAfter = readExistingEvidenceFile(summaryPath)
  const summaryUnchanged = summaryBefore === summaryAfter
  const retainedWarmupLongTasks = longTasksRetainedInPreWindow(
    warmup.probe.longTasks,
    mainMeasurement.probe.preWindowLongTasks,
  )
  const warmupStateUnchanged = warmup.checks.every((check) => check.passed)
  const warmupPointerdownLongTaskMs = maxLongTaskDuration(
    warmup.longTasksByPhase.pointerdown,
  )
  const mainPointerdownLongTaskMs = maxLongTaskDuration(
    mainMeasurement.longTasksByPhase.pointerdown,
  )
  const initialCostSupported =
    warmup.probe.longTasks.length > 0 &&
    retainedWarmupLongTasks &&
    warmupPointerdownLongTaskMs !== null &&
    mainPointerdownLongTaskMs === null &&
    warmupStateUnchanged
  const checks = [
    ...prefixedChecks('warmup', warmup.checks),
    ...prefixedChecks('main', mainMeasurement.checks),
    {
      name: 'warmup-long-task-retained-in-main-pre-window',
      passed: retainedWarmupLongTasks,
      observed: retainedWarmupLongTasks ? 'retained' : 'not-retained',
      threshold: 'retained',
    },
    {
      name: 'diagnostic-summary-not-projected',
      passed: summaryUnchanged,
      observed: summaryUnchanged ? 'unchanged' : 'changed',
      threshold: 'unchanged',
    },
  ]
  await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-warmup', {
    schemaVersion: 1,
    criterion: 'AC-007',
    diagnostic: 'B',
    run: 'resize-diagnostic-warmup',
    status:
      checks.every((check) => check.passed) && mainMeasurement.status === 'PASS'
        ? 'PASS'
        : 'UNRESOLVED',
    environment: await environment(page, browser),
    fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
    viewport: VIEWPORT,
    configuration: {
      durationMs: LONG_WINDOW_MS,
      updateCount: LONG_UPDATE_COUNT,
      warmupUpdateCount: WARMUP_UPDATE_COUNT,
      changedVariable: 'cancelled warm-up presence only',
    },
    calibration,
    warmup,
    mainMeasurement,
    checks,
    diagnostics: diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page)),
    summaryProjection: {
      summaryPath: 'docs/reports/evidence/verification-summary.json',
      beforeDigest: digestJson(summaryBefore),
      afterDigest: digestJson(summaryAfter),
      unchanged: summaryUnchanged,
    },
    hypothesisUpdate: {
      warmupLongTaskCount: warmup.probe.longTasks.length,
      mainPreWindowLongTaskCount: mainMeasurement.probe.preWindowLongTasks.length,
      retainedWarmupLongTasks: retainedWarmupLongTasks,
      warmupStateUnchanged,
      pointerdownLongTaskMs: {
        warmup: warmupPointerdownLongTaskMs,
        mainMeasurement: mainPointerdownLongTaskMs,
      },
      initialCost: initialCostSupported ? 'SUPPORTED' : 'UNRESOLVED',
      commitPhaseMs: mainMeasurement.phaseDurationsMs.commit,
      causalConclusion: 'UNRESOLVED',
    },
    notes: [
      'The fixed warm-up uses the same calibrated production resize handle, transient movement, and cancellation path before the 360-update five-second measurement.',
      'Warm-up Long Tasks are retained both in the warm-up probe and the main probe preWindowLongTasks; canonical/history/autosave witnesses are retained.',
      'No CDP trace is generated; this artifact is not projected into verification-summary.json.',
    ],
  })
})

test('AC-007 resize diagnostic C measures the first resize in a fresh context with one update', async ({
  page: calibrationPage,
  browser,
}, testInfo) => {
  test.setTimeout(150_000)
  const summaryPath = join(
    resolve(process.cwd()),
    'docs',
    'reports',
    'evidence',
    'verification-summary.json',
  )
  const summaryBefore = readExistingEvidenceFile(summaryPath)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)

  const calibrationPageDiagnostics = attachPageDiagnostics(calibrationPage)
  await installEvidenceProbe(calibrationPage)
  const calibration = await calibrateResizeHandle(calibrationPage, fixture)
  if (!calibration.readyCase) {
    const summaryAfter = readExistingEvidenceFile(summaryPath)
    await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-fresh-1-update', {
      schemaVersion: 1,
      criterion: 'AC-007',
      diagnostic: 'C',
      run: 'resize-diagnostic-fresh-1-update',
      status: 'UNRESOLVED',
      environment: await environment(calibrationPage, browser),
      fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
      viewport: VIEWPORT,
      configuration: {
        durationMs: LONG_WINDOW_MS,
        updateCount: SINGLE_UPDATE_COUNT,
        explicitResizeWarmup: false,
        measurementContext: 'not-created-because-calibration-failed',
      },
      calibration,
      measurement: null,
      checks: [
        {
          name: 'resize-calibration-real-transient-change',
          passed: false,
          observed: 'no ready handle',
          threshold: 'ready handle',
        },
      ],
      diagnostics: {
        calibration: diagnosticsFor(
          calibrationPageDiagnostics,
          await readProbeDiagnostics(calibrationPage),
        ),
        measurement: null,
      },
      summaryProjection: {
        summaryPath: 'docs/reports/evidence/verification-summary.json',
        beforeDigest: digestJson(summaryBefore),
        afterDigest: digestJson(summaryAfter),
        unchanged: summaryBefore === summaryAfter,
      },
      hypothesisUpdate: {
        pointerdownLongTaskMs: null,
        updateCountDependence: 'UNRESOLVED',
        initialOrLazySetupCost: 'UNRESOLVED',
        residualExplanation: 'calibration-failed',
        causalConclusion: 'UNRESOLVED',
      },
      notes: [
        'Calibration did not prove a real production resize; the fresh measurement context was not created.',
        'No CDP trace is generated; this artifact is not projected into verification-summary.json.',
      ],
    })
    return
  }

  const measurementContext = await browser.newContext({ viewport: VIEWPORT })
  const measurementPage = await measurementContext.newPage()
  const measurementPageDiagnostics = attachPageDiagnostics(measurementPage)
  await installEvidenceProbe(measurementPage)
  try {
    const targetId = await loadFixture(
      measurementPage,
      fixture,
      'ac-007-resize-diagnostic-fresh-1-update.json',
    )
    await measurementPage.getByTestId('tool-resize').click()
    const start = await waitForPoint(
      () => projectedObjectPoint(measurementPage, calibration.readyCase!.handleName),
      calibration.readyCase.handleName,
    )
    const end = {
      x: start.x + calibration.readyCase.delta.x,
      y: start.y + calibration.readyCase.delta.y,
    }
    const measurement = await runResizeDiagnosticMeasurement(
      measurementPage,
      targetId,
      start,
      end,
      SINGLE_UPDATE_COUNT,
      'ac-007-resize-diagnostic-fresh-1-update',
    )
    const summaryAfter = readExistingEvidenceFile(summaryPath)
    const summaryUnchanged = summaryBefore === summaryAfter
    const pointerdownLongTaskMs = maxLongTaskDuration(
      measurement.longTasksByPhase.pointerdown,
    )
    const pointerdownOver100Ms =
      pointerdownLongTaskMs !== null && pointerdownLongTaskMs > 100
    const checks = [
      ...prefixedChecks('fresh-1', measurement.checks),
      {
        name: 'fresh-measurement-context-separated-from-calibration',
        passed: measurementPage.context() !== calibrationPage.context(),
        observed:
          measurementPage.context() !== calibrationPage.context() ? 'separate' : 'shared',
        threshold: 'separate',
      },
      {
        name: 'no-explicit-resize-warmup-in-measurement-context',
        passed: true,
        observed: 0,
        threshold: 0,
      },
      {
        name: 'diagnostic-summary-not-projected',
        passed: summaryUnchanged,
        observed: summaryUnchanged ? 'unchanged' : 'changed',
        threshold: 'unchanged',
      },
    ]
    await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-fresh-1-update', {
      schemaVersion: 1,
      criterion: 'AC-007',
      diagnostic: 'C',
      run: 'resize-diagnostic-fresh-1-update',
      status:
        checks.every((check) => check.passed) && measurement.status === 'PASS'
          ? 'PASS'
          : 'UNRESOLVED',
      environment: await environment(measurementPage, browser),
      fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
      viewport: VIEWPORT,
      configuration: {
        durationMs: LONG_WINDOW_MS,
        updateCount: SINGLE_UPDATE_COUNT,
        changedVariable: 'fresh browser context and run order',
        explicitResizeWarmup: false,
        observerInstalledBeforeNavigation: true,
        calibrationContextSeparatedFromMeasurementContext: true,
      },
      calibration,
      measurement,
      longTaskClassification: {
        inWindow: measurement.probe.longTasks.map((task) => ({
          ...task,
          windowClassification: 'in-window',
        })),
        preWindow: measurement.probe.preWindowLongTasks.map((task) => ({
          ...task,
          windowClassification: 'pre-window',
        })),
        pointerdownPhase: measurement.longTasksByPhase.pointerdown,
        commitPhase: measurement.longTasksByPhase.commit,
      },
      checks,
      diagnostics: {
        calibration: diagnosticsFor(
          calibrationPageDiagnostics,
          await readProbeDiagnostics(calibrationPage),
        ),
        measurement: diagnosticsFor(
          measurementPageDiagnostics,
          await readProbeDiagnostics(measurementPage),
        ),
      },
      summaryProjection: {
        summaryPath: 'docs/reports/evidence/verification-summary.json',
        beforeDigest: digestJson(summaryBefore),
        afterDigest: digestJson(summaryAfter),
        unchanged: summaryUnchanged,
      },
      hypothesisUpdate: {
        pointerdownLongTaskMs,
        pointerdownOver100Ms,
        updateCountDependence: pointerdownOver100Ms ? 'REFUTED' : 'UNRESOLVED',
        initialOrLazySetupCost: pointerdownOver100Ms
          ? 'STRONGLY_SUPPORTED'
          : 'UNRESOLVED',
        residualExplanation: pointerdownOver100Ms
          ? null
          : 'run-order-or-browser-noise-remains',
        commitPhaseMs: measurement.phaseDurationsMs.commit,
        causalConclusion: 'UNRESOLVED',
      },
      notes: [
        'Calibration ran in the Playwright fixture context; the measured page uses a newly-created context and page.',
        'The observer was installed before the first navigation in the measurement page, and no resize warm-up ran there.',
        'The measured resize emitted exactly one observed pointermove over the same five-second window.',
        'Handler/frame samples, phase spans, Long Task timestamps/durations/classification, canonical command, autosave, and transient geometry witnesses are retained.',
        'No CDP trace is generated; this artifact is not projected into verification-summary.json.',
      ],
    })
  } finally {
    await measurementContext.close()
  }
})

test('AC-007 resize diagnostic D attributes fine grained first resize boundaries', async ({
  page: calibrationPage,
  browser,
}, testInfo) => {
  test.setTimeout(150_000)
  const summaryPath = join(
    resolve(process.cwd()),
    'docs',
    'reports',
    'evidence',
    'verification-summary.json',
  )
  const summaryBefore = readExistingEvidenceFile(summaryPath)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  await installEvidenceProbe(calibrationPage)
  const calibration = await calibrateResizeHandle(calibrationPage, fixture)
  expect(calibration.readyCase).not.toBeNull()

  const measurementContext = await browser.newContext({ viewport: VIEWPORT })
  const measurementPage = await measurementContext.newPage()
  const pageDiagnostics = attachPageDiagnostics(measurementPage)
  await installEvidenceProbe(measurementPage)
  try {
    const targetId = await loadFixture(
      measurementPage,
      fixture,
      'ac-007-resize-diagnostic-fine-grained.json',
    )
    await measurementPage.getByTestId('tool-resize').click()
    const start = await waitForPoint(
      () => projectedObjectPoint(measurementPage, calibration.readyCase!.handleName),
      calibration.readyCase!.handleName,
    )
    const end = {
      x: start.x + calibration.readyCase!.delta.x,
      y: start.y + calibration.readyCase!.delta.y,
    }
    const measurement = await runResizeDiagnosticMeasurement(
      measurementPage,
      targetId,
      start,
      end,
      SINGLE_UPDATE_COUNT,
      'ac-007-resize-diagnostic-fine-grained',
    )
    const fineGrainedSpans = measurement.probe.phaseSpans.filter((span) =>
      span.phase.startsWith('resize-'),
    )
    const requiredPhases = [
      'resize-pointerdown-app-handler',
      'resize-controller-start',
      'resize-transaction',
      'resize-begin-publish',
      'resize-pointerdown-handler-return-to-layout',
      'resize-pointerdown-layout-to-first-render',
      'resize-pointerdown-first-render',
      'resize-commit-app-handler',
      'resize-controller-commit',
      'resize-history',
      'resize-autosave-schedule',
      'resize-commit-publish',
      'resize-commit-handler-return-to-layout',
      'resize-commit-layout-to-first-render',
      'resize-commit-first-render',
    ] as const
    const missingPhases = requiredPhases.filter(
      (phase) => !fineGrainedSpans.some((span) => span.phase === phase),
    )
    const commitHandler = fineGrainedSpans.find(
      (span) => span.phase === 'resize-commit-app-handler',
    )
    const stableFrame = measurement.probe.phaseSpans.find(
      (span) => span.phase === 'stable-frame',
    )
    const commitHandlerToStableFramesMs =
      commitHandler && stableFrame
        ? {
            toStableWaitStart: stableFrame.startMs - commitHandler.endMs,
            toStableWaitEnd: stableFrame.endMs - commitHandler.endMs,
            stableFrameWitnessElapsed: measurement.stableFrameWitness.elapsedMs,
          }
        : null
    const summaryAfter = readExistingEvidenceFile(summaryPath)
    const summaryUnchanged = summaryBefore === summaryAfter
    const checks = [
      ...prefixedChecks('fine-grained', measurement.checks),
      {
        name: 'all-fine-grained-phases-observed',
        passed: missingPhases.length === 0,
        observed: missingPhases.length,
        threshold: 0,
      },
      {
        name: 'fresh-measurement-context-separated-from-calibration',
        passed: measurementPage.context() !== calibrationPage.context(),
        observed:
          measurementPage.context() !== calibrationPage.context() ? 'separate' : 'shared',
        threshold: 'separate',
      },
      {
        name: 'diagnostic-summary-not-projected',
        passed: summaryUnchanged,
        observed: summaryUnchanged ? 'unchanged' : 'changed',
        threshold: 'unchanged',
      },
    ]
    await persistDiagnosticArtifact(testInfo, 'ac-007-resize-diagnostic-fine-grained', {
      schemaVersion: 1,
      criterion: 'AC-007',
      diagnostic: 'D',
      run: 'resize-diagnostic-fine-grained',
      status:
        checks.every((check) => check.passed) && measurement.status === 'PASS'
          ? 'PASS'
          : 'UNRESOLVED',
      environment: await environment(measurementPage, browser),
      fixture: { entityCount: fixture.entities.length, sha256: digestJson(fixture) },
      viewport: VIEWPORT,
      configuration: {
        durationMs: LONG_WINDOW_MS,
        updateCount: SINGLE_UPDATE_COUNT,
        explicitResizeWarmup: false,
        observerInstalledBeforeNavigation: true,
        fineGrainedInstrumentation: 'evidence probe active window only; one resize',
      },
      calibration,
      measurement,
      fineGrainedTimeline: {
        spans: fineGrainedSpans,
        missingPhases,
        commitHandlerToStableFramesMs,
        longTaskAttributions: measurement.probe.longTaskAttributions,
      },
      checks,
      diagnostics: diagnosticsFor(
        pageDiagnostics,
        await readProbeDiagnostics(measurementPage),
      ),
      summaryProjection: {
        summaryPath: 'docs/reports/evidence/verification-summary.json',
        beforeDigest: digestJson(summaryBefore),
        afterDigest: digestJson(summaryAfter),
        unchanged: summaryUnchanged,
      },
      conclusion: {
        attribution: 'UNRESOLVED',
        limitation:
          'Phase overlap separates application boundaries but cannot identify React, R3F, browser event dispatch, JIT, or GC internals.',
      },
      notes: [
        'The measured page is a fresh context/page with no resize warm-up and exactly one pointermove.',
        'Fine-grained phases are emitted only while the evidence probe window is active; the pointermove hot path is unchanged.',
        'No CDP trace is generated; canonical raw and verification-summary are not projected.',
      ],
    })
  } finally {
    await measurementContext.close()
  }
})

test('projects summary status and checks exactly from the raw artifact', () => {
  const checks = [
    { name: 'long-task-count', passed: false, observed: 2, threshold: 1 },
  ] as const
  expect(
    projectEvidenceSummaryRun('ac-007-transform-5s.json', {
      criterion: 'AC-007',
      run: 'transform-5s-300-updates',
      status: 'FAIL',
      checks,
      notes: ['measured failure'],
    }),
  ).toEqual({
    criterion: 'AC-007',
    run: 'transform-5s-300-updates',
    status: 'FAIL',
    rawArtifact: 'docs/reports/evidence/raw/ac-007-transform-5s.json',
    checks,
    handlerSummary: null,
    frameSummary: null,
    longTaskSummary: null,
    notes: ['measured failure'],
  })

  const evidenceRoot = join(process.cwd(), 'docs', 'reports', 'evidence')
  const summaryPath = join(evidenceRoot, 'verification-summary.json')
  const names = [
    'ac-007-resize-5s',
    'ac-007-transform-5s',
    'ac-007-transform-attributed-5s',
    'ac-008-orbit-5s',
    'ac-022-browser-diagnostics',
  ]
  const availableNames = names.filter((name) =>
    existsSync(join(evidenceRoot, 'raw', `${name}.json`)),
  )
  if (!existsSync(summaryPath) || availableNames.length === 0) return

  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    readonly runs: Record<string, { readonly status: string; readonly checks: unknown }>
  }
  for (const name of availableNames) {
    const raw = JSON.parse(
      readFileSync(join(evidenceRoot, 'raw', `${name}.json`), 'utf8'),
    ) as { readonly status: string; readonly checks: unknown }
    expect(summary.runs[name]?.status).toBe(raw.status)
    expect(summary.runs[name]?.checks).toEqual(raw.checks)
  }
})

test('headed evidence bridge is ready and projects a selected renderer object', async ({
  page,
}, testInfo) => {
  const runtime = await openEvidencePage(page)
  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  const selectedId = await page.locator('.inspector-title .muted-copy').textContent()
  if (!selectedId) throw new Error('The readiness desk did not expose an entity id.')
  const point = await waitForPoint(
    () => projectedObjectPoint(page, selectedId),
    `readiness object ${selectedId}`,
  )
  expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
  await testInfo.attach('headed-renderer-readiness.json', {
    body: JSON.stringify({ selectedId, point, runtime }),
    contentType: 'application/json',
  })
})

test('AC-007 transform has a five-second headed raw trace with 300+ updates', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  const targetId = await loadFixture(page, fixture, 'ac-007-transform-100-entity.json')
  await page.getByTestId('tool-move').click()
  const before = await exportedScene(page)
  const center = await waitForPoint(
    () => projectedObjectPoint(page, targetId),
    `selected entity ${targetId}`,
  )
  const handle = await waitForPoint(
    () => projectedTransformHandle(page, 'X'),
    'TransformControls X handle',
  )
  const end = outwardPoint(center, handle, 80)
  const inertPoint = await findInertPointerPoint(page)
  await page.mouse.move(inertPoint.x, inertPoint.y)
  const inertCdpCapture = await startChromiumCdpTrace(page, 'ac-007-transform-inert-cdp')
  await startEvidenceWindow(page, 'ac-007-transform-inert-transport-5s')
  const inertBaseline = await inertPointerMoveTransportBaseline(
    page,
    inertPoint,
    8,
    LONG_WINDOW_MS,
    LONG_UPDATE_COUNT,
  )
  const inertProbe = await stopEvidenceWindow(page)
  const inertCdpTrace = await inertCdpCapture.stop(
    inertProbe.longTasks,
    inertProbe.preWindowLongTasks,
  )
  await page.mouse.move(handle.x, handle.y)
  await resetRendererEvidenceCounters(page)
  const cdpCapture = await startChromiumCdpTrace(page, 'ac-007-transform-cdp')
  await startEvidenceWindow(page, 'ac-007-transform-5s')
  await dragForWindow(page, handle, end, LONG_WINDOW_MS, LONG_UPDATE_COUNT, true)
  const stable = await settleInteractionWindow(page)
  const probe = await stopEvidenceWindow(page)
  const cdpTrace = await cdpCapture.stop(probe.longTasks, probe.preWindowLongTasks)
  const activeSchedule = probe.phaseSpans.find(
    (span) => span.phase === 'pointermove-window',
  )
  const activeScheduleLongTasks = activeSchedule
    ? probe.longTasks.map((task) => ({
        task,
        boundary: classifyLongTaskWindow(
          task,
          activeSchedule.startMs,
          activeSchedule.endMs,
        ),
      }))
    : []
  const interactionCounters = await readRendererEvidenceCounters(page)
  const assessment = longWindowAssessment(probe)
  const after = await exportedScene(page)
  const commandProof = await proveSingleCanonicalCommand(page, before, after)
  const finalCounters = await readRendererEvidenceCounters(page)
  const rendererAfter = await readRendererRuntime(page)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))

  // Diagnostic-only control: repeat the same TransformControls pointerdown/up
  // without moving the pointer. This isolates pointerup/R3F dispatch from the
  // canonical geometry-change path; it is intentionally excluded from AC-007
  // acceptance counters and does not infer causality by itself.
  await page.getByTestId('tool-move').click()
  const targetRow = page.locator(`[data-testid="outliner-entity-${targetId}"]`)
  await expect(targetRow).toBeVisible()
  await targetRow.click()
  const noGeometryHandle = await waitForPoint(
    () => projectedTransformHandle(page, 'X'),
    'TransformControls X handle for no-op pointerup comparison',
  )
  await page.mouse.move(noGeometryHandle.x, noGeometryHandle.y)
  await resetRendererEvidenceCounters(page)
  const noGeometryCdpCapture = await startChromiumCdpTrace(
    page,
    'ac-007-transform-noop-pointerup-cdp',
  )
  await startEvidenceWindow(page, 'ac-007-transform-noop-pointerup')
  const noGeometryDownPhase = await startEvidencePhase(page, 'pointerdown')
  try {
    await page.mouse.down()
  } finally {
    await endEvidencePhase(page, noGeometryDownPhase)
  }
  const noGeometryUpPhase = await startEvidencePhase(page, 'pointerup-canonical-commit')
  try {
    await page.mouse.up()
  } finally {
    await endEvidencePhase(page, noGeometryUpPhase)
  }
  await page.waitForTimeout(250)
  const noGeometryProbe = await stopEvidenceWindow(page)
  const noGeometryCdpTrace = await noGeometryCdpCapture.stop(
    noGeometryProbe.longTasks,
    noGeometryProbe.preWindowLongTasks,
  )
  const noGeometryCounters = await readRendererEvidenceCounters(page)
  const autosaveWrites = probe.storageWrites.filter(
    (write) => write.key === 'home-lab-scene',
  ).length
  const checks = [
    ...assessment.checks,
    {
      name: 'exactly-one-canonical-command-at-commit',
      passed: commandProof.exact && interactionCounters.canonicalCommands === 1,
      observed: interactionCounters.canonicalCommands,
      threshold: 1,
    },
    {
      name: 'single-pointer-up-commit-boundary',
      passed: (probe.eventCounts.pointerup ?? 0) === 1,
      observed: probe.eventCounts.pointerup ?? 0,
      threshold: 1,
    },
    {
      name: 'canonical-scene-changed-after-commit',
      passed: after !== before,
      observed: after !== before ? 'changed' : 'unchanged',
      threshold: 'changed',
    },
    {
      name: 'stable-frame-witness-after-pointer-up',
      passed: stable.stableFrameCount >= 2,
      observed: stable.stableFrameCount,
      threshold: 2,
    },
    {
      name: 'exactly-one-autosave-storage-write',
      passed: autosaveWrites === 1,
      observed: autosaveWrites,
      threshold: 1,
    },
    {
      name: 'inert-transport-baseline-captured',
      passed:
        inertBaseline.updateCount === LONG_UPDATE_COUNT &&
        inertBaseline.elapsedMs >= LONG_WINDOW_MS &&
        inertProbe.durationMs >= LONG_WINDOW_MS,
      observed: {
        requestedUpdates: inertBaseline.updateCount,
        observedPointerMoves: inertProbe.eventCounts.pointermove ?? 0,
        elapsedMs: inertBaseline.elapsedMs,
        observedProbeDurationMs: inertProbe.durationMs,
      },
      threshold: {
        updates: LONG_UPDATE_COUNT,
        durationMs: LONG_WINDOW_MS,
      },
    },
  ]
  const status = checks.every((check) => check.passed) ? 'PASS' : 'FAIL'
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-007',
      'transform-attributed-5s-300-updates',
      status,
      await environment(page, browser),
      diagnostics,
      fixture,
      fixture.entities.length,
    ),
    status,
    probe,
    handlerSummary: assessment.handlerSummary,
    frameSummary: assessment.frameSummary,
    longTaskSummary: assessment.longTaskSummary,
    checks,
    counters: {
      pointerDown: probe.eventCounts.pointerdown ?? 0,
      pointerMoves: probe.eventCounts.pointermove ?? 0,
      pointerUp: probe.eventCounts.pointerup ?? 0,
      canonicalCommandCount: interactionCounters.canonicalCommands,
      canonicalCommandWitness: commandProof,
      storeNotificationCount: interactionCounters.storeNotifications,
      historyCounts: {
        afterCommit: interactionCounters.history,
        afterUndoRedo: finalCounters.history,
        expectedAfterCommit: { undo: 1, redo: 0 },
        expectedAfterUndoRedo: { undo: 1, redo: 0 },
      },
      completeScenePublicationCount: null,
      completeScenePublicationWitness:
        'The public EditorStore snapshot.scene getter clones on every access, so exact canonical complete-scene publication count is not observable through this bridge.',
      autosaveScheduleCount: null,
      autosaveScheduleWitness: probe.saveStatusTransitions,
      autosaveWrites,
      rawPostCommitStorageWrites: probe.storageWrites,
      longTaskAttributions: probe.longTaskAttributions,
      activeScheduleBoundary: {
        phase: activeSchedule,
        longTasks: activeScheduleLongTasks,
      },
      inertTransportBaseline: {
        point: inertPoint,
        requestedDurationMs: LONG_WINDOW_MS,
        requestedUpdateCount: LONG_UPDATE_COUNT,
        elapsedMs: inertBaseline.elapsedMs,
        observedProbeDurationMs: inertProbe.durationMs,
        observedPointerMoves: inertProbe.eventCounts.pointermove ?? 0,
        frameSummary: summarizeSamples(inertProbe.frameIntervals),
        handlerSummary: summarizeSamples(
          inertProbe.handlerDurations.map((sample) => sample.durationMs),
        ),
        longTasks: inertProbe.longTasks,
        preWindowLongTasks: inertProbe.preWindowLongTasks,
        cdpTrace: {
          tracePath: 'docs/reports/evidence/traces/ac-007-transform-inert-cdp.trace',
          attributionPath:
            'docs/reports/evidence/traces/ac-007-transform-inert-cdp.attribution.json',
          traceSizeBytes: inertCdpTrace.traceSizeBytes,
          summary: inertCdpTrace.summary,
        },
      },
      noGeometryPointerup: {
        handle: noGeometryHandle,
        probeDurationMs: noGeometryProbe.durationMs,
        pointerDown: noGeometryProbe.eventCounts.pointerdown ?? 0,
        pointerUp: noGeometryProbe.eventCounts.pointerup ?? 0,
        pointerMoves: noGeometryProbe.eventCounts.pointermove ?? 0,
        longTasks: noGeometryProbe.longTasks,
        phaseSpans: noGeometryProbe.phaseSpans.filter(
          (span) =>
            span.phase === 'pointerdown' ||
            span.phase === 'pointerup-canonical-commit' ||
            span.phase === 'canonical-interaction-update' ||
            span.phase === 'canonical-commit-store-publication',
        ),
        counters: noGeometryCounters,
        cdpTrace: {
          tracePath:
            'docs/reports/evidence/traces/ac-007-transform-noop-pointerup-cdp.trace',
          attributionPath:
            'docs/reports/evidence/traces/ac-007-transform-noop-pointerup-cdp.attribution.json',
          traceSizeBytes: noGeometryCdpTrace.traceSizeBytes,
          summary: noGeometryCdpTrace.summary,
        },
      },
      cdpTrace: {
        tracePath: 'docs/reports/evidence/traces/ac-007-transform-cdp.trace',
        attributionPath:
          'docs/reports/evidence/traces/ac-007-transform-cdp.attribution.json',
        traceSizeBytes: cdpTrace.traceSizeBytes,
        causalConclusion: cdpTrace.summary.causalConclusion,
        causalLimit: cdpTrace.summary.causalLimit,
        attributionMethod: cdpTrace.summary.attributionMethod,
        rendererMainThread: cdpTrace.summary.rendererMainThread,
        gpuProcessIds: cdpTrace.summary.gpuProcessIds,
        warmup: cdpTrace.summary.warmup,
        longTaskAttribution: cdpTrace.summary.longTasks,
      },
      fixtureEntityCount: fixture.entities.length,
    },
    renderer: { final: rendererAfter },
    notes: [
      'Production build was served by Playwright webServer in headed Chromium.',
      'Handler samples are every wrapped pointer listener callback; raw arrays are retained.',
      'Every raw Long Task is retained. CDP attribution reports renderer-main exclusive timeline intervals, GPU-process overlap, and pre-window warm-up separately; it does not claim product causality.',
      'The inert transport baseline uses the same page/context, five-second schedule, and 360 pointer moves; it is diagnostic only and does not assign causality.',
      'Active-schedule Long Task boundary labels compare time intervals only and do not infer application causality.',
      'A same-handle pointerdown/up without geometry movement is retained as a diagnostic comparison; it is not folded into the AC-007 acceptance window or treated as causal proof.',
      'H1, H2, and H3 remain unresolved where the trace cannot causally identify the remaining task duration.',
      'The bridge counter is store notification count, not exact complete-scene publication count.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-007-transform-attributed-5s', artifact)
  expect(artifact.status).toBe('PASS')
})

test('AC-007 resize has a five-second headed raw trace with 300+ updates', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  const calibration = await calibrateResizeHandle(page, fixture)
  if (!calibration.readyCase) {
    const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
    const artifact: EvidenceArtifact = {
      ...performanceArtifactBase(
        'AC-007',
        'resize-setup-calibration',
        'UNRESOLVED',
        await environment(page, browser),
        diagnostics,
        fixture,
        fixture.entities.length,
      ),
      status: 'UNRESOLVED',
      checks: [
        {
          name: 'resize-calibration-real-transient-change',
          passed: false,
          observed: 'no production resize attempt changed entity position or scale',
          threshold: 'transient entity transform or scale change',
        },
      ],
      counters: {
        setupClassification: 'EVIDENCE_SETUP_UNRESOLVED',
        calibrationAttempts: calibration.attempts,
      },
      notes: [
        'No five-second performance window was run because setup calibration did not prove a real resize.',
        'DOM pointermove counts without transient entity transform or scale change are not authoritative resize updates.',
      ],
    }
    await persistEvidenceArtifact(testInfo, 'ac-007-resize-5s', artifact)
    expect(artifact.status).toBe('UNRESOLVED')
    return
  }
  const targetId = await loadFixture(page, fixture, 'ac-007-resize-100-entity.json')
  await page.getByTestId('tool-resize').click()
  const before = await exportedScene(page)
  const handle = await waitForPoint(
    () => projectedObjectPoint(page, calibration.readyCase!.handleName),
    calibration.readyCase.handleName,
  )
  const end = {
    x: handle.x + calibration.readyCase.delta.x,
    y: handle.y + calibration.readyCase.delta.y,
  }
  await page.mouse.move(handle.x, handle.y)
  await resetRendererEvidenceCounters(page)
  const strictBefore = await readResizeGeometryWitness(page, targetId)
  let strictTransient: ResizeGeometryWitness | null = null
  await startEvidenceWindow(page, 'ac-007-resize-5s')
  await dragForWindow(
    page,
    handle,
    end,
    LONG_WINDOW_MS,
    LONG_UPDATE_COUNT,
    true,
    async () => {
      strictTransient = await readResizeGeometryWitness(page, targetId)
    },
  )
  const stable = await settleInteractionWindow(page)
  const probe = await stopEvidenceWindow(page)
  const interactionCounters = await readRendererEvidenceCounters(page)
  const assessment = longWindowAssessment(probe)
  const after = await exportedScene(page)
  const commandProof = await proveSingleCanonicalCommand(page, before, after)
  const finalCounters = await readRendererEvidenceCounters(page)
  const rendererAfter = await readRendererRuntime(page)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const autosaveWrites = probe.storageWrites.filter(
    (write) => write.key === 'home-lab-scene',
  ).length
  const strictTransientGeometryChanged =
    strictTransient !== null && objectTransformChanged(strictBefore, strictTransient)
  const checks = [
    ...assessment.checks,
    {
      name: 'exactly-one-canonical-command-at-commit',
      passed: commandProof.exact && interactionCounters.canonicalCommands === 1,
      observed: interactionCounters.canonicalCommands,
      threshold: 1,
    },
    {
      name: 'single-pointer-up-commit-boundary',
      passed: (probe.eventCounts.pointerup ?? 0) === 1,
      observed: probe.eventCounts.pointerup ?? 0,
      threshold: 1,
    },
    {
      name: 'canonical-scene-changed-after-commit',
      passed: after !== before,
      observed: after !== before ? 'changed' : 'unchanged',
      threshold: 'changed',
    },
    {
      name: 'stable-frame-witness-after-pointer-up',
      passed: stable.stableFrameCount >= 2,
      observed: stable.stableFrameCount,
      threshold: 2,
    },
    {
      name: 'exactly-one-autosave-storage-write',
      passed: autosaveWrites === 1,
      observed: autosaveWrites,
      threshold: 1,
    },
  ]
  const status = !strictTransientGeometryChanged
    ? 'UNRESOLVED'
    : checks.every((check) => check.passed)
      ? 'PASS'
      : 'FAIL'
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-007',
      'resize-5s-300-updates',
      status,
      await environment(page, browser),
      diagnostics,
      fixture,
      fixture.entities.length,
    ),
    status,
    probe,
    handlerSummary: assessment.handlerSummary,
    frameSummary: assessment.frameSummary,
    longTaskSummary: assessment.longTaskSummary,
    checks,
    counters: {
      pointerDown: probe.eventCounts.pointerdown ?? 0,
      pointerMoves: probe.eventCounts.pointermove ?? 0,
      pointerUp: probe.eventCounts.pointerup ?? 0,
      canonicalCommandCount: interactionCounters.canonicalCommands,
      canonicalCommandWitness: commandProof,
      storeNotificationCount: interactionCounters.storeNotifications,
      historyCounts: {
        afterCommit: interactionCounters.history,
        afterUndoRedo: finalCounters.history,
        expectedAfterCommit: { undo: 1, redo: 0 },
        expectedAfterUndoRedo: { undo: 1, redo: 0 },
      },
      completeScenePublicationCount: null,
      completeScenePublicationWitness:
        'The public EditorStore snapshot.scene getter clones on every access, so exact canonical complete-scene publication count is not observable through this bridge.',
      autosaveScheduleCount: null,
      autosaveScheduleWitness: probe.saveStatusTransitions,
      autosaveWrites,
      rawPostCommitStorageWrites: probe.storageWrites,
      longTaskAttributions: probe.longTaskAttributions,
      setupClassification: 'READY',
      calibrationAttempts: calibration.attempts,
      strictTransientWitness: {
        before: strictBefore,
        beforePointerUp: strictTransient,
        changed: strictTransientGeometryChanged,
      },
      fixtureEntityCount: fixture.entities.length,
    },
    renderer: { final: rendererAfter },
    notes: [
      'Resize updates use the production positive width handle and pointer capture path.',
      'Every raw Long Task and raw handler/frame/storage sample is retained; thresholds are unchanged.',
      'A strict-window transient entity transform/scale witness is required before classifying performance; otherwise status is UNRESOLVED.',
      'The bridge counter is store notification count, not exact complete-scene publication count.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-007-resize-5s', artifact)
  if (artifact.status === 'UNRESOLVED') {
    expect(strictTransientGeometryChanged).toBe(false)
  } else {
    expect(artifact.status).toBe('PASS')
  }
})

async function runPairedTransform(
  page: Page,
  fixture: ReturnType<typeof createPerformanceScene>,
  historyCount: number,
  label: string,
) {
  const cdpCapture = await startChromiumCdpTrace(page, `ac-007-transform-${label}-cdp`)
  const targetId = await loadFixture(page, fixture, `ac-007-${label}.json`)
  await page.getByTestId('tool-move').click()
  const nudge = page.locator('.scene-camera-controls button').first()
  for (let index = 0; index < historyCount; index += 1) await nudge.click()
  const before = await exportedScene(page)
  const center = await waitForPoint(
    () => projectedObjectPoint(page, targetId),
    'paired transform entity',
  )
  const handle = await waitForPoint(
    () => projectedTransformHandle(page, 'X'),
    'paired TransformControls X handle',
  )
  const end = outwardPoint(center, handle, 80)
  await page.mouse.move(handle.x, handle.y)
  await startEvidenceWindow(page, `ac-007-transform-${label}`)
  await dragForWindow(page, handle, end, LONG_WINDOW_MS, LONG_UPDATE_COUNT, true)
  const probe = await stopEvidenceWindow(page)
  const cdpTrace = await cdpCapture.stop(probe.longTasks, probe.preWindowLongTasks)
  const assessment = longWindowAssessment(probe)
  const after = await exportedScene(page)
  const postCommitProbe = await waitForAutosave(
    page,
    `ac-007-transform-${label}-autosave`,
  )
  const commandProof = await proveSingleCanonicalCommand(page, before, after)
  const windowDiagnostic = summarizeLongTaskWindow(probe)
  const diagnosticPhases = new Set([
    'pointerdown',
    'pointermove-window',
    'pointerup-canonical-commit',
    'canonical-interaction-begin',
    'canonical-interaction-update',
    'canonical-commit-store-publication',
    'store-notification',
    'render',
  ])
  return {
    probe,
    assessment,
    before,
    after,
    commandProof,
    postCommitProbe,
    cdpTrace,
    windowDiagnostic,
    diagnosticPhaseSpans: probe.phaseSpans.filter((span) =>
      diagnosticPhases.has(span.phase),
    ),
  }
}

test('AC-007 paired transform compares zero-history and 50-history p95', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  const zero = await runPairedTransform(page, fixture, 0, 'zero-history')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const history = await runPairedTransform(page, fixture, 50, '50-history')
  const zeroP95 = zero.assessment.handlerSummary.p95 ?? Infinity
  const historyP95 = history.assessment.handlerSummary.p95 ?? Infinity
  const historyLimit = Math.max(zeroP95 * 1.1, zeroP95 + 0.5)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const pairedChecks = [
    {
      name: 'zero-history-window-pass',
      passed: zero.assessment.status === 'PASS' && zero.commandProof.exact,
      observed: zero.assessment.status,
    },
    {
      name: '50-history-window-pass',
      passed: history.assessment.status === 'PASS' && history.commandProof.exact,
      observed: history.assessment.status,
    },
    {
      name: '50-history-p95-regression-limit',
      passed: historyP95 <= historyLimit,
      observed: historyP95,
      threshold: historyLimit,
    },
  ] as const
  const status = pairedChecks.every((check) => check.passed) ? 'PASS' : 'FAIL'
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-007',
      'paired-transform-zero-vs-50-history',
      status,
      await environment(page, browser),
      diagnostics,
      fixture,
      fixture.entities.length,
    ),
    status,
    probe: zero.probe,
    handlerSummary: zero.assessment.handlerSummary,
    frameSummary: zero.assessment.frameSummary,
    longTaskSummary: zero.assessment.longTaskSummary,
    checks: [
      ...pairedChecks,
      {
        name: 'zero-history-exactly-one-command',
        passed: zero.commandProof.exact,
        observed: zero.commandProof.exact ? 1 : 0,
        threshold: 1,
      },
      {
        name: '50-history-exactly-one-command',
        passed: history.commandProof.exact,
        observed: history.commandProof.exact ? 1 : 0,
        threshold: 1,
      },
    ],
    counters: {
      zeroHistory: {
        handlerDurations: zero.probe.handlerDurations,
        frameIntervals: zero.probe.frameIntervals,
        longTasks: zero.probe.longTasks,
        handlerSummary: zero.assessment.handlerSummary,
        frameSummary: zero.assessment.frameSummary,
        longTaskSummary: zero.assessment.longTaskSummary,
        commandProof: zero.commandProof,
        autosaveWrites: zero.postCommitProbe.storageWrites,
        probeDurationMs: zero.probe.durationMs,
        eventCounts: zero.probe.eventCounts,
        eventTimes: zero.probe.eventTimes,
        phaseSpans: zero.diagnosticPhaseSpans,
        longTaskBoundaryDiagnostics: zero.windowDiagnostic,
        cdpTrace: {
          tracePath: zero.cdpTrace.tracePath,
          attributionPath: zero.cdpTrace.attributionPath,
          traceSizeBytes: zero.cdpTrace.traceSizeBytes,
          summary: zero.cdpTrace.summary,
        },
      },
      history50: {
        handlerDurations: history.probe.handlerDurations,
        frameIntervals: history.probe.frameIntervals,
        longTasks: history.probe.longTasks,
        handlerSummary: history.assessment.handlerSummary,
        frameSummary: history.assessment.frameSummary,
        longTaskSummary: history.assessment.longTaskSummary,
        commandProof: history.commandProof,
        autosaveWrites: history.postCommitProbe.storageWrites,
        probeDurationMs: history.probe.durationMs,
        eventCounts: history.probe.eventCounts,
        eventTimes: history.probe.eventTimes,
        phaseSpans: history.diagnosticPhaseSpans,
        longTaskBoundaryDiagnostics: history.windowDiagnostic,
        cdpTrace: {
          tracePath: history.cdpTrace.tracePath,
          attributionPath: history.cdpTrace.attributionPath,
          traceSizeBytes: history.cdpTrace.traceSizeBytes,
          summary: history.cdpTrace.summary,
        },
      },
      historyCount: 50,
      zeroHistoryHandlerP95Ms: zeroP95,
      history50HandlerP95Ms: historyP95,
      history50AllowedHandlerP95Ms: historyLimit,
      fullPublicationCount: null,
    },
    notes: [
      'The 100-entity fixture is the canonical 31-entity Future Workstation plus 69 deterministic tables.',
      'The one-command witness is undo then redo returning exact export bytes around the gesture.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-007-transform-paired-history', artifact)
  expect(artifact.status).toBe('PASS')
})

test('AC-008 focused resize commit preserves the selected entity', async ({ page }) => {
  await installEvidenceProbe(page)
  await openEvidencePage(page)
  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  await expect(page.getByTestId('dimensions-width')).toBeVisible()
  await page.getByTestId('tool-resize').click()
  const selectedId = await page
    .locator('.inspector-title .muted-copy')
    .getAttribute('title')
  if (!selectedId) throw new Error('The added desk did not expose a stable entity id.')
  const readSelectedId = () =>
    page.locator('.inspector-title .muted-copy').getAttribute('title')
  const handle = await waitForPoint(
    () => projectedObjectPoint(page, 'resize-width-handle'),
    'focused resize handle',
  )
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  const afterPointerDown = await readSelectedId()
  await page.mouse.move(handle.x + 2, handle.y)
  const afterPointerMove = await readSelectedId()
  await page.mouse.up()
  const afterPointerUp = await readSelectedId()
  if (afterPointerUp !== selectedId) {
    throw new Error(
      JSON.stringify({
        selectedId,
        afterPointerDown,
        afterPointerMove,
        afterPointerUp,
      }),
    )
  }
})

test('AC-008 five commits record criterion status without promoting runner acceptance', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  await openEvidencePage(page)
  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  await expect(page.getByTestId('dimensions-width')).toBeVisible()
  await page.getByTestId('tool-resize').click()
  const selectedId = await page
    .locator('.inspector-title .muted-copy')
    .getAttribute('title')
  if (!selectedId) throw new Error('The added desk did not expose a stable entity id.')
  const beforeCommitScene = await exportedScene(page)
  const canonicalScenes = [beforeCommitScene]
  const commitSamples: {
    readonly index: number
    readonly screenDeltaX: number
    readonly pointerUpToStableFrameMs: number
    readonly pointerUpAtMs: number
    readonly stableFrameTimesMs: readonly number[]
    readonly sceneChanged: boolean
    readonly rendererRestored: boolean
    readonly restorationElapsedMs: number
    readonly rendererBefore: RendererRuntimeSnapshot
    readonly rendererAfter: RendererRuntimeSnapshot
  }[] = []
  await resetRendererEvidenceCounters(page)
  await startEvidenceWindow(page, 'ac-008-five-commit-series')

  for (let index = 0; index < 5; index += 1) {
    const screenDeltaX = index % 2 === 0 ? 2 : -2
    const sceneBefore = canonicalScenes.at(-1)!
    const rendererBefore = await readRendererRuntime(page)
    const handle = await waitForPoint(
      () => projectedObjectPoint(page, 'resize-width-handle'),
      `commit-series resize handle ${index + 1}`,
    )
    await armPointerUpStableFrames(page)
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + screenDeltaX, handle.y)
    await page.mouse.up()
    const stable = await readPointerUpStableFrames(page)
    const restoration = await waitForRendererRestoration(page, rendererBefore)
    const sceneAfter = await exportedScene(page)
    canonicalScenes.push(sceneAfter)
    commitSamples.push({
      index: index + 1,
      screenDeltaX,
      pointerUpToStableFrameMs: stable.elapsedMs,
      pointerUpAtMs: stable.pointerUpAtMs,
      stableFrameTimesMs: stable.frameTimesMs,
      sceneChanged: sceneAfter !== sceneBefore,
      rendererRestored: restoration.restored,
      restorationElapsedMs: restoration.elapsedMs,
      rendererBefore,
      rendererAfter: restoration.current,
    })
  }

  await expect(page.locator('.save-state')).toHaveClass(/save-state--saved/, {
    timeout: 2_000,
  })
  const afterCommitCounters = await readRendererEvidenceCounters(page)
  const finalCommitScene = canonicalScenes.at(-1)!
  const persistedScene = await page.evaluate(() => {
    const raw = localStorage.getItem('home-lab-scene')
    if (!raw) return null
    const envelope = JSON.parse(raw) as { readonly current?: unknown }
    return envelope.current ?? null
  })
  const finalSavedMatchesCanonical =
    persistedScene !== null &&
    JSON.stringify(persistedScene) === JSON.stringify(JSON.parse(finalCommitScene))
  const cancelSceneBefore = await exportedScene(page)
  const cancelGeometryBefore = await readResizeGeometryWitness(page, selectedId)
  const cancelRendererBefore = await readRendererRuntime(page)
  const cancelCountersBefore = afterCommitCounters
  const cancelStorageBefore = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const readCancelSelection = () =>
    page.evaluate(() => {
      const element = document.querySelector('.inspector-title .muted-copy')
      return {
        text: element?.textContent ?? null,
        title: element?.getAttribute('title') ?? null,
      }
    })
  const cancelSelectionBefore = await readCancelSelection()
  const cancelHandle = await waitForPoint(
    () => projectedObjectPoint(page, 'resize-width-handle'),
    'cancelled resize handle',
  )
  await page.mouse.move(cancelHandle.x, cancelHandle.y)
  await page.mouse.down()
  for (let step = 1; step <= 4; step += 1) {
    await page.mouse.move(cancelHandle.x + (8 * step) / 4, cancelHandle.y)
  }
  const cancelGeometryTransient = await readResizeGeometryWitness(page, selectedId)
  const cancelCounters = await readRendererEvidenceCounters(page)
  const cancelSelectionTransient = await readCancelSelection()
  await page.keyboard.press('Escape')
  await waitForStableFrames(page)
  const cancelRestoration = await waitForRendererRestoration(page, cancelRendererBefore)
  const cancelSceneAfterEscape = await exportedSceneWithoutPointerInteraction(page)
  const cancelGeometryAfterEscape = await readResizeGeometryWitness(page, selectedId)
  const cancelCountersAfterEscape = await readRendererEvidenceCounters(page)
  const cancelStorageAfterEscape = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const cancelSelectionAfterEscape = await readCancelSelection()
  // Escape has already cancelled the controller and cleared pointer capture.
  // Release the held button in an inert page corner, then keep a separate
  // post-cleanup witness so a release-side pointer event cannot be mistaken
  // for an Escape-cancel state transition.
  await page.mouse.move(2, 2)
  await page.mouse.up()
  const cancelSceneAfterCleanup = await exportedScene(page)
  const cancelGeometryAfterCleanup = await readResizeGeometryWitness(page, selectedId)
  const cancelCountersAfter = await readRendererEvidenceCounters(page)
  const cancelStorageAfterCleanup = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const cancelSelectionAfterCleanup = await readCancelSelection()
  const cancelSample: {
    readonly action: 'commit' | 'cancel'
    readonly sceneRestored: boolean
    readonly sceneRestoredAfterEscape: boolean
    readonly cleanupPreservedEscapeState: boolean
    readonly interactionUpdates: number
    readonly geometryChangedTransiently: boolean
    readonly geometryRestored: boolean
    readonly geometryRestoredAfterEscape: boolean
    readonly historyRestored: boolean
    readonly historyRestoredAfterEscape: boolean
    readonly storageRestored: boolean
    readonly storageRestoredAfterEscape: boolean
    readonly selectionStable: boolean
    readonly selectionCleanupStable: boolean
    readonly selectionWitness: {
      readonly expectedId: string
      readonly before: { readonly text: string | null; readonly title: string | null }
      readonly transient: { readonly text: string | null; readonly title: string | null }
      readonly afterEscape: {
        readonly text: string | null
        readonly title: string | null
      }
      readonly afterCleanup: {
        readonly text: string | null
        readonly title: string | null
      }
    }
    readonly rendererRestored: boolean
    readonly restorationElapsedMs: number
    readonly sceneBefore: string
    readonly sceneAfter: string
    readonly geometryBefore: ResizeGeometryWitness
    readonly geometryTransient: ResizeGeometryWitness
    readonly geometryAfter: ResizeGeometryWitness
    readonly rendererBefore: RendererRuntimeSnapshot
    readonly rendererAfter: RendererRuntimeSnapshot
  } = {
    action: 'cancel',
    sceneRestored: cancelSceneAfterCleanup === cancelSceneBefore,
    sceneRestoredAfterEscape: cancelSceneAfterEscape === cancelSceneBefore,
    cleanupPreservedEscapeState:
      cancelSceneAfterCleanup === cancelSceneAfterEscape &&
      !objectTransformChanged(cancelGeometryAfterEscape, cancelGeometryAfterCleanup) &&
      JSON.stringify(cancelCountersAfter.history) ===
        JSON.stringify(cancelCountersAfterEscape.history) &&
      cancelStorageAfterCleanup === cancelStorageAfterEscape &&
      cancelSelectionAfterCleanup.title === cancelSelectionAfterEscape.title,
    interactionUpdates: Math.max(
      0,
      cancelCounters.interactionUpdates - cancelCountersBefore.interactionUpdates,
    ),
    geometryChangedTransiently: objectTransformChanged(
      cancelGeometryBefore,
      cancelGeometryTransient,
    ),
    geometryRestored: !objectTransformChanged(
      cancelGeometryBefore,
      cancelGeometryAfterCleanup,
    ),
    geometryRestoredAfterEscape: !objectTransformChanged(
      cancelGeometryBefore,
      cancelGeometryAfterEscape,
    ),
    historyRestored:
      JSON.stringify(cancelCountersAfter.history) ===
      JSON.stringify(cancelCountersBefore.history),
    historyRestoredAfterEscape:
      JSON.stringify(cancelCountersAfterEscape.history) ===
      JSON.stringify(cancelCountersBefore.history),
    storageRestored: cancelStorageAfterCleanup === cancelStorageBefore,
    storageRestoredAfterEscape: cancelStorageAfterEscape === cancelStorageBefore,
    selectionStable:
      cancelSelectionBefore.title === selectedId &&
      cancelSelectionTransient.title === selectedId &&
      cancelSelectionAfterEscape.title === selectedId,
    selectionCleanupStable: cancelSelectionAfterCleanup.title === selectedId,
    selectionWitness: {
      expectedId: selectedId,
      before: cancelSelectionBefore,
      transient: cancelSelectionTransient,
      afterEscape: cancelSelectionAfterEscape,
      afterCleanup: cancelSelectionAfterCleanup,
    },
    rendererRestored: cancelRestoration.restored,
    restorationElapsedMs: cancelRestoration.elapsedMs,
    sceneBefore: cancelSceneBefore,
    sceneAfter: cancelSceneAfterCleanup,
    geometryBefore: cancelGeometryBefore,
    geometryTransient: cancelGeometryTransient,
    geometryAfter: cancelGeometryAfterCleanup,
    rendererBefore: cancelRendererBefore,
    rendererAfter: cancelRestoration.current,
  }

  const probe = await stopEvidenceWindow(page)
  const autosaveWrites = storageWritesInWindow(probe.storageWrites, 0, probe.durationMs)
  const autosaveScheduleSpans = probe.phaseSpans.filter(
    (span) => span.phase === 'resize-autosave-schedule',
  )
  const directlyObservedSchedules = countEvidencePhaseOccurrences(
    probe.phaseSpans,
    'resize-autosave-schedule',
  )
  const autosaveAssessment = assessAutosaveEvidence({
    successfulOperations: 5,
    directlyObservedSchedules,
    physicalWrites: autosaveWrites.length,
    finalSavedMatchesCanonical,
  })

  const undo = undoButton(page)
  const redo = redoButton(page)
  const undoExports: string[] = []
  for (let index = 0; index < 5; index += 1) {
    await expect(undo).toBeEnabled()
    await undo.click()
    undoExports.push(await exportedScene(page))
  }
  const redoExports: string[] = []
  for (let index = 0; index < 5; index += 1) {
    await expect(redo).toBeEnabled()
    await redo.click()
    redoExports.push(await exportedScene(page))
  }
  const expectedUndoExports = [
    canonicalScenes[4]!,
    canonicalScenes[3]!,
    canonicalScenes[2]!,
    canonicalScenes[1]!,
    canonicalScenes[0]!,
  ]
  const expectedRedoExports = canonicalScenes.slice(1)
  const exactUndoEntries = undoExports.map(
    (value, index) => value === expectedUndoExports[index],
  )
  const exactRedoEntries = redoExports.map(
    (value, index) => value === expectedRedoExports[index],
  )
  const finalCounters = await readRendererEvidenceCounters(page)
  await expect(page.locator('.save-state')).toHaveClass(/save-state--saved/, {
    timeout: 2_000,
  })
  const stableSeries = commitSamples.map((sample) => sample.pointerUpToStableFrameMs)
  const sortedStableSeries = [...stableSeries].sort((left, right) => left - right)
  const summary = {
    count: stableSeries.length,
    median: sortedStableSeries[Math.floor(sortedStableSeries.length / 2)] ?? null,
    max: stableSeries.length > 0 ? Math.max(...stableSeries) : null,
  }
  const runtimeObservable = [
    ...commitSamples.flatMap((sample) => [sample.rendererBefore, sample.rendererAfter]),
    cancelSample.rendererBefore,
    cancelSample.rendererAfter,
  ].every(rendererRuntimeObservable)
  const checks = [
    {
      name: 'five-successful-commits',
      passed:
        commitSamples.length === 5 &&
        commitSamples.every((sample) => sample.sceneChanged) &&
        afterCommitCounters.canonicalCommands === 5,
      observed: afterCommitCounters.canonicalCommands,
      threshold: 5,
    },
    {
      name: 'five-exact-undo-entries',
      passed: exactUndoEntries.length === 5 && exactUndoEntries.every(Boolean),
      observed: exactUndoEntries.filter(Boolean).length,
      threshold: 5,
    },
    {
      name: 'five-exact-redo-entries',
      passed: exactRedoEntries.length === 5 && exactRedoEntries.every(Boolean),
      observed: exactRedoEntries.filter(Boolean).length,
      threshold: 5,
    },
    {
      name: 'pointer-up-to-stable-median',
      passed: summary.median !== null && summary.median <= 50,
      observed: summary.median,
      threshold: 50,
    },
    {
      name: 'pointer-up-to-stable-max',
      passed: summary.max !== null && summary.max <= 100,
      observed: summary.max,
      threshold: 100,
    },
    {
      name: 'edit-renderer-restored-after-commit',
      passed: commitSamples.every(
        (sample) => sample.rendererRestored && sample.restorationElapsedMs <= 250,
      ),
      observed: Math.max(...commitSamples.map((sample) => sample.restorationElapsedMs)),
      threshold: 250,
    },
    {
      name: 'edit-renderer-restored-after-cancel',
      passed: cancelSample.rendererRestored && cancelSample.restorationElapsedMs <= 250,
      observed: cancelSample.restorationElapsedMs,
      threshold: 250,
    },
    {
      name: 'cancel-transient-geometry-witness',
      passed: cancelSample.geometryChangedTransiently && cancelSample.selectionStable,
      observed: {
        geometryChangedTransiently: cancelSample.geometryChangedTransiently,
        interactionUpdates: cancelSample.interactionUpdates,
        selectionStable: cancelSample.selectionStable,
      },
      threshold: 'renderer geometry changed with stable selection',
    },
    {
      name: 'escape-cancel-preserves-canonical-state',
      passed:
        cancelSample.geometryChangedTransiently &&
        cancelSample.sceneRestoredAfterEscape &&
        cancelSample.historyRestoredAfterEscape &&
        cancelSample.storageRestoredAfterEscape &&
        cancelSample.geometryRestoredAfterEscape,
      observed: {
        sceneRestoredAfterEscape: cancelSample.sceneRestoredAfterEscape,
        historyRestoredAfterEscape: cancelSample.historyRestoredAfterEscape,
        storageRestoredAfterEscape: cancelSample.storageRestoredAfterEscape,
        geometryRestoredAfterEscape: cancelSample.geometryRestoredAfterEscape,
      },
      threshold: 'all true after Escape',
    },
    {
      name: 'mouseup-cleanup-preserves-escape-state',
      passed: cancelSample.cleanupPreservedEscapeState,
      observed: cancelSample.cleanupPreservedEscapeState ? 'unchanged' : 'changed',
      threshold: 'unchanged after inert release',
    },
    {
      name: 'renderer-dpr-shadow-lighting-profile-observable',
      passed: runtimeObservable,
      observed: runtimeObservable ? 'available' : 'unavailable',
      threshold: 'available',
    },
    {
      name: 'autosave-schedule-direct-witness',
      passed: autosaveAssessment.schedulesMatchSuccessfulOperations === true,
      observed: autosaveAssessment.scheduleWitnessAvailable ? 'available' : 'unavailable',
      threshold: 'one directly observed schedule per successful operation',
    },
    {
      name: 'debounced-autosave-final-content',
      passed: autosaveAssessment.physicalWriteCoalescingValid,
      observed: {
        physicalWrites: autosaveWrites.length,
        finalSavedMatchesCanonical,
      },
      threshold:
        '1..5 coalesced physical writes and final saved current equals canonical',
    },
  ]
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const hardFailure = checks.some(
    (check) => !check.passed && check.name !== 'autosave-schedule-direct-witness',
  )
  const status = !runtimeObservable
    ? 'UNRESOLVED'
    : hardFailure
      ? 'FAIL'
      : autosaveAssessment.status
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-008',
      'five-commit-stable-frame-series',
      status,
      await environment(page, browser),
      diagnostics,
      { kind: 'default-scene-plus-added-desk' },
      0,
    ),
    status,
    probe,
    checks,
    counters: {
      pointerUpToStableFrameMs: stableSeries,
      pointerUpToStableFrameSummary: summary,
      commitSamples,
      cancelSample,
      canonicalCommandCount: afterCommitCounters.canonicalCommands,
      canonicalCommandWitness: {
        canonicalScenes,
        undoExports,
        redoExports,
        exactUndoEntries,
        exactRedoEntries,
      },
      historyCounts: {
        afterCommits: afterCommitCounters.history,
        afterUndoRedo: finalCounters.history,
      },
      storeNotificationCount: afterCommitCounters.storeNotifications,
      autosaveScheduleCount: directlyObservedSchedules,
      autosaveScheduleWitness: autosaveScheduleSpans,
      autosaveWrites,
      autosaveAssessment,
      finalSavedMatchesCanonical,
      storageWrites: probe.storageWrites,
      saveStatusTransitions: probe.saveStatusTransitions,
      completeScenePublicationCount: null,
      completeScenePublicationWitness:
        'The public EditorStore snapshot.scene getter clones on access, so exact complete-scene publication count is not observable.',
    },
    renderer: {
      before: commitSamples[0]?.rendererBefore,
      after: cancelSample.rendererAfter,
    },
    notes: [
      'Each sample is a real resize-handle pointer-up followed by two stable browser frames.',
      'The command witness undoes and redoes all five gestures as five exact history entries.',
      'The autosave observation window ends after the five commit saves and before the separate Undo/Redo history proof.',
      'Physical localStorage writes may coalesce under the 250ms debounce; the final persisted current document is compared with the fifth canonical scene.',
      'The bounded resize-autosave-schedule phase spans directly witness each autosave schedule call; physical writes remain separately measured for debounce/coalescing.',
      'Resize interactionUpdates count store update calls, not renderer-only transient geometry changes, and is recorded as diagnostic data only.',
      'Runner acceptance means only that the artifact was generated and is PASS or UNRESOLVED; an UNRESOLVED artifact is never a criterion PASS.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-008-five-commit-series', artifact)
  const runnerAcceptedArtifactStatus =
    artifact.status === 'PASS' || artifact.status === 'UNRESOLVED'
  expect(runnerAcceptedArtifactStatus).toBe(true)
})

test('AC-008 OrbitControls runs for five seconds without canonical writes', async ({
  page,
  browser,
}, testInfo) => {
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  await openEvidencePage(page)
  const exactEvidenceQuery = new URL(page.url()).search === '?evidence=1'
  const editRuntimeBefore = await readRendererRuntime(page)
  await previewButton(page).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  await waitForStableFrames(page)
  const previewRuntimeBefore = await readRendererRuntime(page)
  const before = await exportedScene(page)
  const canvasBox = await page.locator('canvas').boundingBox()
  if (!canvasBox) throw new Error('Preview canvas did not have a bounding box.')
  const center = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  }
  await page.mouse.move(center.x, center.y)
  await resetRendererEvidenceCounters(page)
  await startEvidenceWindow(page, 'ac-008-orbit-5s')
  await orbitForWindow(page, center, 110, LONG_WINDOW_MS, LONG_UPDATE_COUNT, true)
  const probe = await stopEvidenceWindow(page)
  const publicationCounters = await readRendererEvidenceCounters(page)
  const assessment = longWindowAssessment(probe)
  const after = await exportedScene(page)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const autosaveWrites = probe.storageWrites.filter(
    (write) => write.key === 'home-lab-scene',
  ).length
  const previewRuntimeAfter = await readRendererRuntime(page)
  await editButton(page).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'editor',
  )
  await waitForStableFrames(page)
  const editRestoration = await waitForRendererRestoration(page, editRuntimeBefore)
  const requiredRuntimeObservable = [
    editRuntimeBefore,
    previewRuntimeBefore,
    previewRuntimeAfter,
    editRestoration.current,
  ].every(rendererRuntimeObservable)
  const checks = [
    ...assessment.checks,
    {
      name: 'canonical-export-unchanged',
      passed: before === after,
      observed: before === after ? 'unchanged' : 'changed',
    },
    {
      name: 'exact-evidence-query',
      passed: exactEvidenceQuery,
      observed: new URL(page.url()).search,
      threshold: '?evidence=1',
    },
    {
      name: 'zero-canonical-commands',
      passed: publicationCounters.canonicalCommands === 0,
      observed: publicationCounters.canonicalCommands,
      threshold: 0,
    },
    {
      name: 'zero-canonical-storage-writes',
      passed: autosaveWrites === 0,
      observed: autosaveWrites,
      threshold: 0,
    },
    {
      name: 'zero-save-status-transitions',
      passed: probe.saveStatusTransitions.length === 0,
      observed: probe.saveStatusTransitions.length,
      threshold: 0,
    },
    {
      name: 'zero-store-notifications',
      passed: publicationCounters.storeNotifications === 0,
      observed: publicationCounters.storeNotifications,
      threshold: 0,
    },
    {
      name: 'renderer-runtime-captured',
      passed: requiredRuntimeObservable,
      observed: requiredRuntimeObservable ? 'available' : 'unavailable',
      threshold: 'available',
    },
    {
      name: 'edit-preview-edit-renderer-restored',
      passed:
        requiredRuntimeObservable &&
        editRestoration.restored &&
        rendererRuntimeRestored(editRuntimeBefore, editRestoration.current),
      observed: editRestoration.restored ? 'restored' : 'not-restored',
      threshold: 'restored',
    },
  ]
  const status = !requiredRuntimeObservable
    ? 'UNRESOLVED'
    : checks.every((check) => check.passed)
      ? 'PASS'
      : 'FAIL'
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-008',
      'orbit-controls-5s',
      status,
      await environment(page, browser),
      diagnostics,
      { kind: 'default-scene' },
      0,
    ),
    status,
    probe,
    handlerSummary: assessment.handlerSummary,
    frameSummary: assessment.frameSummary,
    longTaskSummary: assessment.longTaskSummary,
    checks,
    counters: {
      requestedDurationMs: LONG_WINDOW_MS,
      actualElapsedMs: probe.durationMs,
      elapsedOverrunMs: probe.durationMs - LONG_WINDOW_MS,
      canonicalCommandCount: publicationCounters.canonicalCommands,
      storeNotificationCount: publicationCounters.storeNotifications,
      autosaveWrites,
      saveStatusTransitions: probe.saveStatusTransitions,
      pointerMoves: probe.eventCounts.pointermove ?? 0,
    },
    renderer: {
      before: editRuntimeBefore,
      after: previewRuntimeAfter,
      final: editRestoration.current,
    },
    notes: [
      'OrbitControls ran in preview mode, where editing and canonical command paths are guarded.',
      'The raw frame and Long Task arrays are retained in the artifact.',
      `The requested window was ${LONG_WINDOW_MS}ms; the authoritative probe elapsed ${probe.durationMs}ms, an overrun of ${probe.durationMs - LONG_WINDOW_MS}ms.`,
      'Renderer restoration includes profile, quality tier, DPR, shadows, exposure, background, and observable lights.',
      'PROVENANCE: This is the intentional AC-008 OrbitControls rerun requested after the accepted AC-007 stage.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-008-orbit-5s', artifact)
  if (artifact.status === 'UNRESOLVED') expect(requiredRuntimeObservable).toBe(false)
  else expect(artifact.status).toBe('PASS')
})

test('AC-019 100-entity preview records activation readiness and a ten-second settled orbit', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300_000)
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const fixture = createPerformanceScene(69)
  expect(fixture.entities).toHaveLength(100)
  await loadFixture(page, fixture, 'ac-019-preview-100-entity.json')
  const exactEvidenceQuery = new URL(page.url()).search === '?evidence=1'
  const canonicalBefore = await exportedScene(page)
  const topView = page.getByRole('button', { name: 'Top view', exact: true })
  if (!(await topView.isEnabled()))
    throw new Error(
      'EVIDENCE_SETUP_UNRESOLVED: Top view camera control is disabled after renderer bridge readiness.',
    )
  await topView.click()
  await waitForStableFrames(page)
  const cameraSettlements: Array<{
    readonly phase: string
    readonly result: CameraSettledResult
  }> = []
  cameraSettlements.push({
    phase: 'edit-top',
    result: await waitForCameraSettled(page),
  })
  const editTopCamera = await readCameraOrbitSnapshot(page)
  const activationStart = await page.evaluate(() => performance.now())
  await previewButton(page).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  const activationStable = await waitForStableFramesSince(
    page,
    activationStart,
    2,
    10_000,
  )
  cameraSettlements.push({
    phase: 'edit-to-preview',
    result: await waitForCameraSettled(page),
  })
  const activationRuntime = await waitForRendererEvidence(page)
  const requiredRuntimeObservable = rendererRuntimeObservable(activationRuntime)
  await resetRendererEvidenceCounters(page)
  await startEvidenceWindow(page, 'ac-019-tier-matrix')
  const tierMatrixCanonicalBefore = await exportedScene(page)
  const tierMatrixStorageBefore = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const tierMatrixHistoryBefore = {
    undo: await undoButton(page).isEnabled(),
    redo: await redoButton(page).isEnabled(),
  }
  const tierMatrix: Array<{
    readonly tier: PreviewQualityTier
    readonly runtime: RendererRuntimeSnapshot
    readonly rendererMatchesProfile: boolean
    readonly camera: CameraOrbitSnapshot
    readonly cameraSettlement: CameraSettledResult
  }> = []
  for (const tier of ['high', 'balanced', 'safe'] as const) {
    const runtime = await forceEvidencePreviewTier(page, tier)
    const cameraSettlement = await waitForCameraSettled(page)
    const camera = await readCameraOrbitSnapshot(page)
    cameraSettlements.push({ phase: `preview-${tier}`, result: cameraSettlement })
    tierMatrix.push({
      tier,
      runtime,
      rendererMatchesProfile: rendererTierMatches(runtime, tier),
      camera,
      cameraSettlement,
    })
  }
  const tierMatrixCanonicalAfter = await exportedScene(page)
  const tierMatrixStorageAfter = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const tierMatrixHistoryAfter = {
    undo: await undoButton(page).isEnabled(),
    redo: await redoButton(page).isEnabled(),
  }
  const tierMatrixCanonicalUnchanged =
    tierMatrixCanonicalAfter === tierMatrixCanonicalBefore
  const tierMatrixStorageUnchanged = tierMatrixStorageAfter === tierMatrixStorageBefore
  const tierMatrixHistoryUnchanged =
    JSON.stringify(tierMatrixHistoryAfter) === JSON.stringify(tierMatrixHistoryBefore)
  const tierMatrixPassed =
    tierMatrix.length === 3 &&
    tierMatrix.every(({ rendererMatchesProfile }) => rendererMatchesProfile) &&
    tierMatrixCanonicalUnchanged &&
    tierMatrixStorageUnchanged &&
    tierMatrixHistoryUnchanged
  await forceEvidencePreviewTier(page, 'high')
  cameraSettlements.push({
    phase: 'safe-to-high',
    result: await waitForCameraSettled(page),
  })
  const highReturnCamera = await readCameraOrbitSnapshot(page)
  const tierMatrixProbe = await stopEvidenceWindow(page)
  await waitForRendererEvidence(page)
  await waitForStableFrames(page)
  const canvasBox = await page.locator('canvas').boundingBox()
  if (!canvasBox)
    throw new Error('The 100-entity preview canvas did not have a bounding box.')
  const center = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  }
  await page.mouse.move(center.x, center.y)
  const inertPoint = await findInertPointerPoint(page)
  await startEvidenceWindow(page, 'ac-019-transport-baseline')
  const transportBaseline = await inertPointerMoveTransportBaseline(
    page,
    inertPoint,
    8,
    PREVIEW_WINDOW_MS,
    PREVIEW_UPDATE_COUNT,
  )
  const transportBaselineProbe = await stopEvidenceWindow(page)
  // The inert baseline ends at the inert point. Re-enter the canvas before
  // the evidence window so the pointerdown is an actual OrbitControls start.
  await page.mouse.move(center.x, center.y)
  await resetRendererEvidenceCounters(page)
  await startEvidenceWindow(page, 'ac-019-preview-orbit-10s')
  const orbitMeasurement = await orbitForWindow(
    page,
    center,
    115,
    PREVIEW_WINDOW_MS,
    PREVIEW_UPDATE_COUNT,
    true,
  )
  const probe = await stopEvidenceWindow(page)
  cameraSettlements.push({
    phase: 'orbit-mouseup',
    result: await waitForCameraSettled(page),
  })
  const highAfterOrbitCamera = await readCameraOrbitSnapshot(page)
  const publicationCounters = await readRendererEvidenceCounters(page)
  const assessment = longWindowAssessment(probe, PREVIEW_WINDOW_MS)
  const durationAssessment = assessBoundedWindowDuration(
    probe.durationMs,
    PREVIEW_WINDOW_MS,
    PREVIEW_WINDOW_MAX_MS,
  )
  let highBeforeEditCamera: CameraOrbitSnapshot | null = null
  let editRestoredCamera: CameraOrbitSnapshot | null = null
  let editBeforePreviewCamera: CameraOrbitSnapshot | null = null
  const editModeButton = editButton(page)
  if (await editModeButton.isVisible().catch(() => false)) {
    cameraSettlements.push({
      phase: 'before-edit-mode-switch',
      result: await waitForCameraSettled(page),
    })
    highBeforeEditCamera = await readCameraOrbitSnapshot(page)
    await editModeButton.click()
    await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
      'data-renderer-profile',
      'editor',
    )
    await waitForStableFrames(page)
    cameraSettlements.push({
      phase: 'preview-to-edit',
      result: await waitForCameraSettled(page),
    })
    editRestoredCamera = await readCameraOrbitSnapshot(page)
    cameraSettlements.push({
      phase: 'before-preview-mode-switch',
      result: await waitForCameraSettled(page),
    })
    editBeforePreviewCamera = await readCameraOrbitSnapshot(page)
    await previewButton(page).click()
    await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
      'data-renderer-profile',
      'preview',
    )
    await waitForStableFrames(page)
    cameraSettlements.push({
      phase: 'edit-to-preview-final',
      result: await waitForCameraSettled(page),
    })
  }
  const finalRuntime = await waitForRendererEvidence(page)
  if (!cameraSettlements.some(({ phase }) => phase === 'edit-to-preview-final')) {
    cameraSettlements.push({
      phase: 'final-preview',
      result: await waitForCameraSettled(page),
    })
  }
  const finalPreviewCamera = await readCameraOrbitSnapshot(page)
  const canonicalAfter = await exportedScene(page)
  const cameraTransitionStorageAfter = await page.evaluate(() =>
    localStorage.getItem('home-lab-scene'),
  )
  const cameraTransitionHistoryAfter = {
    undo: await undoButton(page).isEnabled(),
    redo: await redoButton(page).isEnabled(),
  }
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const finalQualityTier = finalRuntime.qualityTier
  const autosaveWrites = probe.storageWrites.filter(
    (write) => write.key === 'home-lab-scene',
  ).length
  const highCamera = tierMatrix.find(({ tier }) => tier === 'high')?.camera ?? null
  const balancedCamera =
    tierMatrix.find(({ tier }) => tier === 'balanced')?.camera ?? null
  const safeCamera = tierMatrix.find(({ tier }) => tier === 'safe')?.camera ?? null
  const cameraSnapshots = {
    editTop: editTopCamera,
    previewHigh: highCamera,
    balanced: balancedCamera,
    safe: safeCamera,
    highReturn: highReturnCamera,
    highAfterOrbit: highAfterOrbitCamera,
    beforeEditModeSwitch: highBeforeEditCamera,
    editRestored: editRestoredCamera,
    beforePreviewModeSwitch: editBeforePreviewCamera,
    finalPreview: finalPreviewCamera,
  }
  const requiredCameraSnapshots = [
    editTopCamera,
    highCamera,
    balancedCamera,
    safeCamera,
    highReturnCamera,
    highAfterOrbitCamera,
    highBeforeEditCamera,
    editRestoredCamera,
    editBeforePreviewCamera,
    finalPreviewCamera,
  ]
  const cameraStateCaptured = requiredCameraSnapshots.every(
    (snapshot) =>
      snapshot !== null &&
      snapshot.position !== null &&
      snapshot.quaternion !== null &&
      snapshot.zoom !== null &&
      snapshot.target !== null,
  )
  const cameraBoundaryChecks = [
    {
      boundary: 'edit-top -> preview-high',
      passed:
        highCamera !== null &&
        cameraOrbitSnapshotsApproximatelyEqual(editTopCamera, highCamera),
    },
    {
      boundary: 'preview-high -> balanced',
      passed:
        highCamera !== null &&
        balancedCamera !== null &&
        cameraOrbitSnapshotsApproximatelyEqual(highCamera, balancedCamera),
    },
    {
      boundary: 'balanced -> safe',
      passed:
        balancedCamera !== null &&
        safeCamera !== null &&
        cameraOrbitSnapshotsApproximatelyEqual(balancedCamera, safeCamera),
    },
    {
      boundary: 'safe -> high',
      passed:
        safeCamera !== null &&
        cameraOrbitSnapshotsApproximatelyEqual(safeCamera, highReturnCamera),
    },
    {
      boundary: 'high -> edit -> high',
      passed:
        highBeforeEditCamera !== null &&
        editRestoredCamera !== null &&
        editBeforePreviewCamera !== null &&
        cameraOrbitSnapshotsApproximatelyEqual(
          highBeforeEditCamera,
          editRestoredCamera,
        ) &&
        cameraOrbitSnapshotsApproximatelyEqual(
          editBeforePreviewCamera,
          finalPreviewCamera,
        ),
    },
  ]
  const orbitCameraChangedFromTopView =
    highCamera !== null &&
    highAfterOrbitCamera !== null &&
    !cameraOrbitSnapshotsApproximatelyEqual(highCamera, highAfterOrbitCamera)
  const orbitCameraRetainedAfterEditPreview =
    highBeforeEditCamera !== null &&
    editRestoredCamera !== null &&
    editBeforePreviewCamera !== null &&
    finalPreviewCamera !== null &&
    cameraOrbitSnapshotsApproximatelyEqual(highBeforeEditCamera, editRestoredCamera) &&
    cameraOrbitSnapshotsApproximatelyEqual(editBeforePreviewCamera, finalPreviewCamera)
  const cameraTransitionCanonicalUnchanged = canonicalAfter === tierMatrixCanonicalBefore
  const cameraTransitionStorageUnchanged =
    cameraTransitionStorageAfter === tierMatrixStorageBefore
  const cameraTransitionHistoryUnchanged =
    JSON.stringify(cameraTransitionHistoryAfter) ===
    JSON.stringify(tierMatrixHistoryBefore)
  const cameraSettlingPassed = cameraSettlements.every(
    ({ result }) => result.status === 'SETTLED',
  )
  const cameraBoundaryPass =
    cameraStateCaptured &&
    cameraSettlingPassed &&
    orbitCameraChangedFromTopView &&
    orbitCameraRetainedAfterEditPreview &&
    cameraBoundaryChecks.every(({ passed }) => passed) &&
    cameraTransitionCanonicalUnchanged &&
    cameraTransitionStorageUnchanged &&
    cameraTransitionHistoryUnchanged
  const fixedCameraWitnesses = [
    {
      camera: 'Top view',
      observedTier: activationRuntime.qualityTier,
      observed: activationRuntime.qualityTier !== null,
      selection: 'automatic preview tier; fixed-camera Top view',
    },
  ]
  const checks = [
    ...assessment.checks,
    {
      name: 'orbit-duration-within-explicit-upper-bound',
      passed: durationAssessment.passed,
      observed: durationAssessment.observedMs,
      threshold: `${durationAssessment.minimumMs}..${durationAssessment.maximumMs}ms`,
    },
    {
      name: 'inert-transport-baseline-captured',
      passed:
        transportBaseline.updateCount === PREVIEW_UPDATE_COUNT &&
        transportBaselineProbe.eventCounts.pointermove !== undefined,
      observed: {
        requestedUpdates: transportBaseline.updateCount,
        observedPointerMoves: transportBaselineProbe.eventCounts.pointermove ?? 0,
      },
      threshold: PREVIEW_UPDATE_COUNT,
    },
    {
      name: '100-entity-fixture',
      passed: fixture.entities.length === 100,
      observed: fixture.entities.length,
      threshold: 100,
    },
    {
      name: 'exact-evidence-query',
      passed: exactEvidenceQuery,
      observed: new URL(page.url()).search,
      threshold: '?evidence=1',
    },
    {
      name: 'activation-to-second-stable-frame',
      passed: activationStable.stableFrameCount >= 2,
      observed: activationStable.elapsedMs,
      threshold: 'second stable frame observed',
    },
    {
      name: 'final-preview-quality-tier-observed',
      passed: finalQualityTier !== null && finalRuntime.profile === 'preview',
      observed: finalQualityTier,
      threshold: 'high|balanced|safe',
    },
    {
      name: 'renderer-runtime-captured',
      passed: requiredRuntimeObservable && rendererRuntimeObservable(finalRuntime),
      observed:
        requiredRuntimeObservable && rendererRuntimeObservable(finalRuntime)
          ? 'available'
          : 'unavailable',
      threshold: 'available',
    },
    {
      name: 'camera-state-survives-antialias-boundaries',
      passed: cameraBoundaryPass,
      observed: {
        snapshots: cameraSnapshots,
        boundaries: cameraBoundaryChecks,
        transitionBoundaries: {
          beforeEditModeSwitch: highBeforeEditCamera,
          beforePreviewModeSwitch: editBeforePreviewCamera,
        },
        canonicalUnchanged: cameraTransitionCanonicalUnchanged,
        storageUnchanged: cameraTransitionStorageUnchanged,
        historyUnchanged: cameraTransitionHistoryUnchanged,
      },
      threshold: `position/quaternion/zoom/target within ${CAMERA_STATE_TOLERANCE}`,
    },
    {
      name: 'camera-settled-before-each-snapshot',
      passed: cameraSettlingPassed,
      observed: cameraSettlements,
      threshold: {
        status: 'SETTLED',
        tolerance: CAMERA_SETTLE_TOLERANCE,
        consecutiveSamples: CAMERA_SETTLE_CONSECUTIVE_SAMPLES,
        timeoutMs: CAMERA_SETTLE_TIMEOUT_MS,
      },
    },
    {
      name: 'orbit-camera-changed-from-top-view',
      passed: orbitCameraChangedFromTopView,
      observed: {
        changed: orbitCameraChangedFromTopView,
        topView: highCamera,
        afterOrbit: highAfterOrbitCamera,
      },
      threshold: 'camera position/quaternion/target changed after canvas-centered orbit',
    },
    {
      name: 'orbit-camera-retained-after-edit-preview-return',
      passed: orbitCameraRetainedAfterEditPreview,
      observed: {
        editRestored: editRestoredCamera,
        finalPreview: finalPreviewCamera,
        afterOrbit: highAfterOrbitCamera,
      },
      threshold: 'after-orbit camera remains equal through edit -> preview return',
    },
    {
      name: 'orbit-terminated-with-one-pointer-up',
      passed:
        (probe.eventCounts.pointerup ?? 0) === 1 &&
        (probe.eventCounts.pointercancel ?? 0) === 0,
      observed: {
        pointerup: probe.eventCounts.pointerup ?? 0,
        pointercancel: probe.eventCounts.pointercancel ?? 0,
      },
      threshold: { pointerup: 1, pointercancel: 0 },
    },
    {
      name: 'canonical-export-unchanged',
      passed: canonicalAfter === canonicalBefore,
      observed: canonicalAfter === canonicalBefore ? 'unchanged' : 'changed',
      threshold: 'unchanged',
    },
    {
      name: 'zero-canonical-writes-during-orbit',
      passed:
        publicationCounters.canonicalCommands === 0 &&
        publicationCounters.storeNotifications === 0 &&
        autosaveWrites === 0,
      observed: {
        canonicalCommands: publicationCounters.canonicalCommands,
        storeNotifications: publicationCounters.storeNotifications,
        autosaveWrites,
      },
      threshold: {
        canonicalCommands: 0,
        storeNotifications: 0,
        autosaveWrites: 0,
      },
    },
    {
      name: 'deterministic-high-balanced-safe-tier-matrix',
      passed: tierMatrixPassed,
      observed: {
        tiers: tierMatrix.map(({ tier, runtime, rendererMatchesProfile }) => ({
          tier,
          qualityTier: runtime.qualityTier,
          profile: runtime.profile,
          actualAntialias: runtime.renderer?.antialias ?? null,
          configuredAntialias: runtime.renderer?.configuredAntialias ?? null,
          pixelRatio: runtime.renderer?.pixelRatio ?? null,
          shadowMapType: runtime.renderer?.shadowMapType ?? null,
          exposure: runtime.renderer?.toneMappingExposure ?? null,
          rendererMatchesProfile,
        })),
        canonicalUnchanged: tierMatrixCanonicalUnchanged,
        storageUnchanged: tierMatrixStorageUnchanged,
        historyUnchanged: tierMatrixHistoryUnchanged,
      },
      threshold: 'High, Balanced, Safe actual/configured renderer state and zero writes',
    },
  ]
  const unresolvedChecks = new Set([
    'final-preview-quality-tier-observed',
    'renderer-runtime-captured',
  ])
  const hardFailures = checks.filter(
    (check) => !check.passed && !unresolvedChecks.has(check.name),
  )
  const status =
    hardFailures.length > 0
      ? 'FAIL'
      : checks.every((check) => check.passed)
        ? 'PASS'
        : 'UNRESOLVED'
  const artifact: EvidenceArtifact = {
    ...performanceArtifactBase(
      'AC-019',
      '100-entity-preview-activation-and-orbit',
      status,
      await environment(page, browser),
      diagnostics,
      fixture,
      fixture.entities.length,
    ),
    status,
    probe,
    handlerSummary: assessment.handlerSummary,
    frameSummary: assessment.frameSummary,
    longTaskSummary: assessment.longTaskSummary,
    checks,
    counters: {
      activationToSecondStableFrameMs: activationStable.elapsedMs,
      activationStableFrameCount: activationStable.stableFrameCount,
      requestedDurationMs: PREVIEW_WINDOW_MS,
      maximumAllowedDurationMs: PREVIEW_WINDOW_MAX_MS,
      actualElapsedMs: probe.durationMs,
      elapsedOverrunMs: probe.durationMs - PREVIEW_WINDOW_MS,
      durationAssessment,
      transportBaseline: {
        point: inertPoint,
        requestedDurationMs: PREVIEW_WINDOW_MS,
        requestedUpdateCount: PREVIEW_UPDATE_COUNT,
        elapsedMs: transportBaseline.elapsedMs,
        observedProbeDurationMs: transportBaselineProbe.durationMs,
        observedPointerMoves: transportBaselineProbe.eventCounts.pointermove ?? 0,
        orbitElapsedMs: orbitMeasurement.elapsedMs,
        orbitObservedProbeDurationMs: probe.durationMs,
        elapsedDeltaMs: orbitMeasurement.elapsedMs - transportBaseline.elapsedMs,
        samePageAndContext: true,
        sameSchedule: true,
      },
      orbitPointerStart: {
        point: center,
        enteredAfterTransportBaseline: true,
        pointerDownWasIssuedByOrbitHelper: true,
      },
      fixedCameraWitnesses,
      finalQualityTier,
      localEnvironmentReadiness: {
        webglAvailable: activationRuntime.available,
        canvasReady: activationRuntime.canvas !== null,
        renderer: activationRuntime.renderer,
        profile: activationRuntime.profile,
        entityCount: fixture.entities.length,
      },
      deterministicTierMatrix: tierMatrix,
      deterministicTierMatrixProbe: {
        label: tierMatrixProbe.label,
        durationMs: tierMatrixProbe.durationMs,
        longTaskCount: tierMatrixProbe.longTasks.length,
        frameIntervalCount: tierMatrixProbe.frameIntervals.length,
        storageWrites: tierMatrixProbe.storageWrites,
      },
      deterministicTierMatrixInvariants: {
        canonicalUnchanged: tierMatrixCanonicalUnchanged,
        storageUnchanged: tierMatrixStorageUnchanged,
        historyUnchanged: tierMatrixHistoryUnchanged,
      },
      pointerMoves: probe.eventCounts.pointermove ?? 0,
      pointerUpCount: probe.eventCounts.pointerup ?? 0,
      pointerCancelCount: probe.eventCounts.pointercancel ?? 0,
      canonicalCommandCount: publicationCounters.canonicalCommands,
      storeNotificationCount: publicationCounters.storeNotifications,
      autosaveWrites,
      canonicalExportWitness: {
        before: canonicalBefore,
        after: canonicalAfter,
        unchanged: canonicalBefore === canonicalAfter,
      },
      cameraSnapshots,
      cameraBoundaryChecks,
      cameraTransitionBoundaries: {
        beforeEditModeSwitch: highBeforeEditCamera,
        beforePreviewModeSwitch: editBeforePreviewCamera,
      },
      cameraSettlements,
      cameraStateInvariants: {
        canonicalUnchanged: cameraTransitionCanonicalUnchanged,
        storageUnchanged: cameraTransitionStorageUnchanged,
        historyUnchanged: cameraTransitionHistoryUnchanged,
      },
    },
    renderer: { before: activationRuntime, final: finalRuntime },
    notes: [
      'The fixture contains exactly 100 entities: the deterministic 31-entity Future Workstation plus 69 performance tables.',
      'The exact ?evidence=1-only bridge forces High/Balanced/Safe transiently for deterministic renderer observation without adding a user-facing control.',
      'Each forced tier records actual/configured antialias, DPR range, PCF shadow type, shadow-map size, exposure, and canonical/history/storage invariance.',
      `The tier matrix used a separate probe window (${tierMatrixProbe.durationMs}ms) and ended before the authoritative ${PREVIEW_WINDOW_MS}ms orbit probe began.`,
      `The requested orbit window was ${PREVIEW_WINDOW_MS}ms; the authoritative probe elapsed ${probe.durationMs}ms, an overrun of ${probe.durationMs - PREVIEW_WINDOW_MS}ms.`,
      `The orbit duration must remain within ${PREVIEW_WINDOW_MS}..${PREVIEW_WINDOW_MAX_MS}ms; a longer run is FAIL, not a relaxed PASS.`,
      'A previously observed approximately 95-second orbit remains a FAIL under the explicit 10..20-second duration bound.',
      `The inert transport baseline used the same page/context, ${PREVIEW_UPDATE_COUNT} scheduled moves, and ${PREVIEW_WINDOW_MS}ms schedule; the elapsed delta is diagnostic only and does not assign causality to the app, Chromium, or Playwright.`,
      'PROVENANCE: This is the intentional AC-019 headed rerun requested after the accepted AC-007 stage.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-019-preview-100-entity', artifact)
  expect(artifact.status).not.toBe('FAIL')
})

test('AC-022 classifies browser diagnostics and the delayed renderer chunk warning', async ({
  page,
  browser,
}, testInfo) => {
  const pageDiagnostics = attachPageDiagnostics(page)
  await installEvidenceProbe(page)
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ) as Record<string, { readonly file: string }>
  const renderer = manifest['src/renderer/SceneCanvas.tsx']
  if (!renderer) throw new Error('The production manifest has no SceneCanvas entry.')
  await page.route(`**/${renderer.file}`, async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 120))
    await route.continue()
  })
  await page.goto('/?evidence=1')
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  await waitForRendererEvidence(page)
  await waitForStableFrames(page)
  const diagnostics = diagnosticsFor(pageDiagnostics, await readProbeDiagnostics(page))
  const classified = diagnostics as typeof diagnostics & {
    readonly consoleErrors: readonly unknown[]
    readonly consoleWarnings: readonly unknown[]
    readonly acceptedDelayedThreeChunkWarnings: readonly unknown[]
    readonly shaderErrors: readonly unknown[]
    readonly unhandledRejections: readonly unknown[]
    readonly missingAssets: readonly unknown[]
  }
  const checks = [
    {
      name: 'browser-console-errors',
      passed: classified.consoleErrors.length === 0,
      observed: classified.consoleErrors.length,
      threshold: 0,
    },
    {
      name: 'browser-console-warnings',
      passed: classified.consoleWarnings.length === 0,
      observed: classified.consoleWarnings.length,
      threshold: 0,
    },
    {
      name: 'page-errors',
      passed: diagnostics.pageErrors.length === 0,
      observed: diagnostics.pageErrors.length,
      threshold: 0,
    },
    {
      name: 'unhandled-rejections',
      passed: classified.unhandledRejections.length === 0,
      observed: classified.unhandledRejections.length,
      threshold: 0,
    },
    {
      name: 'failed-requests',
      passed: diagnostics.failedRequests.length === 0,
      observed: diagnostics.failedRequests.length,
      threshold: 0,
    },
    {
      name: 'missing-assets',
      passed: classified.missingAssets.length === 0,
      observed: classified.missingAssets.length,
      threshold: 0,
    },
    {
      name: 'shader-errors',
      passed: classified.shaderErrors.length === 0,
      observed: classified.shaderErrors.length,
      threshold: 0,
    },
  ]
  const status = checks.every((check) => check.passed) ? 'PASS' : 'FAIL'
  const artifact: EvidenceArtifact = {
    schemaVersion: 1,
    criterion: 'AC-022',
    run: 'browser-diagnostics-intentional-windows-rerun',
    status,
    environment: await environment(page, browser),
    viewport: VIEWPORT,
    checks,
    counters: {
      consoleErrors: classified.consoleErrors,
      consoleWarnings: classified.consoleWarnings,
      acceptedDelayedThreeChunkWarnings: classified.acceptedDelayedThreeChunkWarnings,
      pageErrors: diagnostics.pageErrors,
      unhandledRejections: classified.unhandledRejections,
      failedRequests: diagnostics.failedRequests,
      missingAssets: classified.missingAssets,
      shaderErrors: classified.shaderErrors,
    },
    diagnostics,
    renderer: { final: await readRendererRuntime(page) },
    notes: [
      'The exact production SceneCanvas chunk was delayed by 120ms to exercise the accepted lazy-renderer warning path.',
      'Diagnostics are separated into console errors/warnings, page errors, unhandled rejections, failed requests, missing assets, shader errors, and accepted delayed-chunk warnings.',
      'Unit/component tests and production-build results are recorded in the durable report because they run outside the browser page.',
      'Ordinary Three deprecation and GPU-stall warnings remain ordinary warnings and fail the zero-warning check.',
      'PROVENANCE: This is the intentional AC-022 Windows diagnostics rerun requested after AC-008 and AC-019.',
    ],
  }
  await persistEvidenceArtifact(testInfo, 'ac-022-browser-diagnostics', artifact)
  expect(artifact.status).toBe('PASS')
})
