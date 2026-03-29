import type { Buffer } from 'node:buffer'

export const ACTIVITY_CATEGORIES = [
  'coding',
  'writing',
  'designing',
  'reading',
  'media',
  'browsing',
  'messaging',
  'meeting',
  'admin',
  'other'
] as const

export const VISION_TASK_STATES = ['starting', 'in_progress', 'switching', 'explaining'] as const

export const LEGACY_TOOL_IN_VIDEO_VALUES = ['VS Code', 'Terminal', 'Browser', 'Slides', 'Other'] as const

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]
export type VisionTaskState = (typeof VISION_TASK_STATES)[number]
export type LegacyToolInVideo = (typeof LEGACY_TOOL_IN_VIDEO_VALUES)[number]

export type GoalSuccessMetricValue = string | number | boolean | null
export type GoalSuccessMetric = Record<string, GoalSuccessMetricValue>

export interface VisionResponse {
  current_task: string
  tool_in_video: LegacyToolInVideo
  category: ActivityCategory
  focus_score: number
  task_state: VisionTaskState
  notes: string
}

export interface CategorizationResponse {
  category: ActivityCategory
  tags: string[]
}

export interface GoalStructure {
  goal_text: string
  target_behaviors: ActivityCategory[]
  anti_behaviors: ActivityCategory[]
  success_metric: GoalSuccessMetric
}

export interface FocusCurvePoint {
  time: string
  score: number
}

export interface TomorrowNudge {
  when: string
  what: string
  why: string
}

export interface BottleneckItem {
  bottleneck: string
  recommendation: string
  delegate_prompt?: string | null
}

export interface InterruptedTaskItem {
  task: string
  interrupted_at: string
  context: string
  suggested_next_step?: string | null
}

export interface ActivityEvent {
  id?: number
  timestamp: string
  app_name: string | null
  window_title: string | null
  category: ActivityCategory | null
  duration_sec: number | null
}

export interface ScreenshotAnalysis {
  id?: number
  timestamp: string
  screenshot_path: string | null
  application: string | null
  description: string
  category: ActivityCategory
  tags: string[]
  focus_score: number
  task_state: VisionTaskState
  tool_in_video: LegacyToolInVideo | null
  full_response: string | null
  display_id: number | null
}

export interface Goal {
  id?: number
  date: string
  goal_text: string
  target_behaviors: ActivityCategory[]
  anti_behaviors: ActivityCategory[]
  success_metric: GoalSuccessMetric
  created_at: string
}

export interface ReportPayload {
  focus_curve: FocusCurvePoint[]
  nudges: TomorrowNudge[]
  bottlenecks: BottleneckItem[]
  interrupted_tasks: InterruptedTaskItem[]
  goal_alignment_score: number | null
  deviation_patterns: string[] | null
  why_analysis: string[] | null
  how_suggestions: string[] | null
}

export interface DailyReport {
  id?: number
  date: string
  focus_curve_data: FocusCurvePoint[]
  tomorrow_nudges: TomorrowNudge[]
  bottlenecks: BottleneckItem[]
  interrupted_tasks: InterruptedTaskItem[]
  goal_alignment_score: number | null
  deviation_patterns: string[] | null
  why_analysis: string[] | null
  how_suggestions: string[] | null
  summary: string
}

export interface Feedback {
  id?: number
  report_id: number | null
  item_type: string
  rating: number
  created_at: string
}

export interface DailyData {
  goals: Goal[]
  activity_events: ActivityEvent[]
  screenshot_analyses: ScreenshotAnalysis[]
  prev_report: DailyReport | null
}

export interface AIProvider {
  analyzeScreenshot(images: Buffer[]): Promise<VisionResponse[]>
  categorize(description: string): Promise<CategorizationResponse>
  structureGoal(goalText: string): Promise<GoalStructure>
  generateReport(data: DailyData): Promise<ReportPayload>
}
