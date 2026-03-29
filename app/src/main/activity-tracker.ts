import { execFile } from 'node:child_process'
import type { ExecFileException } from 'node:child_process'

import type { ActivityEvent } from '../shared/types'

const DEFAULT_POLL_INTERVAL_MS = 30_000
const DEFAULT_COMMAND_TIMEOUT_MS = 2_000
const MAX_COMMAND_BUFFER_BYTES = 64 * 1024

const MACOS_ACTIVE_WINDOW_JXA = [
  "const systemEvents = Application('System Events');",
  'const frontmostProcess = systemEvents.applicationProcesses.whose({ frontmost: true })[0];',
  'const appName = frontmostProcess ? frontmostProcess.name() : null;',
  'let windowTitle = null;',
  'if (frontmostProcess) {',
  '  try {',
  '    const windows = frontmostProcess.windows();',
  '    if (windows.length > 0) {',
  '      windowTitle = windows[0].name();',
  '    }',
  '  } catch (error) {',
  '    windowTitle = null;',
  '  }',
  '}',
  'JSON.stringify({ appName, windowTitle });'
].join(' ')

export type WindowWatcherState = 'stopped' | 'running' | 'paused'

export type WindowWatcherErrorCode =
  | 'invalid_interval'
  | 'invalid_response'
  | 'permission_denied'
  | 'poll_failed'
  | 'poll_timeout'
  | 'unsupported_platform'

export interface WindowWatcherWindowInfo {
  appName: string | null
  windowTitle: string | null
}

export interface WindowWatcherSnapshot extends WindowWatcherWindowInfo {
  timestamp: string
}

export interface WindowWatcherSample extends WindowWatcherSnapshot {
  durationSec: number
  hasChanged: boolean
  previous: WindowWatcherSnapshot | null
}

export interface MacOSActiveWindowReaderOptions {
  timeoutMs?: number
}

export interface WindowWatcherPersistencePort {
  persistActivityEvent(event: ActivityEvent, sample: WindowWatcherSample): void | Promise<void>
}

export type WindowWatcherReader = () => Promise<WindowWatcherWindowInfo>
export type WindowWatcherSampleHandler = (sample: WindowWatcherSample) => void | Promise<void>
export type WindowWatcherErrorHandler = (error: WindowWatcherError) => void | Promise<void>

export interface WindowWatcherOptions {
  pollIntervalMs?: number
  readWindow?: WindowWatcherReader
  persistence?: WindowWatcherPersistencePort
  onError?: WindowWatcherErrorHandler
  onSample?: WindowWatcherSampleHandler
  now?: () => Date
}

export class WindowWatcherError extends Error {
  public readonly code: WindowWatcherErrorCode

  public constructor(code: WindowWatcherErrorCode, message: string) {
    super(message)
    this.name = 'WindowWatcherError'
    this.code = code
  }
}

export async function readMacOSActiveWindow(
  options: MacOSActiveWindowReaderOptions = {}
): Promise<WindowWatcherWindowInfo> {
  if (process.platform !== 'darwin') {
    throw new WindowWatcherError(
      'unsupported_platform',
      'WindowWatcher only supports macOS active-window polling in the live-safe path.'
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
  try {
    const stdout = await execFileText('osascript', ['-l', 'JavaScript', '-e', MACOS_ACTIVE_WINDOW_JXA], timeoutMs)

    return parseWindowInfo(stdout)
  } catch (error) {
    throw toWindowWatcherError(error)
  }
}

export class WindowWatcher {
  private readonly readWindow: WindowWatcherReader

  private readonly persistence: WindowWatcherPersistencePort | null

  private readonly onError: WindowWatcherErrorHandler | null

  private readonly onSample: WindowWatcherSampleHandler | null

  private readonly now: () => Date

  private readonly pollIntervalMs: number

  private inflightPoll: Promise<WindowWatcherSample | null> | null = null

  private latestSample: WindowWatcherSample | null = null

  private state: WindowWatcherState = 'stopped'

  private timer: ReturnType<typeof setTimeout> | null = null

  public constructor(options: WindowWatcherOptions = {}) {
    this.pollIntervalMs = normalizePollInterval(options.pollIntervalMs)
    this.readWindow = options.readWindow ?? (() => readMacOSActiveWindow())
    this.persistence = options.persistence ?? null
    this.onError = options.onError ?? null
    this.onSample = options.onSample ?? null
    this.now = options.now ?? (() => new Date())
  }

  public static toActivityEvent(sample: WindowWatcherSample): ActivityEvent {
    return {
      timestamp: sample.timestamp,
      app_name: sample.appName,
      window_title: sample.windowTitle,
      category: null,
      duration_sec: sample.durationSec
    }
  }

  public getLatestSample(): WindowWatcherSample | null {
    return this.latestSample
  }

  public getState(): WindowWatcherState {
    return this.state
  }

  public async pollNow(): Promise<WindowWatcherSample | null> {
    if (this.inflightPoll !== null) {
      return this.inflightPoll
    }

    this.inflightPoll = this.performPoll()

    try {
      return await this.inflightPoll
    } finally {
      this.inflightPoll = null
    }
  }

  public async start(): Promise<void> {
    if (this.state === 'running') {
      return
    }

    if (this.state === 'stopped') {
      this.latestSample = null
    }

    this.clearTimer()
    this.state = 'running'

    await this.pollNow()
    this.scheduleNextPoll()
  }

  public async pause(): Promise<void> {
    if (this.state !== 'running') {
      return
    }

    this.state = 'paused'
    this.clearTimer()
    await this.awaitInflightPoll()
  }

  public async resume(): Promise<void> {
    if (this.state !== 'paused') {
      return
    }

    this.state = 'running'

    await this.pollNow()
    this.scheduleNextPoll()
  }

  public async stop(): Promise<void> {
    this.state = 'stopped'
    this.clearTimer()
    await this.awaitInflightPoll()
  }

  private async performPoll(): Promise<WindowWatcherSample | null> {
    try {
      const windowInfo = await this.readWindow()
      const sample = this.buildSample(windowInfo)

      this.latestSample = sample
      await this.persistSample(sample)

      return sample
    } catch (error) {
      await this.reportError(toWindowWatcherError(error))

      return null
    }
  }

  private buildSample(windowInfo: WindowWatcherWindowInfo): WindowWatcherSample {
    const previous = this.latestSample === null ? null : toSnapshot(this.latestSample)
    const timestamp = this.now().toISOString()

    return {
      timestamp,
      appName: sanitizeWindowText(windowInfo.appName),
      windowTitle: sanitizeWindowText(windowInfo.windowTitle),
      durationSec: Math.max(1, Math.round(this.pollIntervalMs / 1000)),
      hasChanged:
        previous === null ||
        previous.appName !== sanitizeWindowText(windowInfo.appName) ||
        previous.windowTitle !== sanitizeWindowText(windowInfo.windowTitle),
      previous
    }
  }

  private async persistSample(sample: WindowWatcherSample): Promise<void> {
    if (this.persistence !== null) {
      await this.persistence.persistActivityEvent(WindowWatcher.toActivityEvent(sample), sample)
    }

    if (this.onSample !== null) {
      await this.onSample(sample)
    }
  }

  private async reportError(error: WindowWatcherError): Promise<void> {
    if (this.onError === null) {
      return
    }

    try {
      await this.onError(error)
    } catch (hookError) {
      console.error('WindowWatcher onError handler failed.', hookError)
    }
  }

  private scheduleNextPoll(): void {
    if (this.state !== 'running') {
      return
    }

    this.clearTimer()
    this.timer = setTimeout(() => {
      void this.handleScheduledPoll()
    }, this.pollIntervalMs)
  }

  private async handleScheduledPoll(): Promise<void> {
    await this.pollNow()

    if (this.state === 'running') {
      this.scheduleNextPoll()
    }
  }

  private async awaitInflightPoll(): Promise<void> {
    if (this.inflightPoll === null) {
      return
    }

    await this.inflightPoll
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return
    }

    clearTimeout(this.timer)
    this.timer = null
  }
}

function normalizePollInterval(pollIntervalMs: number | undefined): number {
  const candidate = pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

  if (!Number.isInteger(candidate) || candidate <= 0) {
    throw new WindowWatcherError('invalid_interval', 'WindowWatcher pollIntervalMs must be a positive integer.')
  }

  return candidate
}

function toSnapshot(sample: WindowWatcherSample): WindowWatcherSnapshot {
  return {
    timestamp: sample.timestamp,
    appName: sample.appName,
    windowTitle: sample.windowTitle
  }
}

function parseWindowInfo(stdout: string): WindowWatcherWindowInfo {
  let parsed: unknown

  try {
    parsed = JSON.parse(stdout.trim())
  } catch (parseError) {
    void parseError
    throw new WindowWatcherError('invalid_response', 'Active-window polling returned invalid JSON output.')
  }

  if (!isWindowInfoPayload(parsed)) {
    throw new WindowWatcherError('invalid_response', 'Active-window polling returned an unexpected payload.')
  }

  return {
    appName: sanitizeWindowText(parsed.appName),
    windowTitle: sanitizeWindowText(parsed.windowTitle)
  }
}

function isWindowInfoPayload(value: unknown): value is WindowWatcherWindowInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const payload = value as Record<string, unknown>

  return isNullableString(payload.appName) && isNullableString(payload.windowTitle)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function sanitizeWindowText(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim()

  return normalized.length > 0 ? normalized : null
}

function toWindowWatcherError(error: unknown): WindowWatcherError {
  if (error instanceof WindowWatcherError) {
    return error
  }

  if (isExecFileException(error)) {
    return normalizeExecFileError(error)
  }

  return new WindowWatcherError('poll_failed', getErrorMessage(error, 'Active-window polling failed.'))
}

function isExecFileException(error: unknown): error is ExecFileException {
  if (!(error instanceof Error)) {
    return false
  }

  return 'cmd' in error || 'signal' in error || 'code' in error || 'killed' in error
}

function normalizeExecFileError(error: ExecFileException): WindowWatcherError {
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : ''
  const detail = stderr.length > 0 ? `${stderr} (${error.message})` : error.message

  if (error.killed || error.signal === 'SIGTERM' || error.message.includes('timed out')) {
    return new WindowWatcherError(
      'poll_timeout',
      'Timed out while reading the active macOS window. Check Accessibility or Automation permissions before starting live capture.'
    )
  }

  if (stderr.includes('Not authorized') || stderr.includes('1743') || stderr.includes('AppleEvent handler failed')) {
    return new WindowWatcherError(
      'permission_denied',
      'macOS denied access to System Events. Enable Accessibility and Automation permissions for live window polling.'
    )
  }

  return new WindowWatcherError('poll_failed', `Failed to read the active macOS window. ${detail}`)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallback
}

function execFileText(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: 'utf8',
        maxBuffer: MAX_COMMAND_BUFFER_BYTES,
        timeout: timeoutMs
      },
      (error, stdout, stderr) => {
        const stdoutText = stdout
        const stderrText = stderr.trim()

        if (error !== null) {
          if (stderrText.length > 0) {
            error.stderr = stderrText
          }

          reject(error)
          return
        }

        resolve(stdoutText)
      }
    )
  })
}
