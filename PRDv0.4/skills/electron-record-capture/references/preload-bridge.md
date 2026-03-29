# Preload & IPC Bridge — record CLI

## Preload Script

> **CRITICAL:** Must use `require()`, NOT ESM `import`. See "Gotchas" below.

```typescript
// electron/preload.ts
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  checkRecordInstalled: () => ipcRenderer.invoke('RECORD_CHECK_INSTALLED'),
  checkScreenPermission: () => ipcRenderer.invoke('CHECK_SCREEN_PERMISSION'),
  listDisplays: () => ipcRenderer.invoke('RECORD_LIST_DISPLAYS'),
  listWindows: () => ipcRenderer.invoke('RECORD_LIST_WINDOWS'),
  takeScreenshot: (opts?: { displayId?: string }) =>
    ipcRenderer.invoke('RECORD_SCREENSHOT', opts),
  takeWindowScreenshot: (windowTitle: string) =>
    ipcRenderer.invoke('RECORD_SCREENSHOT_WINDOW', windowTitle),
})
```

## BrowserWindow Configuration

```typescript
win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: false,  // REQUIRED for preload require()
  },
})
```

## Vite Config (vite-plugin-electron)

```typescript
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

## Renderer Type Declaration

```typescript
// In App.tsx or a global.d.ts
declare global {
  interface Window {
    electronAPI: {
      checkRecordInstalled: () => Promise<{ installed: boolean; output: string | null }>
      checkScreenPermission: () => Promise<string>
      listDisplays: () => Promise<{ displays: unknown[]; error: string | null }>
      listWindows: () => Promise<{ windows: unknown[]; error: string | null }>
      takeScreenshot: (opts?: { displayId?: string }) => Promise<{
        dataUrl: string | null; filePath: string | null; error: string | null
      }>
      takeWindowScreenshot: (windowTitle: string) => Promise<{
        dataUrl: string | null; filePath: string | null; error: string | null
      }>
    }
  }
}
```

## IPC Channel Summary

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `RECORD_CHECK_INSTALLED` | Renderer → Main | Verify `record` CLI is available |
| `CHECK_SCREEN_PERMISSION` | Renderer → Main | macOS screen recording permission status |
| `RECORD_LIST_DISPLAYS` | Renderer → Main | Get display list as JSON |
| `RECORD_LIST_WINDOWS` | Renderer → Main | Get window list as JSON |
| `RECORD_SCREENSHOT` | Renderer → Main | Capture screenshot (optional display ID) |
| `RECORD_SCREENSHOT_WINDOW` | Renderer → Main | Capture screenshot by window title |

## Gotchas

### Why `require()` not `import`?

When `vite-plugin-electron` builds the preload entry with `format: 'cjs'` and `entryFileNames: 'preload.cjs'`:

- If source uses `import { contextBridge } from 'electron'` → the built `.cjs` file **still contains the ESM `import` statement** (it's marked external and passed through)
- A `.cjs` file with `import` is **invalid CJS** → Node/Electron fails silently, `contextBridge.exposeInMainWorld` never runs → `window.electronAPI` is `undefined`
- If source uses `const { contextBridge } = require('electron')` → the built `.cjs` correctly contains `require("electron")` → works

### Why `sandbox: false`?

Electron 20+ enables `sandbox: true` by default for all renderers. Sandboxed preload scripts **cannot use `require()`** — they run in a restricted environment. Setting `sandbox: false` restores the ability to `require('electron')` in the preload.
