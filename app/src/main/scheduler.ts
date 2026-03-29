import type { WindowWatcherError, WindowWatcherSample, WindowWatcherState } from './activity-tracker'
import { WindowWatcher } from './activity-tracker'
import type { PreparedDisplayCapture } from './screen-capture'
import { ScreenshotCapture } from './screen-capture'

const DEFAULT_POLL_INTERVAL_MS = 30_000
const DEFAULT_CAPTURE_INTERVAL_MS = 5 * 60_000
const DEFAULT_SKIP_IDLE_THRESHOLD = 3
const DEFAULT_BRIEFING_TIME = '18:00'

export type SchedulerState = 'stopped' | 'running' | 'paused'

export type SchedulerErrorSource = 'window_watcher' | 'capture' | 'skip_idle' | 'report_trigger' | 'window_sample'

export interface SchedulerWindowWatcher {
  start(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  getLatestSample(): WindowWatcherSample | null
  getState(): WindowWatcherState
}

export interface SchedulerScreenshotCapture {
  captureAllDisplays(): Promise<PreparedDisplayCapture[]>
}

export interface SchedulerSkipIdleContext {
  triggeredAt: string
  sample: WindowWatcherSample | null
  sameWindowSampleCount: number
  lastCaptureAt: string | null
  config: SchedulerResolvedConfig
}

export interface SchedulerSkipIdleConfigInput {
  enabled?: boolean
  sameWindowThreshold?: number
  shouldSkip?: SchedulerSkipIdleHook | null
}

export interface SchedulerSkipIdleConfig {
  enabled: boolean
  sameWindowThreshold: number
  shouldSkip: SchedulerSkipIdleHook | null
}

export interface SchedulerAutoBriefingConfigInput {
  enabled?: boolean
  briefingTime?: string
}

export interface SchedulerAutoBriefingConfig {
  enabled: boolean
  briefingTime: string
}

export interface SchedulerConfigInput {
  pollIntervalMs?: number
  captureIntervalMs?: number
  skipIdle?: SchedulerSkipIdleConfigInput
  autoBriefing?: SchedulerAutoBriefingConfigInput
}

export interface SchedulerResolvedConfig {
  pollIntervalMs: number
  captureIntervalMs: number
  skipIdle: SchedulerSkipIdleConfig
  autoBriefing: SchedulerAutoBriefingConfig
}

export interface SchedulerWindowWatcherFactoryOptions {
  pollIntervalMs: number
  now: () => Date
  onSample: (sample: WindowWatcherSample) => void | Promise<void>
  onError: (error: WindowWatcherError) => void | Promise<void>
}

export interface SchedulerCaptureEvent {
  triggeredAt: string
  sample: WindowWatcherSample | null
  captures: PreparedDisplayCapture[]
  config: SchedulerResolvedConfig
}

export interface SchedulerCaptureSkippedEvent extends SchedulerSkipIdleContext {
  reason: 'skip_idle'
}

export interface SchedulerReportTriggerEvent {
  triggeredAt: string
  reportDate: string
  briefingTime: string
  config: SchedulerResolvedConfig
}

export interface SchedulerErrorContext {
  source: SchedulerErrorSource
  at: string
  state: SchedulerState
}

export interface SchedulerStatus {
  state: SchedulerState
  watcherState: WindowWatcherState
  config: SchedulerResolvedConfig
  latestSample: WindowWatcherSample | null
  sameWindowSampleCount: number
  lastPollAt: string | null
  nextPollAt: string | null
  lastCaptureAt: string | null
  nextCaptureAt: string | null
  lastReportTriggerAt: string | null
  nextReportTriggerAt: string | null
}

export type SchedulerWindowWatcherFactory = (
  options: SchedulerWindowWatcherFactoryOptions
) => SchedulerWindowWatcher

export type SchedulerSkipIdleHook = (context: SchedulerSkipIdleContext) => boolean | Promise<boolean>
export type SchedulerCaptureHandler = (event: SchedulerCaptureEvent) => void | Promise<void>
export type SchedulerCaptureSkippedHandler = (event: SchedulerCaptureSkippedEvent) => void | Promise<void>
export type SchedulerReportTriggerHandler = (event: SchedulerReportTriggerEvent) => void | Promise<void>
export type SchedulerErrorHandler = (error: unknown, context: SchedulerErrorContext) => void | Promise<void>
export type SchedulerWindowSampleHandler = (sample: WindowWatcherSample) => void | Promise<void>

export interface SchedulerOptions {
  config?: SchedulerConfigInput
  createWindowWatcher?: SchedulerWindowWatcherFactory
  screenshotCapture?: SchedulerScreenshotCapture
  onCapture?: SchedulerCaptureHandler
  onCaptureSkipped?: SchedulerCaptureSkippedHandler
  onReportTrigger?: SchedulerReportTriggerHandler
  onWindowSample?: SchedulerWindowSampleHandler
  onError?: SchedulerErrorHandler
  now?: () => Date
}

export class Scheduler {
  private readonly createWindowWatcher: SchedulerWindowWatcherFactory

  private readonly screenshotCapture: SchedulerScreenshotCapture

  private readonly onCapture: SchedulerCaptureHandler | null

  private readonly onCaptureSkipped: SchedulerCaptureSkippedHandler | null

  private readonly onReportTrigger: SchedulerReportTriggerHandler | null

  private readonly onWindowSample: SchedulerWindowSampleHandler | null

  private readonly onError: SchedulerErrorHandler | null

  private readonly now: () => Date

  private captureTimer: ReturnType<typeof setTimeout> | null = null

  private reportTimer: ReturnType<typeof setTimeout> | null = null

  private inflightCapture: Promise<void> | null = null

  private inflightReportTrigger: Promise<void> | null = null

  private config: SchedulerResolvedConfig

  private latestSample: WindowWatcherSample | null = null

  private sameWindowSampleCount = 0

  private state: SchedulerState = 'stopped'

  private lastPollAt: string | null = null

  private nextCaptureAt: string | null = null

  private lastCaptureAt: string | null = null

  private nextReportTriggerAt: string | null = null

  private lastReportTriggerAt: string | null = null

  private lastAutoBriefingDate: string | null = null

  private windowWatcher: SchedulerWindowWatcher

  public constructor(options: SchedulerOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.onCapture = options.onCapture ?? null
    this.onCaptureSkipped = options.onCaptureSkipped ?? null
    this.onReportTrigger = options.onReportTrigger ?? null
    this.onWindowSample = options.onWindowSample ?? null
    this.onError = options.onError ?? null
    this.screenshotCapture = options.screenshotCapture ?? new ScreenshotCapture()
    this.createWindowWatcher = options.createWindowWatcher ?? createDefaultWindowWatcher
    this.config = resolveSchedulerConfig(options.config)
    this.windowWatcher = this.instantiateWindowWatcher()
  }

  public getConfig(): SchedulerResolvedConfig {
    return cloneConfig(this.config)
  }

  public getLatestSample(): WindowWatcherSample | null {
    return this.latestSample
  }

  public getState(): SchedulerState {
    return this.state
  }

  public getStatus(): SchedulerStatus {
    return {
      state: this.state,
      watcherState: this.windowWatcher.getState(),
      config: this.getConfig(),
      latestSample: this.latestSample,
      sameWindowSampleCount: this.sameWindowSampleCount,
      lastPollAt: this.lastPollAt,
      nextPollAt: getNextPollAt(this.state, this.lastPollAt, this.config.pollIntervalMs),
      lastCaptureAt: this.lastCaptureAt,
      nextCaptureAt: this.nextCaptureAt,
      lastReportTriggerAt: this.lastReportTriggerAt,
      nextReportTriggerAt: this.nextReportTriggerAt
    }
  }

  public async start(): Promise<void> {
    if (this.state === 'running') {
      return
    }

    if (this.state === 'stopped') {
      this.resetRuntimeState()
      await this.replaceWindowWatcher(false)
    }

    this.clearCaptureTimer()
    this.clearReportTimer()
    this.state = 'running'

    if (this.windowWatcher.getState() === 'paused') {
      await this.windowWatcher.resume()
    } else {
      await this.windowWatcher.start()
    }

    this.scheduleNextCapture()
    this.scheduleNextReportTrigger()
  }

  public async pause(): Promise<void> {
    if (this.state !== 'running') {
      return
    }

    this.state = 'paused'
    this.clearCaptureTimer()
    this.clearReportTimer()

    await Promise.all([
      this.windowWatcher.pause(),
      this.awaitInflightCapture(),
      this.awaitInflightReportTrigger()
    ])
  }

  public async resume(): Promise<void> {
    if (this.state !== 'paused') {
      return
    }

    this.state = 'running'

    if (this.windowWatcher.getState() === 'paused') {
      await this.windowWatcher.resume()
    } else {
      await this.windowWatcher.start()
    }

    this.scheduleNextCapture()
    this.scheduleNextReportTrigger()
  }

  public async stop(): Promise<void> {
    if (this.state === 'stopped') {
      await Promise.all([this.windowWatcher.stop(), this.awaitInflightCapture(), this.awaitInflightReportTrigger()])
      return
    }

    this.state = 'stopped'
    this.clearCaptureTimer()
    this.clearReportTimer()

    await Promise.all([this.windowWatcher.stop(), this.awaitInflightCapture(), this.awaitInflightReportTrigger()])
  }

  public async updateConfig(patch: SchedulerConfigInput): Promise<SchedulerResolvedConfig> {
    const nextConfig = resolveSchedulerConfig(mergeSchedulerConfig(this.config, patch))
    const pollIntervalChanged = nextConfig.pollIntervalMs !== this.config.pollIntervalMs
    const captureIntervalChanged = nextConfig.captureIntervalMs !== this.config.captureIntervalMs
    const autoBriefingChanged =
      nextConfig.autoBriefing.enabled !== this.config.autoBriefing.enabled ||
      nextConfig.autoBriefing.briefingTime !== this.config.autoBriefing.briefingTime

    this.config = nextConfig

    if (pollIntervalChanged) {
      await this.replaceWindowWatcher(this.state === 'running')
    }

    if (this.state === 'running' && captureIntervalChanged && this.inflightCapture === null) {
      this.scheduleNextCapture()
    }

    if (this.state === 'running' && autoBriefingChanged && this.inflightReportTrigger === null) {
      this.scheduleNextReportTrigger()
    }

    return this.getConfig()
  }

  private async handleWindowSample(sample: WindowWatcherSample): Promise<void> {
    this.latestSample = sample
    this.lastPollAt = sample.timestamp
    this.sameWindowSampleCount = sample.hasChanged ? 1 : this.sameWindowSampleCount + 1

    if (this.onWindowSample === null) {
      return
    }

    try {
      await this.onWindowSample(sample)
    } catch (error) {
      await this.reportError(error, 'window_sample')
    }
  }

  private instantiateWindowWatcher(): SchedulerWindowWatcher {
    return this.createWindowWatcher({
      pollIntervalMs: this.config.pollIntervalMs,
      now: this.now,
      onSample: async (sample) => {
        await this.handleWindowSample(sample)
      },
      onError: async (error) => {
        await this.reportError(error, 'window_watcher')
      }
    })
  }

  private async replaceWindowWatcher(restartIfRunning: boolean): Promise<void> {
    await this.windowWatcher.stop()
    this.windowWatcher = this.instantiateWindowWatcher()

    if (restartIfRunning) {
      await this.windowWatcher.start()
    }
  }

  private resetRuntimeState(): void {
    this.latestSample = null
    this.sameWindowSampleCount = 0
    this.lastPollAt = null
    this.nextCaptureAt = null
    this.lastCaptureAt = null
    this.nextReportTriggerAt = null
    this.lastReportTriggerAt = null
  }

  private scheduleNextCapture(): void {
    if (this.state !== 'running') {
      return
    }

    this.clearCaptureTimer()

    const delayMs = this.config.captureIntervalMs
    const nextCaptureAt = new Date(this.now().getTime() + delayMs)

    this.nextCaptureAt = nextCaptureAt.toISOString()
    this.captureTimer = setTimeout(() => {
      void this.handleScheduledCapture()
    }, delayMs)
  }

  private async handleScheduledCapture(): Promise<void> {
    this.clearCaptureTimer()

    if (this.state !== 'running') {
      return
    }

    if (this.inflightCapture !== null) {
      await this.inflightCapture
    } else {
      this.inflightCapture = this.performCaptureCycle()

      try {
        await this.inflightCapture
      } finally {
        this.inflightCapture = null
      }
    }

    if (this.state === 'running') {
      this.scheduleNextCapture()
    }
  }

  private async performCaptureCycle(): Promise<void> {
    const triggeredAt = this.now().toISOString()
    const skipContext: SchedulerSkipIdleContext = {
      triggeredAt,
      sample: this.latestSample,
      sameWindowSampleCount: this.sameWindowSampleCount,
      lastCaptureAt: this.lastCaptureAt,
      config: this.getConfig()
    }

    const shouldSkip = await this.shouldSkipCapture(skipContext)

    if (shouldSkip) {
      if (this.onCaptureSkipped !== null) {
        try {
          await this.onCaptureSkipped({
            ...skipContext,
            reason: 'skip_idle'
          })
        } catch (error) {
          await this.reportError(error, 'skip_idle')
        }
      }

      return
    }

    try {
      const captures = await this.screenshotCapture.captureAllDisplays()

      this.lastCaptureAt = this.now().toISOString()

      if (this.onCapture !== null) {
        await this.onCapture({
          triggeredAt,
          sample: this.latestSample,
          captures,
          config: this.getConfig()
        })
      }
    } catch (error) {
      await this.reportError(error, 'capture')
    }
  }

  private async shouldSkipCapture(context: SchedulerSkipIdleContext): Promise<boolean> {
    if (!this.config.skipIdle.enabled) {
      return false
    }

    if (context.sample === null || context.sameWindowSampleCount < this.config.skipIdle.sameWindowThreshold) {
      return false
    }

    const hook = this.config.skipIdle.shouldSkip

    if (hook === null) {
      return true
    }

    try {
      return await hook(context)
    } catch (error) {
      await this.reportError(error, 'skip_idle')
      return false
    }
  }

  private scheduleNextReportTrigger(): void {
    this.clearReportTimer()

    if (this.state !== 'running' || !this.config.autoBriefing.enabled || this.onReportTrigger === null) {
      return
    }

    const target = getNextBriefingDate(this.now(), this.config.autoBriefing.briefingTime, this.lastAutoBriefingDate)
    const delayMs = Math.max(0, target.getTime() - this.now().getTime())

    this.nextReportTriggerAt = target.toISOString()
    this.reportTimer = setTimeout(() => {
      void this.handleScheduledReportTrigger()
    }, delayMs)
  }

  private async handleScheduledReportTrigger(): Promise<void> {
    this.clearReportTimer()

    if (this.state !== 'running' || this.onReportTrigger === null || !this.config.autoBriefing.enabled) {
      return
    }

    if (this.inflightReportTrigger !== null) {
      await this.inflightReportTrigger
    } else {
      this.inflightReportTrigger = this.performReportTrigger()

      try {
        await this.inflightReportTrigger
      } finally {
        this.inflightReportTrigger = null
      }
    }

    if (this.state === 'running') {
      this.scheduleNextReportTrigger()
    }
  }

  private async performReportTrigger(): Promise<void> {
    if (this.onReportTrigger === null) {
      return
    }

    const now = this.now()
    const reportDate = toLocalDateKey(now)

    this.lastAutoBriefingDate = reportDate
    this.lastReportTriggerAt = now.toISOString()

    try {
      await this.onReportTrigger({
        triggeredAt: this.lastReportTriggerAt,
        reportDate,
        briefingTime: this.config.autoBriefing.briefingTime,
        config: this.getConfig()
      })
    } catch (error) {
      await this.reportError(error, 'report_trigger')
    }
  }

  private async awaitInflightCapture(): Promise<void> {
    if (this.inflightCapture === null) {
      return
    }

    await this.inflightCapture
  }

  private async awaitInflightReportTrigger(): Promise<void> {
    if (this.inflightReportTrigger === null) {
      return
    }

    await this.inflightReportTrigger
  }

  private clearCaptureTimer(): void {
    if (this.captureTimer !== null) {
      clearTimeout(this.captureTimer)
      this.captureTimer = null
    }

    this.nextCaptureAt = null
  }

  private clearReportTimer(): void {
    if (this.reportTimer !== null) {
      clearTimeout(this.reportTimer)
      this.reportTimer = null
    }

    this.nextReportTriggerAt = null
  }

  private async reportError(error: unknown, source: SchedulerErrorSource): Promise<void> {
    if (this.onError === null) {
      return
    }

    try {
      await this.onError(error, {
        source,
        at: this.now().toISOString(),
        state: this.state
      })
    } catch (hookError) {
      console.error('Scheduler onError handler failed.', hookError)
    }
  }
}

function createDefaultWindowWatcher(options: SchedulerWindowWatcherFactoryOptions): SchedulerWindowWatcher {
  return new WindowWatcher({
    pollIntervalMs: options.pollIntervalMs,
    now: options.now,
    onSample: options.onSample,
    onError: options.onError
  })
}

function resolveSchedulerConfig(input: SchedulerConfigInput | SchedulerResolvedConfig | undefined): SchedulerResolvedConfig {
  const candidate = input ?? {}
  const pollIntervalMs = normalizePositiveInteger(candidate.pollIntervalMs, 'Scheduler pollIntervalMs') ?? DEFAULT_POLL_INTERVAL_MS
  const captureIntervalMs =
    normalizePositiveInteger(candidate.captureIntervalMs, 'Scheduler captureIntervalMs') ?? DEFAULT_CAPTURE_INTERVAL_MS
  const skipIdleInput = candidate.skipIdle ?? {}
  const autoBriefingInput = candidate.autoBriefing ?? {}

  return {
    pollIntervalMs,
    captureIntervalMs,
    skipIdle: {
      enabled: skipIdleInput.enabled ?? true,
      sameWindowThreshold:
        normalizePositiveInteger(skipIdleInput.sameWindowThreshold, 'Scheduler skipIdle.sameWindowThreshold') ??
        DEFAULT_SKIP_IDLE_THRESHOLD,
      shouldSkip: skipIdleInput.shouldSkip ?? null
    },
    autoBriefing: {
      enabled: autoBriefingInput.enabled ?? false,
      briefingTime: normalizeBriefingTime(autoBriefingInput.briefingTime ?? DEFAULT_BRIEFING_TIME)
    }
  }
}

function mergeSchedulerConfig(
  current: SchedulerResolvedConfig,
  patch: SchedulerConfigInput | SchedulerResolvedConfig
): SchedulerConfigInput {
  const hasSkipIdleConfig = patch.skipIdle !== undefined
  const hasAutoBriefingConfig = patch.autoBriefing !== undefined

  return {
    pollIntervalMs: patch.pollIntervalMs ?? current.pollIntervalMs,
    captureIntervalMs: patch.captureIntervalMs ?? current.captureIntervalMs,
    skipIdle: {
      enabled: patch.skipIdle?.enabled ?? current.skipIdle.enabled,
      sameWindowThreshold: patch.skipIdle?.sameWindowThreshold ?? current.skipIdle.sameWindowThreshold,
      shouldSkip: hasSkipIdleConfig && hasOwn(patch.skipIdle, 'shouldSkip')
        ? (patch.skipIdle?.shouldSkip ?? null)
        : current.skipIdle.shouldSkip
    },
    autoBriefing: {
      enabled: patch.autoBriefing?.enabled ?? current.autoBriefing.enabled,
      briefingTime: hasAutoBriefingConfig && hasOwn(patch.autoBriefing, 'briefingTime')
        ? patch.autoBriefing?.briefingTime
        : current.autoBriefing.briefingTime
    }
  }
}

function cloneConfig(config: SchedulerResolvedConfig): SchedulerResolvedConfig {
  return {
    pollIntervalMs: config.pollIntervalMs,
    captureIntervalMs: config.captureIntervalMs,
    skipIdle: {
      enabled: config.skipIdle.enabled,
      sameWindowThreshold: config.skipIdle.sameWindowThreshold,
      shouldSkip: config.skipIdle.shouldSkip
    },
    autoBriefing: {
      enabled: config.autoBriefing.enabled,
      briefingTime: config.autoBriefing.briefingTime
    }
  }
}

function normalizePositiveInteger(value: number | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }

  return value
}

function normalizeBriefingTime(value: string): string {
  const normalized = value.trim()

  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new Error('Scheduler autoBriefing.briefingTime must use HH:mm format.')
  }

  const [hoursText, minutesText] = normalized.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Scheduler autoBriefing.briefingTime must use a valid 24-hour HH:mm value.')
  }

  return `${hoursText}:${minutesText}`
}

function getNextBriefingDate(now: Date, briefingTime: string, lastTriggeredDate: string | null): Date {
  const [hoursText, minutesText] = briefingTime.split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  const target = new Date(now)
  const todayKey = toLocalDateKey(now)

  target.setHours(hours, minutes, 0, 0)

  if (lastTriggeredDate === todayKey || target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target
}

function getNextPollAt(state: SchedulerState, lastPollAt: string | null, pollIntervalMs: number): string | null {
  if (state !== 'running' || lastPollAt === null) {
    return null
  }

  const nextPollAt = new Date(new Date(lastPollAt).getTime() + pollIntervalMs)

  return Number.isNaN(nextPollAt.getTime()) ? null : nextPollAt.toISOString()
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function hasOwn<T extends object, K extends PropertyKey>(value: T | undefined, key: K): value is T & Record<K, unknown> {
  return value !== undefined && Object.prototype.hasOwnProperty.call(value, key)
}
