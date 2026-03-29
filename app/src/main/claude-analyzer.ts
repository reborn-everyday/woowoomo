import { Buffer } from 'node:buffer'

import { CategorySchema, VisionBatchSchema } from '../shared/schemas'
import type { AIProvider, CategorizationResponse, VisionResponse } from '../shared/types'
import type { ActivityEventRecord, ScreenshotAnalysisRecord } from './db'
import { StoreService } from './db'
import type { PreparedDisplayCapture } from './screen-capture'

const DEFAULT_CONTEXT_SWITCH_APP_NAME = 'YouTube (조코딩)'
const DEFAULT_CONTEXT_SWITCH_DURATION_SEC = 300

export interface PreparedScreenshotInput extends PreparedDisplayCapture {
  timestamp?: string
  application?: string | null
}

export interface ProcessScreenshotsOptions {
  timestamp?: string
  application?: string | null
  contextSwitchAppName?: string | null
  contextSwitchDurationSec?: number
}

export interface AIPipelineOptions {
  aiProvider: AIProvider
  storeService: StoreService
  now?: () => Date
}

export interface NormalizedPreparedScreenshot {
  displayId: number
  image: Buffer
  screenshotPath: string
  timestamp: string
  application: string | null
}

export interface ProcessedScreenshotAnalysis {
  input: NormalizedPreparedScreenshot
  description: string
  vision: VisionResponse
  categorization: CategorizationResponse
  record: ScreenshotAnalysisRecord
  contextSwitchEvent: ActivityEventRecord | null
}

export interface ProcessScreenshotsResult {
  analyses: ProcessedScreenshotAnalysis[]
  persistedCount: number
  contextSwitchCount: number
}

interface ContextSwitchOptions {
  currentCategory: CategorizationResponse['category']
  currentTimestamp: string
  durationSec: number
  appName: string | null
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function normalizeTimestamp(value: string | undefined, fallback: string, label: string): string {
  if (value === undefined) {
    return fallback
  }

  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO-8601 timestamp.`)
  }

  return value
}

function normalizeContextSwitchDurationSec(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_CONTEXT_SWITCH_DURATION_SEC
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('contextSwitchDurationSec must be greater than 0.')
  }

  return Math.max(1, Math.round(value))
}

function buildCategorizationDescription(vision: VisionResponse): string {
  return [
    `Task: ${vision.current_task}`,
    `Tool in video: ${vision.tool_in_video}`,
    `Task state: ${vision.task_state}`,
    `Initial category guess: ${vision.category}`,
    `Notes: ${vision.notes}`
  ].join('\n')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error.'
}

function normalizePreparedScreenshots(
  screenshots: readonly PreparedScreenshotInput[],
  options: ProcessScreenshotsOptions,
  now: () => Date
): NormalizedPreparedScreenshot[] {
  const batchTimestamp = normalizeTimestamp(options.timestamp, now().toISOString(), 'options.timestamp')

  return screenshots.map((screenshot, index) => {
    if (!Buffer.isBuffer(screenshot.image) || screenshot.image.length === 0) {
      throw new Error(`Prepared screenshot ${index + 1} is missing image bytes.`)
    }

    return {
      displayId: screenshot.displayId,
      image: screenshot.image,
      screenshotPath: screenshot.screenshotPath,
      timestamp: normalizeTimestamp(screenshot.timestamp, batchTimestamp, `screenshots[${index}].timestamp`),
      application: normalizeNullableText(screenshot.application ?? options.application)
    }
  })
}

export class AIPipeline {
  private readonly aiProvider: AIProvider

  private readonly now: () => Date

  private readonly storeService: StoreService

  public constructor(options: AIPipelineOptions) {
    this.aiProvider = options.aiProvider
    this.storeService = options.storeService
    this.now = options.now ?? (() => new Date())
  }

  public async processScreenshots(
    screenshots: readonly PreparedScreenshotInput[],
    options: ProcessScreenshotsOptions = {}
  ): Promise<ProcessScreenshotsResult> {
    const preparedScreenshots = normalizePreparedScreenshots(screenshots, options, this.now)

    if (preparedScreenshots.length === 0) {
      return {
        analyses: [],
        persistedCount: 0,
        contextSwitchCount: 0
      }
    }

    try {
      const visionResults = VisionBatchSchema.parse(
        await this.aiProvider.analyzeScreenshot(preparedScreenshots.map((screenshot) => screenshot.image))
      )

      if (visionResults.length !== preparedScreenshots.length) {
        throw new Error(
          `AI provider returned ${visionResults.length} analyses for ${preparedScreenshots.length} screenshots.`
        )
      }

      const analyses: ProcessedScreenshotAnalysis[] = []
      const contextSwitchDurationSec = normalizeContextSwitchDurationSec(options.contextSwitchDurationSec)
      const contextSwitchAppName = normalizeNullableText(options.contextSwitchAppName) ?? DEFAULT_CONTEXT_SWITCH_APP_NAME

      for (const [index, preparedScreenshot] of preparedScreenshots.entries()) {
        const vision = visionResults[index]

        if (vision === undefined) {
          throw new Error(`Missing Vision analysis for screenshot index ${index}.`)
        }

        const description = buildCategorizationDescription(vision)
        const categorization = CategorySchema.parse(await this.aiProvider.categorize(description))
        const previousAnalysis = this.storeService.getLatestScreenshotAnalysis()
        const record = this.storeService.insertScreenshotAnalysis({
          timestamp: preparedScreenshot.timestamp,
          screenshot_path: preparedScreenshot.screenshotPath,
          application: preparedScreenshot.application,
          description,
          category: categorization.category,
          tags: categorization.tags,
          focus_score: vision.focus_score,
          task_state: vision.task_state,
          tool_in_video: vision.tool_in_video,
          full_response: JSON.stringify({ vision, categorization }),
          display_id: preparedScreenshot.displayId
        })
        const contextSwitchEvent = this.persistContextSwitch(previousAnalysis, {
          currentCategory: categorization.category,
          currentTimestamp: preparedScreenshot.timestamp,
          durationSec: contextSwitchDurationSec,
          appName: contextSwitchAppName
        })

        analyses.push({
          input: preparedScreenshot,
          description,
          vision,
          categorization,
          record,
          contextSwitchEvent
        })
      }

      return {
        analyses,
        persistedCount: analyses.length,
        contextSwitchCount: analyses.filter((analysis) => analysis.contextSwitchEvent !== null).length
      }
    } catch (error: unknown) {
      throw new Error(`AIPipeline failed to process screenshots: ${toErrorMessage(error)}`)
    }
  }

  private persistContextSwitch(
    previousAnalysis: ScreenshotAnalysisRecord | null,
    options: ContextSwitchOptions
  ): ActivityEventRecord | null {
    if (
      previousAnalysis === null ||
      previousAnalysis.category === null ||
      previousAnalysis.timestamp >= options.currentTimestamp ||
      previousAnalysis.category === options.currentCategory
    ) {
      return null
    }

    return this.storeService.insertActivityEvent({
      timestamp: options.currentTimestamp,
      app_name: options.appName,
      window_title: `영상 내 전환: ${previousAnalysis.category} → ${options.currentCategory}`,
      category: options.currentCategory,
      duration_sec: options.durationSec
    })
  }
}
