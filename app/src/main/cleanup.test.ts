import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { StoreService } from './db'
import { buildDefaultPreferences } from './prefs-store'
import { RetentionService } from './retention-service'
import { getScreenshotTempDir } from './utils/image'

const tempDirectories: string[] = []
const createdFiles: string[] = []

async function createStoreService(): Promise<StoreService> {
  const directory = await mkdtemp(join(tmpdir(), 'woowoomo-cleanup-test-'))
  const dbPath = join(directory, 'woowoomo.cleanup.test.sqlite')

  tempDirectories.push(directory)

  const storeService = new StoreService({ dbPath })

  storeService.runMigrations()

  return storeService
}

afterEach(async () => {
  await Promise.all(createdFiles.map(async (filePath) => rm(filePath, { force: true })))
  createdFiles.length = 0

  await Promise.all(tempDirectories.map(async (directory) => rm(directory, { recursive: true, force: true })))
  tempDirectories.length = 0
})

describe('RetentionService (cleanup)', () => {
  it('deletes expired screenshot/activity data and old managed files while keeping daily reports', async () => {
    const storeService = await createStoreService()

    try {
      const screenshotDirectory = getScreenshotTempDir()
      const oldReferencedFile = join(screenshotDirectory, `screenshot-${randomUUID()}.jpg`)
      const oldOrphanFile = join(screenshotDirectory, `screenshot-${randomUUID()}.jpg`)
      const recentOrphanFile = join(screenshotDirectory, `screenshot-${randomUUID()}.jpg`)
      const oldDate = new Date('2026-03-20T09:00:00.000Z')
      const recentDate = new Date('2026-03-29T09:00:00.000Z')

      createdFiles.push(oldReferencedFile, oldOrphanFile, recentOrphanFile)

      await writeFile(oldReferencedFile, Buffer.from('old-referenced'))
      await writeFile(oldOrphanFile, Buffer.from('old-orphan'))
      await writeFile(recentOrphanFile, Buffer.from('recent-orphan'))
      await utimes(oldReferencedFile, oldDate, oldDate)
      await utimes(oldOrphanFile, oldDate, oldDate)
      await utimes(recentOrphanFile, recentDate, recentDate)

      storeService.insertScreenshotAnalysis({
        timestamp: oldDate.toISOString(),
        screenshot_path: oldReferencedFile,
        application: 'Visual Studio Code',
        description: 'Old screenshot',
        category: 'coding',
        tags: ['cleanup'],
        focus_score: 70,
        task_state: 'in_progress',
        tool_in_video: 'VS Code',
        full_response: '{"source":"cleanup-test"}',
        display_id: 1
      })
      storeService.insertActivityEvent({
        timestamp: oldDate.toISOString(),
        app_name: 'Visual Studio Code',
        window_title: 'Old activity',
        category: 'coding',
        duration_sec: 300
      })
      const persistedReport = storeService.insertDailyReport({
        date: '2026-03-20',
        focus_curve_data: [{ time: '09:00', score: 70 }],
        tomorrow_nudges: [{ when: '09:30', what: '다음 블록 시작', why: '복귀 지연 방지' }],
        bottlenecks: [{ bottleneck: '탭 전환', recommendation: '전환 시간 제한' }],
        interrupted_tasks: [{ task: 'cleanup', interrupted_at: '09:15', context: 'meeting' }],
        goal_alignment_score: 0.5,
        deviation_patterns: ['오전 집중 하락'],
        why_analysis: ['중단 이후 재집중 느림'],
        how_suggestions: ['재시작 루틴 고정'],
        summary: 'Old report should remain after cleanup.'
      })

      const retentionService = new RetentionService({
        storeService,
        now: () => new Date('2026-03-29T10:00:00.000Z')
      })

      const result = await retentionService.applyPreferences({
        ...buildDefaultPreferences(),
        screenshotRetentionDays: 7,
        activityRetentionDays: 7
      })

      expect(result.screenshotsDeleted).toBe(1)
      expect(result.activitiesDeleted).toBe(1)
      expect(result.screenshotFilesDeleted).toBe(1)
      expect(result.orphanedScreenshotFilesDeleted).toBe(1)

      await expect(stat(oldReferencedFile)).rejects.toThrow()
      await expect(stat(oldOrphanFile)).rejects.toThrow()
      await expect(stat(recentOrphanFile)).resolves.toBeDefined()

      expect(storeService.getScreenshotAnalysesBefore('2027-01-01T00:00:00.000Z')).toHaveLength(0)
      expect(storeService.getActivityEventsByDateRange('2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')).toHaveLength(0)
      expect(storeService.getDailyReportById(persistedReport.id)?.id).toBe(persistedReport.id)
    } finally {
      storeService.close()
    }
  })
})
