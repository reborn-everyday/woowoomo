---
name: electron-record-capture
description: Integration pattern for using the `record` CLI tool as the screen capture backend in Electron apps (instead of desktopCapturer). Use when building an Electron app that needs screenshots or screen recordings via the `record` CLI. Covers architecture, IPC bridge, preload gotchas, multi-monitor support, and error handling. Trigger on keywords like: electron screen capture, electron screenshot, desktopCapturer alternative, record CLI electron, electron child_process screen capture.
---

# Electron + `record` CLI Screen Capture

Use the [`record`](https://github.com/atacan/record) CLI tool as the screen capture backend in Electron apps, **replacing** Electron's `desktopCapturer` API.

## Why Use `record` CLI Instead of `desktopCapturer`

- `desktopCapturer` is tied to Electron's rendering pipeline and has quirks with permissions, thumbnails, and multi-monitor
- `record` CLI is a standalone macOS tool: simple `--screenshot` flag, JSON output, display/window targeting
- Decouples capture logic from Electron — easier to test, debug, and replace

## Prerequisites

```bash
brew install atacan/tap/record
```

Verify: `record screen --help`

## Architecture

```
Renderer (React)                    Main (Node.js)                    OS
─────────────────                   ──────────────                    ──
button click
  → IPC invoke
                                    → child_process.execFile('record', [...])
                                                                      → captures screen
                                    ← reads PNG file from disk        ← writes PNG to temp dir
                                    → converts to base64 data URL
  ← receives data URL via IPC
  → renders <img> in React
```

**Key rule:** All `record` CLI calls happen in the **main process** via `child_process.execFile`. The renderer never calls `record` directly.

## Implementation

### 1. Main Process — `record` CLI Wrapper

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
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

// ── IPC Handlers (register inside app.whenReady()) ──

// Check if record CLI is installed
ipcMain.handle('RECORD_CHECK_INSTALLED', async () => {
  try {
    await runRecord(['--help'])
    return { installed: true }
  } catch {
    return { installed: false }
  }
})

// List displays
ipcMain.handle('RECORD_LIST_DISPLAYS', async () => {
  try {
    const stdout = await runRecord(['screen', '--list-displays', '--json'])
    return { displays: JSON.parse(stdout), error: null }
  } catch (e: unknown) {
    return { displays: [], error: e instanceof Error ? e.message : String(e) }
  }
})

// Take a screenshot
ipcMain.handle('RECORD_SCREENSHOT', async (_event, opts?: { displayId?: string }) => {
  try {
    const outputPath = path.join(app.getPath('temp'), `screenshot-${Date.now()}.png`)
    const args = ['screen', '--screenshot', '--output', outputPath, '--overwrite']
    if (opts?.displayId) args.push('--display', opts.displayId)

    await runRecord(args)

    const imageBuffer = await readFile(outputPath)
    const base64 = imageBuffer.toString('base64')
    return { dataUrl: `data:image/png;base64,${base64}`, filePath: outputPath, error: null }
  } catch (e: unknown) {
    return { dataUrl: null, filePath: null, error: e instanceof Error ? e.message : String(e) }
  }
})

// Take a screenshot of a specific window
ipcMain.handle('RECORD_SCREENSHOT_WINDOW', async (_event, windowTitle: string) => {
  try {
    const outputPath = path.join(app.getPath('temp'), `window-${Date.now()}.png`)
    await runRecord(['screen', '--screenshot', '--window', windowTitle, '--output', outputPath, '--overwrite'])

    const imageBuffer = await readFile(outputPath)
    const base64 = imageBuffer.toString('base64')
    return { dataUrl: `data:image/png;base64,${base64}`, filePath: outputPath, error: null }
  } catch (e: unknown) {
    return { dataUrl: null, filePath: null, error: e instanceof Error ? e.message : String(e) }
  }
})

// List windows
ipcMain.handle('RECORD_LIST_WINDOWS', async () => {
  try {
    const stdout = await runRecord(['screen', '--list-windows', '--json'])
    return { windows: JSON.parse(stdout), error: null }
  } catch (e: unknown) {
    return { windows: [], error: e instanceof Error ? e.message : String(e) }
  }
})
```

### 2. Preload Script

> **CRITICAL GOTCHA:** The preload script MUST use `require()` syntax, NOT ESM `import`. When using `vite-plugin-electron` with `format: 'cjs'` and `entryFileNames: 'preload.cjs'`, ESM imports will be emitted as-is in the `.cjs` file if you use `import` in the source. Use `require()` in the source to ensure the build output is valid CJS.

```typescript
// electron/preload.ts — MUST use require(), NOT import
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  checkRecordInstalled: () => ipcRenderer.invoke('RECORD_CHECK_INSTALLED'),
  listDisplays: () => ipcRenderer.invoke('RECORD_LIST_DISPLAYS'),
  listWindows: () => ipcRenderer.invoke('RECORD_LIST_WINDOWS'),
  takeScreenshot: (opts?: { displayId?: string }) => ipcRenderer.invoke('RECORD_SCREENSHOT', opts),
  takeWindowScreenshot: (windowTitle: string) => ipcRenderer.invoke('RECORD_SCREENSHOT_WINDOW', windowTitle),
})
```

### 3. BrowserWindow Configuration

```typescript
// In createWindow()
win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,  // REQUIRED — allows preload to use require('electron')
  },
})
```

> **CRITICAL:** `sandbox: false` is required. Electron 20+ enables sandbox by default, which prevents preload scripts from using `require()`. Without this, `window.electronAPI` will be `undefined`.

### 4. Vite Config for Preload

```typescript
// vite.config.ts
import electron from 'vite-plugin-electron'

electron([
  { entry: 'electron/main.ts' },
  {
    entry: 'electron/preload.ts',
    onstart(options) { options.reload() },
    vite: {
      build: {
        rollupOptions: {
          output: { format: 'cjs', entryFileNames: 'preload.cjs' },
          external: ['electron'],
        },
      },
    },
  },
])
```

### 5. Renderer Usage (React)

```tsx
// src/App.tsx
const result = await window.electronAPI.takeScreenshot({ displayId: 'primary' })
if (result.error) {
  console.error(result.error)
} else {
  setImageSrc(result.dataUrl) // data:image/png;base64,...
}
```

## Common Gotchas

### 1. `window.electronAPI` is `undefined`

**Causes (in order of likelihood):**
1. **`sandbox: false` is missing** in `webPreferences` — preload can't `require('electron')`
2. **Preload uses ESM `import`** instead of `require()` — `.cjs` file with `import` is invalid
3. **Viewing in browser** instead of Electron window — `contextBridge` only works inside Electron
4. **Wrong preload path** — check `path.join(__dirname, 'preload.cjs')` matches the build output

**Debug:** Open Electron DevTools (Cmd+Opt+I) → Console. Look for preload errors.

### 2. `record` CLI not found

The `record` binary must be on `PATH`. In Electron production builds, `PATH` may not include `/opt/homebrew/bin`. Fix:

```typescript
// Add before execFile calls
process.env.PATH = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`
```

### 3. Screenshot is blank / permission denied

macOS Screen Recording permission must be granted to the **Electron app** (or Terminal during dev). Check:

```typescript
import { systemPreferences } from 'electron'
const status = systemPreferences.getMediaAccessStatus('screen')
// Returns: 'not-determined' | 'granted' | 'denied' | 'restricted'
```

### 4. Large screenshots / performance

For Vision AI pipelines, resize before sending:

```typescript
import sharp from 'sharp'

const resized = await sharp(imageBuffer)
  .resize(1280, null, { withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toBuffer()
```

## `record` CLI Quick Reference

```bash
# Screenshot
record screen --screenshot
record screen --screenshot --output /tmp/screen.png
record screen --screenshot --display primary
record screen --screenshot --window "Safari"

# List targets (JSON)
record screen --list-displays --json
record screen --list-windows --json

# Video recording
record screen --duration 10
record screen --duration 10 --audio system
record screen --duration 5 --scale 0.5 --fps 15
```

## macOS Permissions

- **Screen Recording** — required by `record screen`
- Grant to Terminal (dev) or the Electron .app (production)
- System Settings → Privacy & Security → Screen Recording

## Reference Implementation

See the working example at: `electron-record-cli-example/` in this workspace.
