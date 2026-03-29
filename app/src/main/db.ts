import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import BetterSqlite3 from 'better-sqlite3'

const INITIAL_MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  app_name TEXT,
  window_title TEXT,
  category TEXT,
  duration_sec INTEGER
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  target_behaviors TEXT,
  anti_behaviors TEXT,
  success_metric TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screenshot_analyses (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  screenshot_path TEXT,
  application TEXT,
  description TEXT,
  category TEXT,
  tags TEXT,
  focus_score INTEGER,
  task_state TEXT,
  tool_in_video TEXT,
  full_response TEXT,
  display_id INTEGER
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  focus_curve_data TEXT,
  tomorrow_nudges TEXT,
  bottlenecks TEXT,
  interrupted_tasks TEXT,
  goal_alignment_score REAL,
  deviation_patterns TEXT,
  why_analysis TEXT,
  how_suggestions TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  report_id INTEGER,
  item_type TEXT,
  rating INTEGER,
  created_at TEXT NOT NULL
);`

const DB_FILE_NAME = 'woowoomo.sqlite'
const MIGRATION_FILE_FALLBACKS: ReadonlyArray<[string, string]> = [['001_init.sql', INITIAL_MIGRATION_SQL]]
const MAIN_DIR = dirname(fileURLToPath(import.meta.url))
const MIGRATION_DIRECTORIES = [join(MAIN_DIR, 'migrations'), join(process.cwd(), 'src/main/migrations')]

type SqliteDatabase = InstanceType<typeof BetterSqlite3>
type SqlValue = string | number | null

export type ActivityCategory =
  | 'coding'
  | 'writing'
  | 'designing'
  | 'reading'
  | 'media'
  | 'browsing'
  | 'messaging'
  | 'meeting'
  | 'admin'
  | 'other'

export interface JsonObject {
  [key: string]: JsonValue
}

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

export interface StoreServiceOptions {
  dbPath?: string
}

export interface ActivityEventRecord {
  id: number
  timestamp: string
  app_name: string | null
  window_title: string | null
  category: ActivityCategory | null
  duration_sec: number | null
}

export interface ActivityEventInput {
  timestamp: string
  app_name: string | null
  window_title: string | null
  category: ActivityCategory | null
  duration_sec: number | null
}

export interface ActivityEventUpdate {
  timestamp?: string
  app_name?: string | null
  window_title?: string | null
  category?: ActivityCategory | null
  duration_sec?: number | null
}

export interface GoalRecord {
  id: number
  date: string
  goal_text: string
  target_behaviors: ActivityCategory[]
  anti_behaviors: ActivityCategory[]
  success_metric: JsonObject | null
  created_at: string
}

export interface GoalInput {
  date: string
  goal_text: string
  target_behaviors: ActivityCategory[]
  anti_behaviors: ActivityCategory[]
  success_metric: JsonObject | null
  created_at: string
}

export interface GoalUpdate {
  date?: string
  goal_text?: string
  target_behaviors?: ActivityCategory[] | null
  anti_behaviors?: ActivityCategory[] | null
  success_metric?: JsonObject | null
  created_at?: string
}

export interface ScreenshotAnalysisRecord {
  id: number
  timestamp: string
  screenshot_path: string | null
  application: string | null
  description: string | null
  category: ActivityCategory | null
  tags: string[]
  focus_score: number | null
  task_state: string | null
  tool_in_video: string | null
  full_response: string | null
  display_id: number | null
}

export interface ScreenshotAnalysisInput {
  timestamp: string
  screenshot_path: string | null
  application: string | null
  description: string | null
  category: ActivityCategory | null
  tags: string[]
  focus_score: number | null
  task_state: string | null
  tool_in_video: string | null
  full_response: string | null
  display_id: number | null
}

export interface ScreenshotAnalysisUpdate {
  timestamp?: string
  screenshot_path?: string | null
  application?: string | null
  description?: string | null
  category?: ActivityCategory | null
  tags?: string[] | null
  focus_score?: number | null
  task_state?: string | null
  tool_in_video?: string | null
  full_response?: string | null
  display_id?: number | null
}

export interface DailyReportRecord {
  id: number
  date: string
  focus_curve_data: JsonValue[]
  tomorrow_nudges: JsonValue[]
  bottlenecks: JsonValue[]
  interrupted_tasks: JsonValue[]
  goal_alignment_score: number | null
  deviation_patterns: JsonValue[]
  why_analysis: JsonValue[]
  how_suggestions: JsonValue[]
  summary: string | null
}

export interface DailyReportInput {
  date: string
  focus_curve_data: JsonValue[]
  tomorrow_nudges: JsonValue[]
  bottlenecks: JsonValue[]
  interrupted_tasks: JsonValue[]
  goal_alignment_score: number | null
  deviation_patterns: JsonValue[]
  why_analysis: JsonValue[]
  how_suggestions: JsonValue[]
  summary: string | null
}

export interface DailyReportUpdate {
  date?: string
  focus_curve_data?: JsonValue[] | null
  tomorrow_nudges?: JsonValue[] | null
  bottlenecks?: JsonValue[] | null
  interrupted_tasks?: JsonValue[] | null
  goal_alignment_score?: number | null
  deviation_patterns?: JsonValue[] | null
  why_analysis?: JsonValue[] | null
  how_suggestions?: JsonValue[] | null
  summary?: string | null
}

export interface FeedbackRecord {
  id: number
  report_id: number | null
  item_type: string | null
  rating: number | null
  created_at: string
}

export interface FeedbackInput {
  report_id: number | null
  item_type: string | null
  rating: number | null
  created_at: string
}

export interface FeedbackUpdate {
  report_id?: number | null
  item_type?: string | null
  rating?: number | null
  created_at?: string
}

interface GoalRow {
  id: number
  date: string
  goal_text: string
  target_behaviors: string | null
  anti_behaviors: string | null
  success_metric: string | null
  created_at: string
}

interface ScreenshotAnalysisRow {
  id: number
  timestamp: string
  screenshot_path: string | null
  application: string | null
  description: string | null
  category: ActivityCategory | null
  tags: string | null
  focus_score: number | null
  task_state: string | null
  tool_in_video: string | null
  full_response: string | null
  display_id: number | null
}

interface DailyReportRow {
  id: number
  date: string
  focus_curve_data: string | null
  tomorrow_nudges: string | null
  bottlenecks: string | null
  interrupted_tasks: string | null
  goal_alignment_score: number | null
  deviation_patterns: string | null
  why_analysis: string | null
  how_suggestions: string | null
  summary: string | null
}

function getDefaultDatabasePath(): string {
  return join(homedir(), 'Library', 'Application Support', 'woowoomo', DB_FILE_NAME)
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function getMigrationFiles(): Array<[string, string]> {
  for (const directory of MIGRATION_DIRECTORIES) {
    if (!existsSync(directory)) {
      continue
    }

    const files = readdirSync(directory)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right))
      .map((fileName) => [fileName, readFileSync(join(directory, fileName), 'utf8')] as [string, string])

    if (files.length > 0) {
      return files
    }
  }

  return [...MIGRATION_FILE_FALLBACKS]
}

function serializeJson(value: JsonValue | JsonValue[] | null): string | null {
  if (value === null) {
    return null
  }

  return JSON.stringify(value)
}

function parseJsonArray(value: string | null): JsonValue[] {
  if (value === null) {
    return []
  }

  const parsed = JSON.parse(value) as unknown

  return Array.isArray(parsed) ? (parsed as JsonValue[]) : []
}

function parseStringArray(value: string | null): string[] {
  if (value === null) {
    return []
  }

  const parsed = JSON.parse(value) as unknown

  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? [...parsed] : []
}

function parseJsonObject(value: string | null): JsonObject | null {
  if (value === null) {
    return null
  }

  const parsed = JSON.parse(value) as unknown

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    return null
  }

  return parsed as JsonObject
}

function buildUpdatePayload(payload: Record<string, SqlValue | undefined>): Record<string, SqlValue> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Record<string, SqlValue>
}

export class StoreService {
  private readonly db: SqliteDatabase

  public readonly dbPath: string

  public constructor(options: StoreServiceOptions = {}) {
    this.dbPath = options.dbPath ?? getDefaultDatabasePath()
    ensureParentDirectory(this.dbPath)

    this.db = new BetterSqlite3(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
  }

  public runMigrations(): void {
    for (const [, sql] of getMigrationFiles()) {
      this.db.exec(sql)
    }
  }

  public close(): void {
    this.db.close()
  }

  public insertActivityEvent(input: ActivityEventInput): ActivityEventRecord {
    const result = this.db
      .prepare(
        `INSERT INTO activity_events (
          timestamp,
          app_name,
          window_title,
          category,
          duration_sec
        ) VALUES (
          @timestamp,
          @app_name,
          @window_title,
          @category,
          @duration_sec
        )`
      )
      .run(input)

    const record = this.getActivityEventById(Number(result.lastInsertRowid))

    if (record === null) {
      throw new Error('Failed to load inserted activity event.')
    }

    return record
  }

  public getActivityEventById(id: number): ActivityEventRecord | null {
    const row = this.db.prepare('SELECT * FROM activity_events WHERE id = ?').get(id) as ActivityEventRecord | undefined

    return row ?? null
  }

  public getActivityEventsByDateRange(startTimestamp: string, endTimestamp: string): ActivityEventRecord[] {
    return this.db
      .prepare(
        'SELECT * FROM activity_events WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC, id ASC'
      )
      .all(startTimestamp, endTimestamp) as ActivityEventRecord[]
  }

  public deleteActivityEventsBefore(timestampExclusive: string): number {
    return this.db.prepare('DELETE FROM activity_events WHERE timestamp < ?').run(timestampExclusive).changes
  }

  public updateActivityEvent(id: number, patch: ActivityEventUpdate): boolean {
    const payload = buildUpdatePayload({
      timestamp: patch.timestamp,
      app_name: patch.app_name,
      window_title: patch.window_title,
      category: patch.category,
      duration_sec: patch.duration_sec
    })

    return this.updateById('activity_events', id, payload)
  }

  public deleteActivityEvent(id: number): boolean {
    return this.db.prepare('DELETE FROM activity_events WHERE id = ?').run(id).changes > 0
  }

  public getLatestActivityEvent(): ActivityEventRecord | null {
    const row = this.db
      .prepare('SELECT * FROM activity_events ORDER BY timestamp DESC, id DESC LIMIT 1')
      .get() as ActivityEventRecord | undefined

    return row ?? null
  }

  public insertGoal(input: GoalInput): GoalRecord {
    const result = this.db
      .prepare(
        `INSERT INTO goals (
          date,
          goal_text,
          target_behaviors,
          anti_behaviors,
          success_metric,
          created_at
        ) VALUES (
          @date,
          @goal_text,
          @target_behaviors,
          @anti_behaviors,
          @success_metric,
          @created_at
        )`
      )
      .run({
        date: input.date,
        goal_text: input.goal_text,
        target_behaviors: serializeJson(input.target_behaviors),
        anti_behaviors: serializeJson(input.anti_behaviors),
        success_metric: serializeJson(input.success_metric),
        created_at: input.created_at
      })

    const record = this.getGoalById(Number(result.lastInsertRowid))

    if (record === null) {
      throw new Error('Failed to load inserted goal.')
    }

    return record
  }

  public getGoalById(id: number): GoalRecord | null {
    const row = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined

    return row === undefined ? null : this.mapGoalRow(row)
  }

  public getGoalsByDateRange(startDate: string, endDate: string): GoalRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM goals WHERE date BETWEEN ? AND ? ORDER BY date ASC, id ASC')
      .all(startDate, endDate) as GoalRow[]

    return rows.map((row) => this.mapGoalRow(row))
  }

  public updateGoal(id: number, patch: GoalUpdate): boolean {
    const payload = buildUpdatePayload({
      date: patch.date,
      goal_text: patch.goal_text,
      target_behaviors: patch.target_behaviors === undefined ? undefined : serializeJson(patch.target_behaviors),
      anti_behaviors: patch.anti_behaviors === undefined ? undefined : serializeJson(patch.anti_behaviors),
      success_metric: patch.success_metric === undefined ? undefined : serializeJson(patch.success_metric),
      created_at: patch.created_at
    })

    return this.updateById('goals', id, payload)
  }

  public deleteGoal(id: number): boolean {
    return this.db.prepare('DELETE FROM goals WHERE id = ?').run(id).changes > 0
  }

  public insertScreenshotAnalysis(input: ScreenshotAnalysisInput): ScreenshotAnalysisRecord {
    const result = this.db
      .prepare(
        `INSERT INTO screenshot_analyses (
          timestamp,
          screenshot_path,
          application,
          description,
          category,
          tags,
          focus_score,
          task_state,
          tool_in_video,
          full_response,
          display_id
        ) VALUES (
          @timestamp,
          @screenshot_path,
          @application,
          @description,
          @category,
          @tags,
          @focus_score,
          @task_state,
          @tool_in_video,
          @full_response,
          @display_id
        )`
      )
      .run({
        ...input,
        tags: serializeJson(input.tags)
      })

    const record = this.getScreenshotAnalysisById(Number(result.lastInsertRowid))

    if (record === null) {
      throw new Error('Failed to load inserted screenshot analysis.')
    }

    return record
  }

  public getScreenshotAnalysisById(id: number): ScreenshotAnalysisRecord | null {
    const row = this.db.prepare('SELECT * FROM screenshot_analyses WHERE id = ?').get(id) as ScreenshotAnalysisRow | undefined

    return row === undefined ? null : this.mapScreenshotAnalysisRow(row)
  }

  public getScreenshotAnalysesByDateRange(startTimestamp: string, endTimestamp: string): ScreenshotAnalysisRecord[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM screenshot_analyses WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC, id ASC'
      )
      .all(startTimestamp, endTimestamp) as ScreenshotAnalysisRow[]

    return rows.map((row) => this.mapScreenshotAnalysisRow(row))
  }

  public getScreenshotAnalysesBefore(timestampExclusive: string): ScreenshotAnalysisRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM screenshot_analyses WHERE timestamp < ? ORDER BY timestamp ASC, id ASC')
      .all(timestampExclusive) as ScreenshotAnalysisRow[]

    return rows.map((row) => this.mapScreenshotAnalysisRow(row))
  }

  public updateScreenshotAnalysis(id: number, patch: ScreenshotAnalysisUpdate): boolean {
    const payload = buildUpdatePayload({
      timestamp: patch.timestamp,
      screenshot_path: patch.screenshot_path,
      application: patch.application,
      description: patch.description,
      category: patch.category,
      tags: patch.tags === undefined ? undefined : serializeJson(patch.tags),
      focus_score: patch.focus_score,
      task_state: patch.task_state,
      tool_in_video: patch.tool_in_video,
      full_response: patch.full_response,
      display_id: patch.display_id
    })

    return this.updateById('screenshot_analyses', id, payload)
  }

  public deleteScreenshotAnalysis(id: number): boolean {
    return this.db.prepare('DELETE FROM screenshot_analyses WHERE id = ?').run(id).changes > 0
  }

  public deleteScreenshotAnalysesBefore(timestampExclusive: string): number {
    return this.db.prepare('DELETE FROM screenshot_analyses WHERE timestamp < ?').run(timestampExclusive).changes
  }

  public getLatestScreenshotAnalysis(): ScreenshotAnalysisRecord | null {
    const row = this.db
      .prepare('SELECT * FROM screenshot_analyses ORDER BY timestamp DESC, id DESC LIMIT 1')
      .get() as ScreenshotAnalysisRow | undefined

    return row === undefined ? null : this.mapScreenshotAnalysisRow(row)
  }

  public insertDailyReport(input: DailyReportInput): DailyReportRecord {
    const result = this.db
      .prepare(
        `INSERT INTO daily_reports (
          date,
          focus_curve_data,
          tomorrow_nudges,
          bottlenecks,
          interrupted_tasks,
          goal_alignment_score,
          deviation_patterns,
          why_analysis,
          how_suggestions,
          summary
        ) VALUES (
          @date,
          @focus_curve_data,
          @tomorrow_nudges,
          @bottlenecks,
          @interrupted_tasks,
          @goal_alignment_score,
          @deviation_patterns,
          @why_analysis,
          @how_suggestions,
          @summary
        )`
      )
      .run({
        date: input.date,
        focus_curve_data: serializeJson(input.focus_curve_data),
        tomorrow_nudges: serializeJson(input.tomorrow_nudges),
        bottlenecks: serializeJson(input.bottlenecks),
        interrupted_tasks: serializeJson(input.interrupted_tasks),
        goal_alignment_score: input.goal_alignment_score,
        deviation_patterns: serializeJson(input.deviation_patterns),
        why_analysis: serializeJson(input.why_analysis),
        how_suggestions: serializeJson(input.how_suggestions),
        summary: input.summary
      })

    const record = this.getDailyReportById(Number(result.lastInsertRowid))

    if (record === null) {
      throw new Error('Failed to load inserted daily report.')
    }

    return record
  }

  public getDailyReportById(id: number): DailyReportRecord | null {
    const row = this.db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(id) as DailyReportRow | undefined

    return row === undefined ? null : this.mapDailyReportRow(row)
  }

  public getDailyReportsByDateRange(startDate: string, endDate: string): DailyReportRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM daily_reports WHERE date BETWEEN ? AND ? ORDER BY date ASC, id ASC')
      .all(startDate, endDate) as DailyReportRow[]

    return rows.map((row) => this.mapDailyReportRow(row))
  }

  public updateDailyReport(id: number, patch: DailyReportUpdate): boolean {
    const payload = buildUpdatePayload({
      date: patch.date,
      focus_curve_data:
        patch.focus_curve_data === undefined ? undefined : serializeJson(patch.focus_curve_data),
      tomorrow_nudges:
        patch.tomorrow_nudges === undefined ? undefined : serializeJson(patch.tomorrow_nudges),
      bottlenecks: patch.bottlenecks === undefined ? undefined : serializeJson(patch.bottlenecks),
      interrupted_tasks:
        patch.interrupted_tasks === undefined ? undefined : serializeJson(patch.interrupted_tasks),
      goal_alignment_score: patch.goal_alignment_score,
      deviation_patterns:
        patch.deviation_patterns === undefined ? undefined : serializeJson(patch.deviation_patterns),
      why_analysis: patch.why_analysis === undefined ? undefined : serializeJson(patch.why_analysis),
      how_suggestions:
        patch.how_suggestions === undefined ? undefined : serializeJson(patch.how_suggestions),
      summary: patch.summary
    })

    return this.updateById('daily_reports', id, payload)
  }

  public deleteDailyReport(id: number): boolean {
    return this.db.prepare('DELETE FROM daily_reports WHERE id = ?').run(id).changes > 0
  }

  public insertFeedback(input: FeedbackInput): FeedbackRecord {
    const result = this.db
      .prepare(
        `INSERT INTO feedback (
          report_id,
          item_type,
          rating,
          created_at
        ) VALUES (
          @report_id,
          @item_type,
          @rating,
          @created_at
        )`
      )
      .run(input)

    const record = this.getFeedbackById(Number(result.lastInsertRowid))

    if (record === null) {
      throw new Error('Failed to load inserted feedback.')
    }

    return record
  }

  public getFeedbackById(id: number): FeedbackRecord | null {
    const row = this.db.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as FeedbackRecord | undefined

    return row ?? null
  }

  public getFeedbackByDateRange(startTimestamp: string, endTimestamp: string): FeedbackRecord[] {
    return this.db
      .prepare('SELECT * FROM feedback WHERE created_at BETWEEN ? AND ? ORDER BY created_at ASC, id ASC')
      .all(startTimestamp, endTimestamp) as FeedbackRecord[]
  }

  public updateFeedback(id: number, patch: FeedbackUpdate): boolean {
    const payload = buildUpdatePayload({
      report_id: patch.report_id,
      item_type: patch.item_type,
      rating: patch.rating,
      created_at: patch.created_at
    })

    return this.updateById('feedback', id, payload)
  }

  public deleteFeedback(id: number): boolean {
    return this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id).changes > 0
  }

  private updateById(tableName: string, id: number, payload: Record<string, SqlValue>): boolean {
    const columns = Object.keys(payload)

    if (columns.length === 0) {
      return false
    }

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ')
    const result = this.db
      .prepare(`UPDATE ${tableName} SET ${assignments} WHERE id = @id`)
      .run({ ...payload, id })

    return result.changes > 0
  }

  private mapGoalRow(row: GoalRow): GoalRecord {
    return {
      ...row,
      target_behaviors: parseStringArray(row.target_behaviors) as ActivityCategory[],
      anti_behaviors: parseStringArray(row.anti_behaviors) as ActivityCategory[],
      success_metric: parseJsonObject(row.success_metric)
    }
  }

  private mapScreenshotAnalysisRow(row: ScreenshotAnalysisRow): ScreenshotAnalysisRecord {
    return {
      ...row,
      tags: parseStringArray(row.tags)
    }
  }

  private mapDailyReportRow(row: DailyReportRow): DailyReportRecord {
    return {
      ...row,
      focus_curve_data: parseJsonArray(row.focus_curve_data),
      tomorrow_nudges: parseJsonArray(row.tomorrow_nudges),
      bottlenecks: parseJsonArray(row.bottlenecks),
      interrupted_tasks: parseJsonArray(row.interrupted_tasks),
      deviation_patterns: parseJsonArray(row.deviation_patterns),
      why_analysis: parseJsonArray(row.why_analysis),
      how_suggestions: parseJsonArray(row.how_suggestions)
    }
  }
}
