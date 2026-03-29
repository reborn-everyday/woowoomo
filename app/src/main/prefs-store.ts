import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { app } from 'electron'

import type { SchedulerConfigInput } from './scheduler'

const PREFS_FILE_NAME = 'prefs.json'
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

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

interface PrefsFilePayload {
  version: 1
  preferences: AppPreferences
}

const DEFAULT_PREFERENCES: Readonly<AppPreferences> = Object.freeze({
  captureIntervalMinutes: 5,
  watcherPollSeconds: 30,
  autoBriefingEnabled: true,
  autoBriefingTime: '18:00',
  screenshotRetentionDays: 30,
  activityRetentionDays: 90,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clonePreferences(preferences: AppPreferences): AppPreferences {
  return { ...preferences }
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function getDefaultPrefsPath(): string {
  return join(app.getPath('userData'), PREFS_FILE_NAME)
}

function readIntegerWithFallback(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function readBooleanWithFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readTimeWithFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback
}

function requireInteger(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`)
  }

  return value
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`)
  }

  return value
}

function requireTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new Error(`${label} must use HH:MM 24-hour format.`)
  }

  return value
}

function normalizeStoredPreferences(value: unknown): AppPreferences {
  const payload = isRecord(value) && isRecord(value.preferences) ? value.preferences : value

  if (!isRecord(payload)) {
    return clonePreferences(DEFAULT_PREFERENCES)
  }

  return {
    captureIntervalMinutes: readIntegerWithFallback(
      payload.captureIntervalMinutes,
      1,
      15,
      DEFAULT_PREFERENCES.captureIntervalMinutes
    ),
    watcherPollSeconds: readIntegerWithFallback(
      payload.watcherPollSeconds,
      10,
      120,
      DEFAULT_PREFERENCES.watcherPollSeconds
    ),
    autoBriefingEnabled: readBooleanWithFallback(
      payload.autoBriefingEnabled,
      DEFAULT_PREFERENCES.autoBriefingEnabled
    ),
    autoBriefingTime: readTimeWithFallback(payload.autoBriefingTime, DEFAULT_PREFERENCES.autoBriefingTime),
    screenshotRetentionDays: readIntegerWithFallback(
      payload.screenshotRetentionDays,
      1,
      365,
      DEFAULT_PREFERENCES.screenshotRetentionDays
    ),
    activityRetentionDays: readIntegerWithFallback(
      payload.activityRetentionDays,
      1,
      365,
      DEFAULT_PREFERENCES.activityRetentionDays
    ),
  }
}

function applyPatch(current: AppPreferences, patch: AppPreferencesPatch): AppPreferences {
  const next = clonePreferences(current)

  if (patch.captureIntervalMinutes !== undefined) {
    next.captureIntervalMinutes = requireInteger(
      patch.captureIntervalMinutes,
      1,
      15,
      'captureIntervalMinutes'
    )
  }

  if (patch.watcherPollSeconds !== undefined) {
    next.watcherPollSeconds = requireInteger(patch.watcherPollSeconds, 10, 120, 'watcherPollSeconds')
  }

  if (patch.autoBriefingEnabled !== undefined) {
    next.autoBriefingEnabled = requireBoolean(patch.autoBriefingEnabled, 'autoBriefingEnabled')
  }

  if (patch.autoBriefingTime !== undefined) {
    next.autoBriefingTime = requireTime(patch.autoBriefingTime, 'autoBriefingTime')
  }

  if (patch.screenshotRetentionDays !== undefined) {
    next.screenshotRetentionDays = requireInteger(
      patch.screenshotRetentionDays,
      1,
      365,
      'screenshotRetentionDays'
    )
  }

  if (patch.activityRetentionDays !== undefined) {
    next.activityRetentionDays = requireInteger(patch.activityRetentionDays, 1, 365, 'activityRetentionDays')
  }

  return next
}

export function buildDefaultPreferences(): AppPreferences {
  return clonePreferences(DEFAULT_PREFERENCES)
}

export function toSchedulerConfig(preferences: AppPreferences): SchedulerConfigInput {
  return {
    pollIntervalMs: preferences.watcherPollSeconds * 1000,
    captureIntervalMs: preferences.captureIntervalMinutes * 60_000,
    autoBriefing: {
      enabled: preferences.autoBriefingEnabled,
      briefingTime: preferences.autoBriefingTime,
    },
  }
}

export class PrefsStore {
  private readonly filePath: string

  public constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultPrefsPath()
    ensureParentDirectory(this.filePath)
  }

  public read(): AppPreferences {
    if (!existsSync(this.filePath)) {
      return buildDefaultPreferences()
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown

      return normalizeStoredPreferences(parsed)
    } catch (parseError) {
      console.error('PrefsStore payload could not be parsed. Falling back to defaults.', parseError)
      return buildDefaultPreferences()
    }
  }

  public write(patch: AppPreferencesPatch): AppPreferences {
    const next = applyPatch(this.read(), patch)
    const payload: PrefsFilePayload = {
      version: 1,
      preferences: next,
    }

    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8')

    return clonePreferences(next)
  }
}
