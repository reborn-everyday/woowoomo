# Electron Main Process — record CLI Integration

Complete working example of the main process IPC handlers.

```typescript
import { app, BrowserWindow, ipcMain, systemPreferences } from 'electron'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// ── Helper: run `record` CLI and return stdout ──
function runRecord(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('record', args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`record CLI error: ${error.message}\nstderr: ${stderr}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

// ── Register all IPC handlers inside app.whenReady() ──
app.whenReady().then(() => {

  // Check if record CLI is installed
  ipcMain.handle('RECORD_CHECK_INSTALLED', async () => {
    try {
      const output = await runRecord(['--help'])
      return { installed: true, output: output.substring(0, 200) }
    } catch {
      return { installed: false, output: null }
    }
  })

  // Check macOS screen recording permission
  ipcMain.handle('CHECK_SCREEN_PERMISSION', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen')
    }
    return 'granted'
  })

  // List displays (JSON)
  ipcMain.handle('RECORD_LIST_DISPLAYS', async () => {
    try {
      const stdout = await runRecord(['screen', '--list-displays', '--json'])
      return { displays: JSON.parse(stdout), error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { displays: [], error: msg }
    }
  })

  // Take a screenshot (optional display target)
  ipcMain.handle('RECORD_SCREENSHOT', async (_event, opts?: { displayId?: string }) => {
    try {
      const tmpDir = app.getPath('temp')
      const outputPath = path.join(tmpDir, `screenshot-${Date.now()}.png`)

      const args = ['screen', '--screenshot', '--output', outputPath, '--overwrite']
      if (opts?.displayId) {
        args.push('--display', opts.displayId)
      }

      await runRecord(args)

      const imageBuffer = await readFile(outputPath)
      const base64 = imageBuffer.toString('base64')
      const dataUrl = `data:image/png;base64,${base64}`

      return { dataUrl, filePath: outputPath, error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { dataUrl: null, filePath: null, error: msg }
    }
  })

  // Take a screenshot of a specific window by title
  ipcMain.handle('RECORD_SCREENSHOT_WINDOW', async (_event, windowTitle: string) => {
    try {
      const tmpDir = app.getPath('temp')
      const outputPath = path.join(tmpDir, `window-${Date.now()}.png`)

      await runRecord([
        'screen', '--screenshot', '--window', windowTitle,
        '--output', outputPath, '--overwrite'
      ])

      const imageBuffer = await readFile(outputPath)
      const base64 = imageBuffer.toString('base64')
      const dataUrl = `data:image/png;base64,${base64}`

      return { dataUrl, filePath: outputPath, error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { dataUrl: null, filePath: null, error: msg }
    }
  })

  // List windows (JSON)
  ipcMain.handle('RECORD_LIST_WINDOWS', async () => {
    try {
      const stdout = await runRecord(['screen', '--list-windows', '--json'])
      return { windows: JSON.parse(stdout), error: null }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { windows: [], error: msg }
    }
  })

  createWindow()
})
```

## Key Points

- `runRecord()` wraps `child_process.execFile` with a 15s timeout
- All IPC handlers return `{ data, error }` objects — never throw
- Screenshots are written to the OS temp directory, then read as base64
- `--overwrite` flag prevents errors from filename collisions
- `--json` flag is used for listing commands to get structured output
