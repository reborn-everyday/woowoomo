import { readFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { app, BrowserWindow } from 'electron'

// electron-vite only exposes MAIN_VITE_* prefixed env vars to the main process.
// Manually load .env so that ANTHROPIC_API_KEY (and other non-prefixed vars) are available.
function loadEnvFile(): void {
  const candidates = ['.env', '.env.competition']

  for (const name of candidates) {
    try {
      const envPath = resolve(process.cwd(), name)
      const content = readFileSync(envPath, 'utf8')

      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.length === 0 || trimmed.startsWith('#')) continue

        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue

        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()

        // Don't overwrite existing env vars (system / shell take precedence)
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }
    } catch {
      // File doesn't exist or isn't readable — skip silently
    }
  }
}

loadEnvFile()

import { WindowWatcher } from './activity-tracker'
import { AIPipeline } from './claude-analyzer'
import { registerIpcHandlers } from './ipc-handlers'
import { PermissionService } from './permissions'
import { PrefsStore, toSchedulerConfig } from './prefs-store'
import { ClaudeProvider } from './providers/claude'
import { createDailyReportGenerator } from './report-service'
import { RetentionService } from './retention-service'
import { SecureStore } from './secure-store'
import { Scheduler } from './scheduler'
import { StoreService } from './db'
import type { AppTrayController } from './tray'
import { createAppTray } from './tray'
import type { PreparedDisplayCapture } from './screen-capture'

async function deleteCaptureFiles(
  captures: readonly PreparedDisplayCapture[],
  options: { includeStoredScreenshots: boolean }
): Promise<void> {
  const paths = new Set<string>()

  for (const capture of captures) {
    paths.add(capture.pngPath)

    if (options.includeStoredScreenshots) {
      paths.add(capture.screenshotPath)
    }
  }

  await Promise.all(
    [...paths].map(async (filePath) => {
      try {
        await unlink(filePath)
      } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException

        if (nodeError.code !== 'ENOENT') {
          console.error('Temporary capture cleanup failed.', filePath, error)
        }
      }
    })
  )
}

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  return window
}

function openMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

let cleanupIpcHandlers: (() => void) | null = null
let scheduler: Scheduler | null = null
let storeService: StoreService | null = null
let trayController: AppTrayController | null = null

app.whenReady().then(async () => {
  storeService = new StoreService()
  storeService.runMigrations()

  const prefsStore = new PrefsStore()
  const secureStore = new SecureStore()
  const permissionService = new PermissionService()
  const retentionService = new RetentionService({ storeService })
  const generateDailyReport = createDailyReportGenerator({
    storeService,
    secureStore,
    createAIProvider: (apiKey: string) => new ClaudeProvider({ apiKey })
  })

  scheduler = new Scheduler({
    config: toSchedulerConfig(prefsStore.read()),
    onWindowSample: async (sample) => {
      storeService?.insertActivityEvent(WindowWatcher.toActivityEvent(sample))
    },
    onCapture: async ({ captures, sample, triggeredAt, config }) => {
      if (storeService === null) {
        await deleteCaptureFiles(captures, { includeStoredScreenshots: true })
        return
      }

      const apiKey = secureStore.getApiKey()

      if (apiKey === null) {
        await deleteCaptureFiles(captures, { includeStoredScreenshots: true })
        return
      }

      try {
        const pipeline = new AIPipeline({
          aiProvider: new ClaudeProvider({ apiKey }),
          storeService
        })

        await pipeline.processScreenshots(captures, {
          timestamp: triggeredAt,
          application: sample?.appName ?? null,
          contextSwitchAppName: sample?.appName ?? null,
          contextSwitchDurationSec: Math.max(1, Math.round(config.captureIntervalMs / 1000))
        })
      } finally {
        await deleteCaptureFiles(captures, { includeStoredScreenshots: false })
      }
    },
    onReportTrigger: async ({ reportDate }) => {
      await generateDailyReport(reportDate)
      await retentionService.applyPreferences(prefsStore.read())
    }
  })

  cleanupIpcHandlers = registerIpcHandlers({
    storeService,
    prefsStore,
    secureStore,
    permissionService,
    scheduler,
    retentionService,
    createAIProvider: (apiKey: string) => new ClaudeProvider({ apiKey }),
    generateDailyReport,
    getMainWindow: () => mainWindow
  })

  trayController = createAppTray({
    scheduler,
    openMainWindow
  })

  try {
    await retentionService.applyPreferences(prefsStore.read())
  } catch (error) {
    console.error('Retention cleanup failed during app startup.', error)
  }

  openMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (trayController !== null) {
    trayController.destroy()
    trayController = null
  }

  if (cleanupIpcHandlers !== null) {
    cleanupIpcHandlers()
    cleanupIpcHandlers = null
  }

  if (scheduler !== null) {
    void scheduler.stop()
    scheduler = null
  }

  if (storeService !== null) {
    storeService.close()
    storeService = null
  }
})
