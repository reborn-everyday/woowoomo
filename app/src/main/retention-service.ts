import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { StoreService } from './db'
import type { AppPreferences } from './prefs-store'
import { getScreenshotTempDir } from './utils/image'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export interface RetentionCleanupResult {
  ranAt: string
  screenshotCutoff: string
  activityCutoff: string
  screenshotsDeleted: number
  screenshotFilesDeleted: number
  orphanedScreenshotFilesDeleted: number
  activitiesDeleted: number
}

export interface RetentionServiceOptions {
  storeService: StoreService
  now?: () => Date
}

function getCutoffDate(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_IN_MS)
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isManagedScreenshotFile(fileName: string): boolean {
  return (
    (fileName.startsWith('screenshot-') && fileName.endsWith('.jpg')) ||
    (fileName.startsWith('record-display-') && fileName.endsWith('.png'))
  )
}

export class RetentionService {
  private readonly storeService: StoreService

  private readonly now: () => Date

  public constructor(options: RetentionServiceOptions) {
    this.storeService = options.storeService
    this.now = options.now ?? (() => new Date())
  }

  public async applyPreferences(preferences: AppPreferences): Promise<RetentionCleanupResult> {
    const currentTime = this.now()
    const screenshotCutoffDate = getCutoffDate(currentTime, preferences.screenshotRetentionDays)
    const activityCutoffDate = getCutoffDate(currentTime, preferences.activityRetentionDays)
    const screenshotCutoff = screenshotCutoffDate.toISOString()
    const activityCutoff = activityCutoffDate.toISOString()
    const expiredAnalyses = this.storeService.getScreenshotAnalysesBefore(screenshotCutoff)
    const screenshotFilesDeleted = await this.deleteReferencedScreenshotFiles(
      expiredAnalyses.map((analysis) => analysis.screenshot_path)
    )
    const screenshotsDeleted = this.storeService.deleteScreenshotAnalysesBefore(screenshotCutoff)
    const orphanedScreenshotFilesDeleted = await this.deleteOrphanedScreenshotFilesBefore(screenshotCutoffDate)
    const activitiesDeleted = this.storeService.deleteActivityEventsBefore(activityCutoff)

    return {
      ranAt: currentTime.toISOString(),
      screenshotCutoff,
      activityCutoff,
      screenshotsDeleted,
      screenshotFilesDeleted,
      orphanedScreenshotFilesDeleted,
      activitiesDeleted,
    }
  }

  private async deleteReferencedScreenshotFiles(paths: Array<string | null>): Promise<number> {
    const uniquePaths = [...new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0))]
    let deletedCount = 0

    for (const filePath of uniquePaths) {
      if (await this.deleteFileIfPresent(filePath)) {
        deletedCount += 1
      }
    }

    return deletedCount
  }

  private async deleteOrphanedScreenshotFilesBefore(cutoff: Date): Promise<number> {
    const directory = getScreenshotTempDir()
    const entries = await readdir(directory, { withFileTypes: true })
    let deletedCount = 0

    for (const entry of entries) {
      if (!entry.isFile() || !isManagedScreenshotFile(entry.name)) {
        continue
      }

      const filePath = join(directory, entry.name)
      const metadata = await stat(filePath)

      if (metadata.mtime.getTime() >= cutoff.getTime()) {
        continue
      }

      if (await this.deleteFileIfPresent(filePath)) {
        deletedCount += 1
      }
    }

    return deletedCount
  }

  private async deleteFileIfPresent(filePath: string): Promise<boolean> {
    try {
      await unlink(filePath)
      return true
    } catch (error) {
      if (isMissingFileError(error)) {
        return false
      }

      console.error(`Retention cleanup could not delete '${filePath}'.`, error)
      return false
    }
  }
}
