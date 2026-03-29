import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { StoreService } from './db'

const tempDirectories: string[] = []

async function createStoreService(): Promise<{ storeService: StoreService; dbPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'woowoomo-db-test-'))
  const dbPath = join(directory, 'woowoomo.test.sqlite')

  tempDirectories.push(directory)

  const storeService = new StoreService({ dbPath })

  storeService.runMigrations()

  return { storeService, dbPath }
}

afterEach(async () => {
  await Promise.all(tempDirectories.map(async (directory) => rm(directory, { recursive: true, force: true })))
  tempDirectories.length = 0
})

describe('StoreService', () => {
  it('runs migrations, creates required tables, and keeps WAL mode enabled', async () => {
    const { storeService, dbPath } = await createStoreService()
    storeService.close()

    const db = new BetterSqlite3(dbPath)

    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC")
        .all() as Array<{ name: string }>
      const tableNames = tables.map((table) => table.name)
      const journalMode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }

      expect(tableNames).toEqual(expect.arrayContaining(['activity_events', 'daily_reports', 'feedback', 'goals', 'screenshot_analyses']))
      expect(journalMode.journal_mode.toLowerCase()).toBe('wal')
    } finally {
      db.close()
    }
  })

  it('persists and reads latest rows across goals, activity events, analyses, and reports', async () => {
    const { storeService } = await createStoreService()

    try {
      const activity = storeService.insertActivityEvent({
        timestamp: '2026-03-29T09:00:00.000Z',
        app_name: 'Visual Studio Code',
        window_title: 'Implement db tests',
        category: 'coding',
        duration_sec: 300
      })
      const goal = storeService.insertGoal({
        date: '2026-03-29',
        goal_text: '코딩 2시간 집중하기',
        target_behaviors: ['coding'],
        anti_behaviors: ['browsing'],
        success_metric: { focused_minutes: 120 },
        created_at: '2026-03-29T09:00:00.000Z'
      })
      const analysis = storeService.insertScreenshotAnalysis({
        timestamp: '2026-03-29T09:05:00.000Z',
        screenshot_path: '/tmp/seed-1.jpg',
        application: 'Visual Studio Code',
        description: 'Implement integration smoke test',
        category: 'coding',
        tags: ['tests', 'vitest'],
        focus_score: 88,
        task_state: 'in_progress',
        tool_in_video: 'VS Code',
        full_response: '{"source":"test"}',
        display_id: 1
      })
      const report = storeService.insertDailyReport({
        date: '2026-03-29',
        focus_curve_data: [{ time: '09:00', score: 88 }],
        tomorrow_nudges: [{ when: '09:30', what: '집중 블록 유지', why: '집중 점수가 높았음' }],
        bottlenecks: [{ bottleneck: '문맥 전환', recommendation: '타이머 사용' }],
        interrupted_tasks: [{ task: 'T26 smoke test', interrupted_at: '09:20', context: '회의 전환' }],
        goal_alignment_score: 0.8,
        deviation_patterns: ['메시징 이후 집중 하락'],
        why_analysis: ['중단 이후 복귀 시간이 길어짐'],
        how_suggestions: ['복귀 체크리스트를 상단에 고정'],
        summary: '집중 흐름이 전반적으로 안정적이었습니다.'
      })

      expect(storeService.getLatestActivityEvent()?.id).toBe(activity.id)
      expect(storeService.getGoalsByDateRange('2026-03-29', '2026-03-29').at(-1)?.id).toBe(goal.id)
      expect(storeService.getLatestScreenshotAnalysis()?.id).toBe(analysis.id)
      expect(storeService.getDailyReportsByDateRange('2026-03-29', '2026-03-29').at(-1)?.id).toBe(report.id)
    } finally {
      storeService.close()
    }
  })
})
