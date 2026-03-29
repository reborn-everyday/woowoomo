import type { Buffer } from 'node:buffer'

import Anthropic from '@anthropic-ai/sdk'

import { buildCategorizePrompt } from '../prompts/categorize'
import { buildGoalStructurePrompt } from '../prompts/goal-structure'
import { buildReportGeneratePrompt } from '../prompts/report-generate'
import { buildVisionAnalyzePrompt } from '../prompts/vision-analyze'
import { CategorySchema } from '../../shared/schemas/categorization'
import { GoalSchema } from '../../shared/schemas/goal'
import { ReportSchema } from '../../shared/schemas/report'
import { VisionBatchSchema } from '../../shared/schemas/vision'
import type {
  ActivityCategory,
  AIProvider,
  CategorizationResponse,
  DailyData,
  GoalStructure,
  ReportPayload,
  VisionResponse
} from '../../shared/types'

const DEFAULT_MODEL = 'claude-opus-4-6'
const DEFAULT_MAX_TOKENS = 2_048
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_INITIAL_RETRY_DELAY_MS = 300

export interface JsonObject {
  [key: string]: JsonValue
}

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

export interface ClaudeProviderOptions {
  apiKey: string
  model?: string
  maxTokens?: number
  maxRetries?: number
  initialRetryDelayMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')

  return JSON.parse(withoutFence) as unknown
}

function getTextBlock(response: unknown): string {
  if (!isRecord(response) || !Array.isArray(response.content)) {
    throw new Error('Claude returned an unexpected response shape.')
  }

  const textParts: string[] = []

  for (const block of response.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text)
    }
  }

  const textContent = textParts.join('\n').trim()

  if (textContent.length === 0) {
    throw new Error('Claude returned an empty text response.')
  }

  return textContent
}

function isStatusError(error: unknown, status: number): error is { status: number; message?: string } {
  return isRecord(error) && typeof error.status === 'number' && error.status === status
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message
  }

  return 'Unknown error.'
}

function getStatusCode(error: unknown): number | null {
  if (isRecord(error) && typeof error.status === 'number') {
    return error.status
  }

  return null
}

function shouldRetryRequest(error: unknown): boolean {
  const statusCode = getStatusCode(error)

  if (statusCode !== null) {
    return statusCode === 429 || statusCode === 529 || statusCode >= 500
  }

  return error instanceof Error && /rate limit|timeout|network|temporar/i.test(error.message)
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function inferPrimaryGoalBehavior(goalText: string): ActivityCategory {
  if (/(\bcode\b|coding|개발|구현|버그|리팩터)/iu.test(goalText)) {
    return 'coding'
  }

  if (/(\bwrite\b|writing|draft|prd|문서|작성|글쓰기|보고서)/iu.test(goalText)) {
    return 'writing'
  }

  if (/(\bread\b|reading|논문|독서|리서치)/iu.test(goalText)) {
    return 'reading'
  }

  if (/(\bdesign\b|designing|ui|ux|디자인)/iu.test(goalText)) {
    return 'designing'
  }

  if (/(meeting|회의|sync)/iu.test(goalText)) {
    return 'meeting'
  }

  return 'other'
}

function inferSuccessMetric(goalText: string): GoalStructure['success_metric'] {
  const hourMatch = goalText.match(/(\d+(?:\.\d+)?)\s*(시간|hour|hours|hr|hrs)/iu)

  if (hourMatch !== null) {
    const parsedHours = Number.parseFloat(hourMatch[1])

    if (Number.isFinite(parsedHours) && parsedHours > 0) {
      return { focused_minutes: Math.round(parsedHours * 60) }
    }
  }

  const minuteMatch = goalText.match(/(\d+)\s*(분|minute|minutes|min|mins)/iu)

  if (minuteMatch !== null) {
    const parsedMinutes = Number.parseInt(minuteMatch[1], 10)

    if (Number.isFinite(parsedMinutes) && parsedMinutes > 0) {
      return { focused_minutes: parsedMinutes }
    }
  }

  return {}
}

function buildVisionFallback(length: number): VisionResponse[] {
  return Array.from({ length }, () => ({
    current_task: 'Unable to determine visible task from screenshot.',
    tool_in_video: 'Other',
    category: 'other',
    focus_score: 0,
    task_state: 'switching',
    notes: 'Claude response parsing failed; returned fallback Vision payload.'
  }))
}

function buildCategorizationFallback(): CategorizationResponse {
  return {
    category: 'other',
    tags: []
  }
}

function buildGoalFallback(goalText: string): GoalStructure {
  const targetBehavior = inferPrimaryGoalBehavior(goalText)

  return {
    goal_text: goalText.trim().length > 0 ? goalText : 'Untitled goal',
    target_behaviors: [targetBehavior],
    anti_behaviors: targetBehavior === 'other' ? [] : ['browsing', 'media'],
    success_metric: inferSuccessMetric(goalText)
  }
}

function buildReportFallback(includeGoalSection: boolean): ReportPayload {
  return {
    focus_curve: [],
    nudges: [],
    bottlenecks: [],
    interrupted_tasks: [],
    goal_alignment_score: includeGoalSection ? 0 : null,
    deviation_patterns: includeGoalSection ? [] : null,
    why_analysis: includeGoalSection ? [] : null,
    how_suggestions: includeGoalSection ? [] : null
  }
}

export class ClaudeProvider implements AIProvider {
  private readonly client: Anthropic

  private readonly model: string

  private readonly maxTokens: number

  private readonly maxRetries: number

  private readonly initialRetryDelayMs: number

  public constructor(options: ClaudeProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error('Claude API key is required.')
    }

    this.client = new Anthropic({ apiKey: options.apiKey })
    this.model = options.model ?? DEFAULT_MODEL
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.initialRetryDelayMs = options.initialRetryDelayMs ?? DEFAULT_INITIAL_RETRY_DELAY_MS
  }

  public async analyzeScreenshot(images: Buffer[]): Promise<VisionResponse[]> {
    if (images.length === 0) {
      return []
    }

    const prompt = buildVisionAnalyzePrompt({ imageCount: images.length })
    const text = await this.requestJsonText({
      system: prompt.system,
      content: [
        ...images.map((image) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/jpeg' as const,
            data: image.toString('base64')
          }
        })),
        { type: 'text' as const, text: prompt.user }
      ]
    })

    let payload: unknown

    try {
      payload = extractJsonPayload(text)
    } catch {
      return buildVisionFallback(images.length)
    }

    const itemsResult = VisionBatchSchema.safeParse(Array.isArray(payload) ? payload : [payload])

    if (!itemsResult.success || itemsResult.data.length !== images.length) {
      return buildVisionFallback(images.length)
    }

    return itemsResult.data.map((item) => ({
      ...item,
      focus_score: Math.max(0, Math.min(100, item.focus_score))
    }))
  }

  public async categorize(description: string): Promise<CategorizationResponse> {
    const prompt = buildCategorizePrompt({ description })
    const text = await this.requestJsonText({
      system: prompt.system,
      content: [{ type: 'text' as const, text: prompt.user }]
    })

    try {
      const payload = extractJsonPayload(text)
      const parsed = CategorySchema.safeParse(payload)

      if (parsed.success) {
        return parsed.data
      }
    } catch {
      return buildCategorizationFallback()
    }

    return buildCategorizationFallback()
  }

  public async structureGoal(goalText: string): Promise<GoalStructure> {
    const prompt = buildGoalStructurePrompt({ goalText })
    const text = await this.requestJsonText({
      system: prompt.system,
      content: [{ type: 'text' as const, text: prompt.user }]
    })

    try {
      const payload = extractJsonPayload(text)
      const parsed = GoalSchema.safeParse(payload)

      if (parsed.success) {
        return parsed.data
      }
    } catch {
      return GoalSchema.parse(buildGoalFallback(goalText))
    }

    return GoalSchema.parse(buildGoalFallback(goalText))
  }

  public async generateReport(data: DailyData): Promise<ReportPayload> {
    const prompt = buildReportGeneratePrompt({
      includeGoalSection: data.goals.length > 0,
      serializedDailyData: JSON.stringify(data, null, 2)
    })
    const text = await this.requestJsonText({
      system: prompt.system,
      content: [{ type: 'text' as const, text: prompt.user }]
    })

    try {
      const payload = extractJsonPayload(text)
      const parsed = ReportSchema.safeParse(payload)

      if (parsed.success) {
        return parsed.data
      }
    } catch {
      return ReportSchema.parse(buildReportFallback(data.goals.length > 0))
    }

    return ReportSchema.parse(buildReportFallback(data.goals.length > 0))
  }

  private async requestJsonText(options: {
    system: string
    content: Array<
      | { type: 'text'; text: string }
      | {
          type: 'image'
          source: {
            type: 'base64'
            media_type: 'image/jpeg'
            data: string
          }
        }
    >
  }): Promise<string> {
    let delayMs = this.initialRetryDelayMs

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          stream: false,
          system: options.system,
          messages: [{ role: 'user', content: options.content }]
        })

        return getTextBlock(response)
      } catch (error: unknown) {
        if (isStatusError(error, 401)) {
          throw new Error('Invalid Claude API key.')
        }

        const retryable = shouldRetryRequest(error)
        const canRetry = retryable && attempt < this.maxRetries

        if (!canRetry) {
          throw new Error(`Claude request failed: ${toErrorMessage(error)}`)
        }

        await sleep(delayMs)
        delayMs *= 2
      }
    }

    throw new Error('Claude request failed: retry budget exhausted.')
  }
}
