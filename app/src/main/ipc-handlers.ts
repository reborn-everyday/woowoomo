import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { rm } from 'node:fs/promises'

import { type BrowserWindow, dialog, ipcMain } from 'electron'

import { IPC, type NamedIpcChannel } from '../shared/ipc-channels'
import type { AIProvider } from '../shared/types'
import type { DailyReportRecord, FeedbackRecord, GoalRecord } from './db'
import { StoreService } from './db'
import { delegateToOpenClaw } from './openclaw-bridge'
import type { LiveCapturePermissionStatus, PermissionTarget } from './permissions'
import { PermissionService } from './permissions'
import type { AppPreferences, AppPreferencesPatch } from './prefs-store'
import { PrefsStore, toSchedulerConfig } from './prefs-store'
import { buildTodaySummaryPreview } from './report-service'
import type { RetentionService } from './retention-service'
import { SecureStore } from './secure-store'
import type { Scheduler, SchedulerStatus } from './scheduler'
import { AIPipeline } from './claude-analyzer'
import { processScreenshot, saveScreenshotToTemp } from './utils/image'
import { VideoProcessor, isSupportedVideoExtension } from './video-processor'

interface GoalSavePayload {
  goalText: string
  date?: string
}

interface DatePayload {
  date?: string
}

interface ApiKeySetPayload {
  apiKey: string
}

interface PermissionSettingsPayload {
  target: PermissionTarget
}

interface FeedbackSubmitPayload {
  reportId?: number | null
  itemType: string
  rating: number
}

interface OpenClawDelegatePayload {
  prompt: string
}

interface CollectStateSnapshot {
  state: SchedulerStatus['state']
  permissions: LiveCapturePermissionStatus
  preferences: AppPreferences
  lastCaptureAt: string | null
  nextCaptureAt: string | null
  lastReportTriggerAt: string | null
  nextReportTriggerAt: string | null
}

interface ReportHookResponse {
  status: 'ready' | 'empty' | 'stub'
  date: string
  report: DailyReportRecord | null
  message?: string
}

interface OpenClawDelegateSimulation {
  source: 'docs/SIMULATION_REGISTER.md'
  capability: 'OpenClaw delegation bridge'
  liveIntegrationAvailable: false
  reason: string
  realPathExpectation: string
}

interface OpenClawDelegateResponse {
  status: 'simulated'
  accepted: true
  dispatched: false
  prompt: string
  requestId: string
  createdAt: string
  message: string
  simulation: OpenClawDelegateSimulation
}

interface FeedbackSubmitResult {
  status: 'saved' | 'cleared'
  feedback: FeedbackRecord | null
  itemType: string
  rating: number | null
}

interface TodaySummary {
  date: string
  collect: CollectStateSnapshot
  goalText: string | null
  reportSummary: string | null
  activityCount: number
  screenshotAnalysisCount: number
}

interface IpcErrorResult {
  error: string
}

interface VideoImportPayload {
  filePath: string
}

interface VideoImportResult {
  status: 'complete' | 'error'
  framesProcessed: number
  framesTotal: number
  durationSec: number
}

interface VideoProgressEvent {
  current: number
  total: number
  currentTimestamp: string
  phase: 'extracting' | 'analyzing'
}

export interface RegisterIpcHandlersOptions {
  storeService: StoreService
  prefsStore: PrefsStore
  secureStore: SecureStore
  permissionService: PermissionService
  scheduler: Scheduler
  retentionService?: RetentionService | null
  createAIProvider?: ((apiKey: string) => AIProvider) | null
  generateDailyReport?: ((date: string) => Promise<DailyReportRecord>) | null
  getMainWindow?: (() => BrowserWindow | null) | null
  now?: () => Date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown IPC error.'
}

function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function resolveDateInput(value: unknown, now: () => Date): string {
  if (value === undefined) {
    return toLocalDateString(now())
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('date must use YYYY-MM-DD format.')
  }

  return value
}

function getDayBounds(date: string): { start: string; end: string } {
  const [yearString, monthString, dayString] = date.split('-')
  const year = Number(yearString)
  const month = Number(monthString)
  const day = Number(dayString)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)
  const end = new Date(year, month - 1, day, 23, 59, 59, 999)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function getLatestRecord<T>(records: T[]): T | null {
  return records.length === 0 ? null : records[records.length - 1] ?? null
}

function buildCollectSnapshot(
  scheduler: Scheduler,
  preferences: AppPreferences,
  permissions: LiveCapturePermissionStatus
): CollectStateSnapshot {
  const status = scheduler.getStatus()

  return {
    state: status.state,
    permissions,
    preferences,
    lastCaptureAt: status.lastCaptureAt,
    nextCaptureAt: status.nextCaptureAt,
    lastReportTriggerAt: status.lastReportTriggerAt,
    nextReportTriggerAt: status.nextReportTriggerAt,
  }
}

function parsePreferencesPatch(payload: unknown): AppPreferencesPatch {
  if (!isRecord(payload)) {
    throw new Error('prefs patch payload is required.')
  }

  return {
    captureIntervalMinutes: payload.captureIntervalMinutes as number | undefined,
    watcherPollSeconds: payload.watcherPollSeconds as number | undefined,
    autoBriefingEnabled: payload.autoBriefingEnabled as boolean | undefined,
    autoBriefingTime: payload.autoBriefingTime as string | undefined,
    screenshotRetentionDays: payload.screenshotRetentionDays as number | undefined,
    activityRetentionDays: payload.activityRetentionDays as number | undefined,
  }
}

function parseApiKeyPayload(payload: unknown): ApiKeySetPayload {
  if (!isRecord(payload) || typeof payload.apiKey !== 'string') {
    throw new Error('apiKey payload is required.')
  }

  return {
    apiKey: payload.apiKey,
  }
}

function parseGoalSavePayload(payload: unknown): GoalSavePayload {
  if (!isRecord(payload) || typeof payload.goalText !== 'string') {
    throw new Error('goalText payload is required.')
  }

  return {
    goalText: payload.goalText,
    date: typeof payload.date === 'string' ? payload.date : undefined,
  }
}

function parseDatePayload(payload: unknown): DatePayload {
  if (payload === undefined) {
    return {}
  }

  if (!isRecord(payload)) {
    throw new Error('date payload must be an object when provided.')
  }

  return {
    date: typeof payload.date === 'string' ? payload.date : undefined,
  }
}

function parsePermissionSettingsPayload(payload: unknown): PermissionSettingsPayload {
  if (!isRecord(payload) || (payload.target !== 'screen' && payload.target !== 'accessibility')) {
    throw new Error('target must be either screen or accessibility.')
  }

  return {
    target: payload.target,
  }
}

function parseFeedbackSubmitPayload(payload: unknown): FeedbackSubmitPayload {
  if (!isRecord(payload) || typeof payload.itemType !== 'string' || typeof payload.rating !== 'number') {
    throw new Error('feedback payload is required.')
  }

  return {
    reportId: typeof payload.reportId === 'number' ? payload.reportId : null,
    itemType: payload.itemType,
    rating: payload.rating,
  }
}

function parseOpenClawDelegatePayload(payload: unknown): OpenClawDelegatePayload {
  if (!isRecord(payload) || typeof payload.prompt !== 'string') {
    throw new Error('delegate prompt is required.')
  }

  return {
    prompt: payload.prompt,
  }
}

function registerHandler(
  channel: NamedIpcChannel,
  handler: (payload: unknown) => Promise<unknown> | unknown,
  registeredChannels: NamedIpcChannel[]
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<unknown> => {
    try {
      return await handler(payload)
    } catch (error) {
      const result: IpcErrorResult = { error: toErrorMessage(error) }

      return result
    }
  })
  registeredChannels.push(channel)
}

async function applyRetentionPolicy(
  retentionService: RetentionService | null | undefined,
  preferences: AppPreferences
): Promise<void> {
  if (retentionService === null || retentionService === undefined) {
    return
  }

  try {
    await retentionService.applyPreferences(preferences)
  } catch (error) {
    console.error('Retention cleanup failed.', error)
  }
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): () => void {
  const now = options.now ?? (() => new Date())
  const channels: NamedIpcChannel[] = []

  registerHandler(IPC.PREFS_READ, (): AppPreferences => options.prefsStore.read(), channels)

  registerHandler(IPC.PREFS_WRITE, async (payload: unknown): Promise<AppPreferences> => {
    const nextPreferences = options.prefsStore.write(parsePreferencesPatch(payload))

    await options.scheduler.updateConfig(toSchedulerConfig(nextPreferences))
    await applyRetentionPolicy(options.retentionService, nextPreferences)

    return nextPreferences
  }, channels)

  registerHandler(IPC.API_KEY_GET_STATUS, () => options.secureStore.getApiKeyStatus(), channels)

  registerHandler(IPC.API_KEY_SET, (payload: unknown) => {
    const { apiKey } = parseApiKeyPayload(payload)

    return options.secureStore.setApiKey(apiKey)
  }, channels)

  registerHandler(IPC.API_KEY_CLEAR, () => options.secureStore.clearApiKey(), channels)

  registerHandler(IPC.PERMISSIONS_STATUS, () => options.permissionService.getLiveCaptureStatus(), channels)

  registerHandler(IPC.PERMISSIONS_PROMPT_ACCESSIBILITY, () => {
    return options.permissionService.promptForAccessibility()
  }, channels)

  registerHandler(IPC.PERMISSIONS_OPEN_SETTINGS, async (payload: unknown): Promise<boolean> => {
    const { target } = parsePermissionSettingsPayload(payload)

    return await options.permissionService.openSystemSettings(target)
  }, channels)

  registerHandler(IPC.COLLECT_STATE, (): CollectStateSnapshot => {
    return buildCollectSnapshot(
      options.scheduler,
      options.prefsStore.read(),
      options.permissionService.getLiveCaptureStatus()
    )
  }, channels)

  registerHandler(IPC.COLLECT_START, async (): Promise<CollectStateSnapshot> => {
    const preferences = options.prefsStore.read()

    await options.scheduler.updateConfig(toSchedulerConfig(preferences))
    await applyRetentionPolicy(options.retentionService, preferences)

    const permissions = options.permissionService.getLiveCaptureStatus()

    if (permissions.ready) {
      await options.scheduler.start()
    }

    return buildCollectSnapshot(options.scheduler, preferences, permissions)
  }, channels)

  registerHandler(IPC.COLLECT_STOP, async (): Promise<CollectStateSnapshot> => {
    await options.scheduler.stop()

    return buildCollectSnapshot(
      options.scheduler,
      options.prefsStore.read(),
      options.permissionService.getLiveCaptureStatus()
    )
  }, channels)

  registerHandler(IPC.ACTIVITY_GET_TODAY, (payload: unknown) => {
    const { date } = parseDatePayload(payload)
    const resolvedDate = resolveDateInput(date, now)
    const bounds = getDayBounds(resolvedDate)

    return options.storeService.getActivityEventsByDateRange(bounds.start, bounds.end)
  }, channels)

  registerHandler(IPC.GOALS_GET, (payload: unknown): GoalRecord | null => {
    const { date } = parseDatePayload(payload)
    const resolvedDate = resolveDateInput(date, now)

    return getLatestRecord(options.storeService.getGoalsByDateRange(resolvedDate, resolvedDate))
  }, channels)

  registerHandler(IPC.GOALS_SAVE, async (payload: unknown): Promise<GoalRecord> => {
    const goalPayload = parseGoalSavePayload(payload)
    const goalText = goalPayload.goalText.trim()

    if (goalText.length === 0) {
      throw new Error('goalText cannot be empty.')
    }

    if (options.createAIProvider === null || options.createAIProvider === undefined) {
      throw new Error('Goal structuring is not wired in the main shell yet.')
    }

    const apiKey = options.secureStore.getApiKey()

    if (apiKey === null) {
      throw new Error('Claude API key is not configured.')
    }

    const resolvedDate = resolveDateInput(goalPayload.date, now)
    const structuredGoal = await options.createAIProvider(apiKey).structureGoal(goalText)
    const existingGoal = getLatestRecord(options.storeService.getGoalsByDateRange(resolvedDate, resolvedDate))

    if (existingGoal === null) {
      return options.storeService.insertGoal({
        date: resolvedDate,
        goal_text: structuredGoal.goal_text,
        target_behaviors: structuredGoal.target_behaviors,
        anti_behaviors: structuredGoal.anti_behaviors,
        success_metric: structuredGoal.success_metric,
        created_at: now().toISOString(),
      })
    }

    options.storeService.updateGoal(existingGoal.id, {
      goal_text: structuredGoal.goal_text,
      target_behaviors: structuredGoal.target_behaviors,
      anti_behaviors: structuredGoal.anti_behaviors,
      success_metric: structuredGoal.success_metric,
      created_at: now().toISOString(),
    })

    const updatedGoal = options.storeService.getGoalById(existingGoal.id)

    if (updatedGoal === null) {
      throw new Error('Saved goal could not be loaded.')
    }

    return updatedGoal
  }, channels)

  registerHandler(IPC.REPORT_GET, (payload: unknown): ReportHookResponse => {
    const { date } = parseDatePayload(payload)
    const resolvedDate = resolveDateInput(date, now)
    const report = getLatestRecord(options.storeService.getDailyReportsByDateRange(resolvedDate, resolvedDate))

    return {
      status: report === null ? 'empty' : 'ready',
      date: resolvedDate,
      report,
    }
  }, channels)

  registerHandler(IPC.REPORT_GENERATE, async (payload: unknown): Promise<ReportHookResponse> => {
    const { date } = parseDatePayload(payload)
    const resolvedDate = resolveDateInput(date, now)

    if (options.generateDailyReport === null || options.generateDailyReport === undefined) {
      return {
        status: 'stub',
        date: resolvedDate,
        report: null,
        message: 'Daily report generation is not wired in the live-safe main shell yet.',
      }
    }

    const report = await options.generateDailyReport(resolvedDate)

    return {
      status: 'ready',
      date: resolvedDate,
      report,
    }
  }, channels)

  registerHandler(IPC.TODAY_SUMMARY, (payload: unknown): TodaySummary => {
    const { date } = parseDatePayload(payload)
    const resolvedDate = resolveDateInput(date, now)
    const bounds = getDayBounds(resolvedDate)
    const activities = options.storeService.getActivityEventsByDateRange(bounds.start, bounds.end)
    const analyses = options.storeService.getScreenshotAnalysesByDateRange(bounds.start, bounds.end)
    const goal = getLatestRecord(options.storeService.getGoalsByDateRange(resolvedDate, resolvedDate))
    const report = getLatestRecord(options.storeService.getDailyReportsByDateRange(resolvedDate, resolvedDate))

    return {
      date: resolvedDate,
      collect: buildCollectSnapshot(
        options.scheduler,
        options.prefsStore.read(),
        options.permissionService.getLiveCaptureStatus()
      ),
      goalText: goal?.goal_text ?? null,
      reportSummary:
        buildTodaySummaryPreview({
          goal,
          activityEvents: activities,
          screenshotAnalyses: analyses,
          report
        }) ?? null,
      activityCount: activities.length,
      screenshotAnalysisCount: analyses.length,
    }
  }, channels)

  registerHandler(IPC.FEEDBACK_SUBMIT, (payload: unknown): FeedbackSubmitResult => {
    const feedback = parseFeedbackSubmitPayload(payload)
    const itemType = feedback.itemType.trim()

    if (itemType.length === 0) {
      throw new Error('itemType cannot be empty.')
    }

    if (!Number.isInteger(feedback.rating) || ![-1, 1].includes(feedback.rating)) {
      throw new Error('rating must be either -1 or 1.')
    }

    const existingFeedback = getLatestRecord(
      options.storeService
        .getFeedbackByDateRange('0000-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z')
        .filter((record) => record.report_id === (feedback.reportId ?? null) && record.item_type === itemType)
    )

    if (existingFeedback !== null && existingFeedback.rating === feedback.rating) {
      options.storeService.deleteFeedback(existingFeedback.id)

      return {
        status: 'cleared',
        feedback: null,
        itemType,
        rating: null
      }
    }

    if (existingFeedback !== null) {
      options.storeService.updateFeedback(existingFeedback.id, {
        rating: feedback.rating,
        created_at: now().toISOString()
      })

      const updatedFeedback = options.storeService.getFeedbackById(existingFeedback.id)

      if (updatedFeedback === null) {
        throw new Error('Feedback update could not be loaded.')
      }

      return {
        status: 'saved',
        feedback: updatedFeedback,
        itemType,
        rating: updatedFeedback.rating
      }
    }

    const createdFeedback = options.storeService.insertFeedback({
      report_id: feedback.reportId ?? null,
      item_type: itemType,
      rating: feedback.rating,
      created_at: now().toISOString()
    })

    return {
      status: 'saved',
      feedback: createdFeedback,
      itemType,
      rating: createdFeedback.rating
    }
  }, channels)

  registerHandler(IPC.OPENCLAW_DELEGATE, async (payload: unknown): Promise<OpenClawDelegateResponse> => {
    const { prompt } = parseOpenClawDelegatePayload(payload)
    return await delegateToOpenClaw({ prompt }, now)
  }, channels)

  registerHandler(IPC.VIDEO_CHECK_FFMPEG, async (): Promise<{ installed: boolean }> => {
    const processor = new VideoProcessor()
    const installed = await processor.checkFfmpegInstalled()

    return { installed }
  }, channels)

  registerHandler('video:select-file' as NamedIpcChannel, async (): Promise<{ filePath: string | null }> => {
    const mainWindow = options.getMainWindow?.()

    if (mainWindow === null || mainWindow === undefined) {
      throw new Error('Main window is not available.')
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select video file',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { filePath: null }
    }

    return { filePath: result.filePaths[0] ?? null }
  }, channels)

  registerHandler(IPC.VIDEO_IMPORT, async (payload: unknown): Promise<VideoImportResult> => {
    if (!isRecord(payload) || typeof payload.filePath !== 'string') {
      throw new Error('filePath payload is required.')
    }

    const filePath = payload.filePath as string

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    if (!isSupportedVideoExtension(filePath)) {
      throw new Error('Unsupported video format. Supported: .mp4, .mov, .webm, .avi, .mkv')
    }

    const apiKey = options.secureStore.getApiKey()

    if (apiKey === null) {
      throw new Error('Claude API key is not configured. Please set it in Settings.')
    }

    if (options.createAIProvider === null || options.createAIProvider === undefined) {
      throw new Error('AI provider is not available.')
    }

    const processor = new VideoProcessor()
    const installed = await processor.checkFfmpegInstalled()

    if (!installed) {
      throw new Error('ffmpeg is not installed. Install it with: brew install ffmpeg')
    }

    const preferences = options.prefsStore.read()
    const intervalSec = preferences.captureIntervalMinutes * 60

    const sendProgress = (event: VideoProgressEvent): void => {
      try {
        const mainWindow = options.getMainWindow?.()

        if (mainWindow !== null && mainWindow !== undefined && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC.VIDEO_PROGRESS, event)
        }
      } catch {
        // Progress send failure is non-fatal
      }
    }

    console.log(`[video-import] Extracting frames from: ${filePath} (interval: ${intervalSec}s)`)
    sendProgress({ current: 0, total: 0, currentTimestamp: '0:00:00', phase: 'extracting' })

    const extractResult = await processor.extractFrames(filePath, intervalSec)
    const { frames, outputDirectory, durationSec } = extractResult
    const total = frames.length

    console.log(`[video-import] Extracted ${total} frames (duration: ${formatVideoTimestamp(durationSec)})`)

    const pipeline = new AIPipeline({
      aiProvider: options.createAIProvider(apiKey),
      storeService: options.storeService
    })

    // Anchor timestamps to today so that report generation (which queries by date) finds them.
    const todayBase = now()
    todayBase.setHours(0, 0, 0, 0)

    let framesProcessed = 0

    try {
      for (const frame of frames) {
        const videoTimestamp = formatVideoTimestamp(frame.videoTimestampSec)

        console.log(`[video-import] Analyzing frame ${framesProcessed + 1}/${total} (${videoTimestamp})`)
        sendProgress({ current: framesProcessed + 1, total, currentTimestamp: videoTimestamp, phase: 'analyzing' })

        const pngBuffer = await readFile(frame.path)
        const processed = await processScreenshot(pngBuffer)
        const screenshotPath = await saveScreenshotToTemp(processed.buffer)

        // Use today's date + video offset so analyses fall within today's date range
        const frameTimestamp = new Date(todayBase.getTime() + frame.videoTimestampSec * 1000)

        await pipeline.processScreenshots(
          [
            {
              displayId: 0,
              image: processed.buffer,
              screenshotPath,
              pngPath: frame.path,
              width: processed.width,
              height: processed.height,
              bytes: processed.bytes,
              format: processed.format
            }
          ],
          {
            timestamp: frameTimestamp.toISOString(),
            application: 'Video Import',
            contextSwitchAppName: 'Video Import',
            contextSwitchDurationSec: intervalSec
          }
        )

        framesProcessed++
        console.log(`[video-import] Frame ${framesProcessed}/${total} complete`)
      }
    } finally {
      try {
        await rm(outputDirectory, { recursive: true, force: true })
      } catch {
        // Cleanup failure is non-fatal
      }
    }

    console.log(`[video-import] Complete: ${framesProcessed}/${total} frames analyzed`)

    // Auto-generate the daily report so it's ready when the user opens Report view
    if (framesProcessed > 0 && options.generateDailyReport !== null && options.generateDailyReport !== undefined) {
      try {
        const reportDate = toLocalDateString(now())
        console.log(`[video-import] Auto-generating daily report for ${reportDate}`)
        await options.generateDailyReport(reportDate)
        console.log(`[video-import] Daily report generated successfully`)
      } catch (reportError) {
        console.error('[video-import] Auto report generation failed:', reportError)
        // Non-fatal — analyses are still saved
      }
    }

    return {
      status: 'complete',
      framesProcessed,
      framesTotal: total,
      durationSec
    }
  }, channels)

  return (): void => {
    for (const channel of channels) {
      ipcMain.removeHandler(channel)
    }
  }
}

function formatVideoTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
