import type { DailyReport, Feedback, Goal } from '../../../shared/types'

export interface IpcErrorResult {
  error: string
}

export interface AppPreferences {
  captureIntervalMinutes: number
  watcherPollSeconds: number
  autoBriefingEnabled: boolean
  autoBriefingTime: string
  screenshotRetentionDays: number
  activityRetentionDays: number
}

export interface AppPreferencesPatch {
  captureIntervalMinutes?: number
  watcherPollSeconds?: number
  autoBriefingEnabled?: boolean
  autoBriefingTime?: string
  screenshotRetentionDays?: number
  activityRetentionDays?: number
}

export interface ApiKeyStatus {
  storageAvailable: boolean
  isConfigured: boolean
  maskedValue: string | null
}

export type ScreenPermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'
export type PermissionTarget = 'screen' | 'accessibility'
export type CollectRunState = 'stopped' | 'running' | 'paused'

export interface LiveCapturePermissionStatus {
  screen: ScreenPermissionState
  accessibility: boolean
  ready: boolean
}

export interface CollectStateSnapshot {
  state: CollectRunState
  permissions: LiveCapturePermissionStatus
  preferences: AppPreferences
  lastCaptureAt: string | null
  nextCaptureAt: string | null
  lastReportTriggerAt: string | null
  nextReportTriggerAt: string | null
}

export interface TodaySummary {
  date: string
  collect: CollectStateSnapshot
  goalText: string | null
  reportSummary: string | null
  activityCount: number
  screenshotAnalysisCount: number
}

export interface ReportHookResponse {
  status: 'ready' | 'empty' | 'stub'
  date: string
  report: DailyReport | null
  message?: string
}

export interface FeedbackSubmitPayload {
  reportId?: number | null
  itemType: string
  rating: 1 | -1
}

export interface FeedbackSubmitResult {
  status: 'saved' | 'cleared'
  feedback: Feedback | null
  itemType: string
  rating: 1 | -1 | null
}

export interface OpenClawDelegateResult {
  status: 'simulated'
  accepted: true
  dispatched: false
  prompt: string
  requestId: string
  createdAt: string
  message: string
  simulation: {
    source: string
    capability: string
    liveIntegrationAvailable: boolean
    reason: string
    realPathExpectation: string
  }
}

export interface ApiResult<T> {
  data: T | null
  error: string | null
}

export interface VideoImportResult {
  status: 'complete' | 'error'
  framesProcessed: number
  framesTotal: number
  durationSec: number
}

export interface VideoProgressEvent {
  current: number
  total: number
  currentTimestamp: string
  phase: 'extracting' | 'analyzing'
}

export interface ElectronAPI {
  prefs: {
    read: () => Promise<AppPreferences | IpcErrorResult>
    write: (patch: AppPreferencesPatch) => Promise<AppPreferences | IpcErrorResult>
  }
  apiKey: {
    getStatus: () => Promise<ApiKeyStatus | IpcErrorResult>
    save: (apiKey: string) => Promise<ApiKeyStatus | IpcErrorResult>
    clear: () => Promise<ApiKeyStatus | IpcErrorResult>
  }
  permissions: {
    getStatus: () => Promise<LiveCapturePermissionStatus | IpcErrorResult>
    promptAccessibility: () => Promise<LiveCapturePermissionStatus | IpcErrorResult>
    openSystemSettings: (target: PermissionTarget) => Promise<boolean | IpcErrorResult>
  }
  collect: {
    start: () => Promise<CollectStateSnapshot | IpcErrorResult>
    stop: () => Promise<CollectStateSnapshot | IpcErrorResult>
    state: () => Promise<CollectStateSnapshot | IpcErrorResult>
  }
  activity: {
    getToday: (date?: string) => Promise<unknown>
  }
  goals: {
    save: (goalText: string, date?: string) => Promise<Goal | IpcErrorResult>
    get: (date?: string) => Promise<Goal | null | IpcErrorResult>
  }
  report: {
    generate: (date?: string) => Promise<ReportHookResponse | IpcErrorResult>
    get: (date?: string) => Promise<ReportHookResponse | IpcErrorResult>
  }
  today: {
    summary: (date?: string) => Promise<TodaySummary | IpcErrorResult>
  }
  feedback: {
    submit: (payload: FeedbackSubmitPayload) => Promise<FeedbackSubmitResult | IpcErrorResult>
  }
  openclaw: {
    delegate: (prompt: string) => Promise<OpenClawDelegateResult | IpcErrorResult>
  }
  video: {
    checkFfmpeg: () => Promise<{ installed: boolean } | IpcErrorResult>
    import: (filePath: string) => Promise<VideoImportResult | IpcErrorResult>
    onProgress: (callback: (...args: unknown[]) => void) => () => void
    selectFile: () => Promise<{ filePath: string | null } | IpcErrorResult>
  }
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  captureIntervalMinutes: 5,
  watcherPollSeconds: 30,
  autoBriefingEnabled: true,
  autoBriefingTime: '18:00',
  screenshotRetentionDays: 30,
  activityRetentionDays: 90
}

export const DEFAULT_API_KEY_STATUS: ApiKeyStatus = {
  storageAvailable: false,
  isConfigured: false,
  maskedValue: null
}

export const DEFAULT_PERMISSION_STATUS: LiveCapturePermissionStatus = {
  screen: 'unknown',
  accessibility: false,
  ready: false
}

export const DEFAULT_COLLECT_STATE: CollectStateSnapshot = {
  state: 'stopped',
  permissions: DEFAULT_PERMISSION_STATUS,
  preferences: DEFAULT_PREFERENCES,
  lastCaptureAt: null,
  nextCaptureAt: null,
  lastReportTriggerAt: null,
  nextReportTriggerAt: null
}

export const DEFAULT_TODAY_SUMMARY: TodaySummary = {
  date: '',
  collect: DEFAULT_COLLECT_STATE,
  goalText: null,
  reportSummary: null,
  activityCount: 0,
  screenshotAnalysisCount: 0
}

export const DEFAULT_REPORT_RESPONSE: ReportHookResponse = {
  status: 'empty',
  date: '',
  report: null
}

const MISSING_BRIDGE_MESSAGE = 'Preload-safe IPC bridge is unavailable.'

function isErrorResult(value: unknown): value is IpcErrorResult {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function getElectronAPI(): ElectronAPI | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.electronAPI ?? null
}

async function callApi<T>(
  label: string,
  callback: (api: ElectronAPI) => Promise<T | IpcErrorResult>
): Promise<ApiResult<T>> {
  const api = getElectronAPI()

  if (api === null) {
    return {
      data: null,
      error: MISSING_BRIDGE_MESSAGE
    }
  }

  try {
    const result = await callback(api)

    if (isErrorResult(result)) {
      return {
        data: null,
        error: result.error
      }
    }

    return {
      data: result,
      error: null
    }
  } catch (error: unknown) {
    return {
      data: null,
      error: toErrorMessage(error, `${label} failed.`)
    }
  }
}

export function isBridgeAvailable(): boolean {
  return getElectronAPI() !== null
}

export async function readPreferences(): Promise<ApiResult<AppPreferences>> {
  return callApi('Preferences read', (api) => api.prefs.read())
}

export async function writePreferences(patch: AppPreferencesPatch): Promise<ApiResult<AppPreferences>> {
  return callApi('Preferences write', (api) => api.prefs.write(patch))
}

export async function getApiKeyStatus(): Promise<ApiResult<ApiKeyStatus>> {
  return callApi('API key status', (api) => api.apiKey.getStatus())
}

export async function saveApiKey(apiKey: string): Promise<ApiResult<ApiKeyStatus>> {
  return callApi('API key save', (api) => api.apiKey.save(apiKey))
}

export async function clearApiKey(): Promise<ApiResult<ApiKeyStatus>> {
  return callApi('API key clear', (api) => api.apiKey.clear())
}

export async function readPermissions(): Promise<ApiResult<LiveCapturePermissionStatus>> {
  return callApi('Permissions read', (api) => api.permissions.getStatus())
}

export async function promptAccessibilityPermission(): Promise<ApiResult<LiveCapturePermissionStatus>> {
  return callApi('Accessibility prompt', (api) => api.permissions.promptAccessibility())
}

export async function openPermissionSettings(target: PermissionTarget): Promise<ApiResult<boolean>> {
  return callApi('Open System Settings', (api) => api.permissions.openSystemSettings(target))
}

export async function readCollectState(): Promise<ApiResult<CollectStateSnapshot>> {
  return callApi('Collect state', (api) => api.collect.state())
}

export async function startCollect(): Promise<ApiResult<CollectStateSnapshot>> {
  return callApi('Collect start', (api) => api.collect.start())
}

export async function stopCollect(): Promise<ApiResult<CollectStateSnapshot>> {
  return callApi('Collect stop', (api) => api.collect.stop())
}

export async function getGoal(): Promise<ApiResult<Goal | null>> {
  return callApi('Goal read', (api) => api.goals.get())
}

export async function saveGoal(goalText: string): Promise<ApiResult<Goal>> {
  return callApi('Goal save', (api) => api.goals.save(goalText))
}

export async function getReport(date?: string): Promise<ApiResult<ReportHookResponse>> {
  return callApi('Report read', (api) => api.report.get(date))
}

export async function generateReport(date?: string): Promise<ApiResult<ReportHookResponse>> {
  return callApi('Report generate', (api) => api.report.generate(date))
}

export async function getTodaySummary(): Promise<ApiResult<TodaySummary>> {
  return callApi('Today summary', (api) => api.today.summary())
}

export async function submitFeedback(payload: FeedbackSubmitPayload): Promise<ApiResult<FeedbackSubmitResult>> {
  return callApi('Feedback submit', (api) => api.feedback.submit(payload))
}

export async function delegateToOpenClaw(prompt: string): Promise<ApiResult<OpenClawDelegateResult>> {
  return callApi('OpenClaw delegate', (api) => api.openclaw.delegate(prompt))
}

export async function checkFfmpeg(): Promise<ApiResult<{ installed: boolean }>> {
  return callApi('ffmpeg check', (api) => api.video.checkFfmpeg())
}

export async function importVideo(filePath: string): Promise<ApiResult<VideoImportResult>> {
  return callApi('Video import', (api) => api.video.import(filePath))
}

export async function selectVideoFile(): Promise<ApiResult<{ filePath: string | null }>> {
  return callApi('Video file select', (api) => api.video.selectFile())
}

export function subscribeVideoProgress(callback: (event: VideoProgressEvent) => void): () => void {
  const api = getElectronAPI()

  if (api === null) {
    return () => {}
  }

  return api.video.onProgress((_ipcEvent: unknown, event: unknown) => {
    const progress = event as VideoProgressEvent
    callback(progress)
  })
}
