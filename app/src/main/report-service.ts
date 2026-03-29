import type {
  ActivityCategory,
  ActivityEvent,
  DailyData,
  DailyReport,
  Goal,
  ReportPayload,
  ScreenshotAnalysis
} from '../shared/types'
import type { AIProvider } from '../shared/types'
import type {
  ActivityEventRecord,
  DailyReportRecord,
  GoalRecord,
  JsonValue,
  ScreenshotAnalysisRecord,
  StoreService
} from './db'
import { SecureStore } from './secure-store'

interface CreateDailyReportGeneratorOptions {
  storeService: StoreService
  secureStore: SecureStore
  createAIProvider: (apiKey: string) => AIProvider
  now?: () => Date
}

interface DailySummaryPreviewOptions {
  goal: GoalRecord | null
  activityEvents: ActivityEventRecord[]
  screenshotAnalyses: ScreenshotAnalysisRecord[]
  report: DailyReportRecord | null
}

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  coding: 'coding',
  writing: 'writing',
  designing: 'designing',
  reading: 'reading',
  media: 'media',
  browsing: 'browsing',
  messaging: 'messaging',
  meeting: 'meeting',
  admin: 'admin',
  other: 'other'
}

const EMPTY_DAY_SUMMARY = '오늘은 아직 분석 가능한 활동 데이터가 충분하지 않습니다.'

function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
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
    end: end.toISOString()
  }
}

function getLatestRecord<T>(records: T[]): T | null {
  return records.length === 0 ? null : records[records.length - 1] ?? null
}

function toGoal(record: GoalRecord): Goal {
  return {
    ...record,
    success_metric: (record.success_metric ?? {}) as unknown as Goal['success_metric']
  }
}

function toJsonArray<T>(value: T[]): JsonValue[] {
  return value as unknown as JsonValue[]
}

function toActivityEvent(record: ActivityEventRecord): ActivityEvent {
  return { ...record }
}

function toScreenshotAnalysis(record: ScreenshotAnalysisRecord): ScreenshotAnalysis {
  return {
    ...record,
    description: record.description ?? '',
    category: record.category ?? 'other',
    focus_score: record.focus_score ?? 0,
    task_state: (record.task_state ?? 'in_progress') as ScreenshotAnalysis['task_state'],
    tool_in_video: record.tool_in_video as ScreenshotAnalysis['tool_in_video']
  }
}

function toDailyReport(record: DailyReportRecord): DailyReport {
  return {
    ...record,
    focus_curve_data: record.focus_curve_data as unknown as DailyReport['focus_curve_data'],
    tomorrow_nudges: record.tomorrow_nudges as unknown as DailyReport['tomorrow_nudges'],
    bottlenecks: record.bottlenecks as unknown as DailyReport['bottlenecks'],
    interrupted_tasks: record.interrupted_tasks as unknown as DailyReport['interrupted_tasks'],
    deviation_patterns: record.deviation_patterns as unknown as string[],
    why_analysis: record.why_analysis as unknown as string[],
    how_suggestions: record.how_suggestions as unknown as string[],
    summary: record.summary ?? ''
  }
}

function normalizeSummaryText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function getAverageFocusScore(screenshotAnalyses: ScreenshotAnalysis[]): number | null {
  if (screenshotAnalyses.length === 0) {
    return null
  }

  const totalFocusScore = screenshotAnalyses.reduce((total, analysis) => total + analysis.focus_score, 0)

  return Math.round(totalFocusScore / screenshotAnalyses.length)
}

function getDominantCategory(screenshotAnalyses: ScreenshotAnalysis[]): ActivityCategory | null {
  if (screenshotAnalyses.length === 0) {
    return null
  }

  const counts = new Map<ActivityCategory, number>()

  for (const analysis of screenshotAnalyses) {
    counts.set(analysis.category, (counts.get(analysis.category) ?? 0) + 1)
  }

  let dominantCategory: ActivityCategory | null = null
  let dominantCount = 0

  for (const [category, count] of counts.entries()) {
    if (count > dominantCount) {
      dominantCategory = category
      dominantCount = count
    }
  }

  return dominantCategory
}

function buildBaseSummary(goal: GoalRecord | null, activityEvents: ActivityEvent[], screenshotAnalyses: ScreenshotAnalysis[]): string {
  const summaryParts: string[] = []

  if (goal !== null) {
    summaryParts.push(`오늘 목표는 "${goal.goal_text}"입니다.`)
  }

  if (screenshotAnalyses.length > 0) {
    const dominantCategory = getDominantCategory(screenshotAnalyses)
    const averageFocusScore = getAverageFocusScore(screenshotAnalyses)

    summaryParts.push(
      dominantCategory === null || averageFocusScore === null
        ? `현재까지 분석 ${screenshotAnalyses.length}건이 저장되었습니다.`
        : `현재까지 분석 ${screenshotAnalyses.length}건 기준으로 ${CATEGORY_LABELS[dominantCategory]} 활동 비중이 가장 높고 평균 집중도는 ${averageFocusScore}점입니다.`
    )

    return summaryParts.join(' ')
  }

  if (activityEvents.length > 0) {
    summaryParts.push(`현재까지 activity event ${activityEvents.length}건이 기록되었습니다.`)
    return summaryParts.join(' ')
  }

  return goal === null ? EMPTY_DAY_SUMMARY : `${summaryParts.join(' ')} ${EMPTY_DAY_SUMMARY}`.trim()
}

function buildFallbackReportPayload(goals: Goal[]): ReportPayload {
  const hasGoal = goals.length > 0

  return {
    focus_curve: [],
    nudges: [],
    bottlenecks: [],
    interrupted_tasks: [],
    goal_alignment_score: hasGoal ? 0 : null,
    deviation_patterns: hasGoal ? [] : null,
    why_analysis: hasGoal ? [] : null,
    how_suggestions: hasGoal ? [] : null
  }
}

function deriveGoalAlignmentScore(goals: Goal[], screenshotAnalyses: ScreenshotAnalysis[]): number | null {
  const goal = getLatestRecord(goals)

  if (goal === null || goal.target_behaviors.length === 0) {
    return null
  }

  if (screenshotAnalyses.length === 0) {
    return 0
  }

  const alignedCount = screenshotAnalyses.filter((analysis) => goal.target_behaviors.includes(analysis.category)).length

  return Number((alignedCount / screenshotAnalyses.length).toFixed(2))
}

function normalizeReportPayload(payload: ReportPayload, dailyData: DailyData): ReportPayload {
  const hasGoal = dailyData.goals.length > 0

  return {
    ...payload,
    goal_alignment_score: hasGoal ? payload.goal_alignment_score ?? deriveGoalAlignmentScore(dailyData.goals, dailyData.screenshot_analyses) : null,
    deviation_patterns: hasGoal ? payload.deviation_patterns ?? [] : null,
    why_analysis: hasGoal ? payload.why_analysis ?? [] : null,
    how_suggestions: hasGoal ? payload.how_suggestions ?? [] : null
  }
}

function buildReportSummary(payload: ReportPayload, dailyData: DailyData, goal: GoalRecord | null): string {
  const summaryParts = [
    buildBaseSummary(goal, dailyData.activity_events, dailyData.screenshot_analyses),
    payload.nudges[0] ? `내일 제안은 ${payload.nudges[0].when} ${payload.nudges[0].what}입니다.` : null,
    payload.bottlenecks[0] ? `주요 병목은 ${payload.bottlenecks[0].bottleneck}입니다.` : null,
    payload.interrupted_tasks[0] ? `재시작 후보는 ${payload.interrupted_tasks[0].task}입니다.` : null
  ].filter((entry): entry is string => entry !== null)

  return summaryParts.slice(0, 3).join(' ')
}

function getPreviousReport(storeService: StoreService, targetDate: string): DailyReport | null {
  const reports = storeService.getDailyReportsByDateRange('0000-01-01', targetDate)
  const previousReports = reports.filter((report) => report.date < targetDate)
  const previousReport = previousReports.length === 0 ? null : previousReports[previousReports.length - 1]

  return previousReport === null ? null : toDailyReport(previousReport)
}

export function buildTodaySummaryPreview({
  goal,
  activityEvents,
  screenshotAnalyses,
  report
}: DailySummaryPreviewOptions): string | null {
  const storedSummary = normalizeSummaryText(report?.summary)

  if (storedSummary !== null) {
    return storedSummary
  }

  if (activityEvents.length === 0 && screenshotAnalyses.length === 0) {
    return null
  }

  return buildBaseSummary(
    goal,
    activityEvents.map((activityEvent) => toActivityEvent(activityEvent)),
    screenshotAnalyses.map((analysis) => toScreenshotAnalysis(analysis))
  )
}

export function createDailyReportGenerator({
  storeService,
  secureStore,
  createAIProvider,
  now = () => new Date()
}: CreateDailyReportGeneratorOptions): (date?: string) => Promise<DailyReportRecord> {
  return async (date?: string): Promise<DailyReportRecord> => {
    const resolvedDate = date ?? toLocalDateString(now())
    const { start, end } = getDayBounds(resolvedDate)
    const goalRecords = storeService.getGoalsByDateRange(resolvedDate, resolvedDate)
    const goals = goalRecords.map(toGoal)
    const activityEventRecords = storeService.getActivityEventsByDateRange(start, end)
    const activityEvents = activityEventRecords.map(toActivityEvent)
    const screenshotAnalysisRecords = storeService.getScreenshotAnalysesByDateRange(start, end)
    const screenshotAnalyses = screenshotAnalysisRecords.map(toScreenshotAnalysis)

    const dailyData: DailyData = {
      goals,
      activity_events: activityEvents,
      screenshot_analyses: screenshotAnalyses,
      prev_report: getPreviousReport(storeService, resolvedDate)
    }

    const apiKey = secureStore.getApiKey()
    const payload =
      activityEvents.length === 0 && screenshotAnalyses.length === 0
        ? buildFallbackReportPayload(goals)
        : (() => {
            if (apiKey === null) {
              throw new Error('Claude API key is not configured.')
            }

            return createAIProvider(apiKey).generateReport(dailyData)
          })()
    const normalizedPayload = normalizeReportPayload(await payload, dailyData)
    const summary = buildReportSummary(normalizedPayload, dailyData, getLatestRecord(goalRecords))
    const existingReport = getLatestRecord(storeService.getDailyReportsByDateRange(resolvedDate, resolvedDate))

    if (existingReport !== null) {
      storeService.updateDailyReport(existingReport.id, {
        focus_curve_data: toJsonArray(normalizedPayload.focus_curve),
        tomorrow_nudges: toJsonArray(normalizedPayload.nudges),
        bottlenecks: toJsonArray(normalizedPayload.bottlenecks),
        interrupted_tasks: toJsonArray(normalizedPayload.interrupted_tasks),
        goal_alignment_score: normalizedPayload.goal_alignment_score,
        deviation_patterns: toJsonArray(normalizedPayload.deviation_patterns ?? []),
        why_analysis: toJsonArray(normalizedPayload.why_analysis ?? []),
        how_suggestions: toJsonArray(normalizedPayload.how_suggestions ?? []),
        summary
      })

      const updatedReport = storeService.getDailyReportById(existingReport.id)

      if (updatedReport === null) {
        throw new Error('Generated report could not be loaded after update.')
      }

      return updatedReport
    }

    return storeService.insertDailyReport({
      date: resolvedDate,
      focus_curve_data: toJsonArray(normalizedPayload.focus_curve),
      tomorrow_nudges: toJsonArray(normalizedPayload.nudges),
      bottlenecks: toJsonArray(normalizedPayload.bottlenecks),
      interrupted_tasks: toJsonArray(normalizedPayload.interrupted_tasks),
      goal_alignment_score: normalizedPayload.goal_alignment_score,
      deviation_patterns: toJsonArray(normalizedPayload.deviation_patterns ?? []),
      why_analysis: toJsonArray(normalizedPayload.why_analysis ?? []),
      how_suggestions: toJsonArray(normalizedPayload.how_suggestions ?? []),
      summary
    })
  }
}
