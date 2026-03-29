import { contextBridge, ipcRenderer } from 'electron'

import { IPC } from '../shared/ipc-channels'

contextBridge.exposeInMainWorld('electronAPI', {
  prefs: {
    read: () => ipcRenderer.invoke(IPC.PREFS_READ),
    write: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.PREFS_WRITE, patch),
  },
  apiKey: {
    getStatus: () => ipcRenderer.invoke(IPC.API_KEY_GET_STATUS),
    save: (apiKey: string) => ipcRenderer.invoke(IPC.API_KEY_SET, { apiKey }),
    clear: () => ipcRenderer.invoke(IPC.API_KEY_CLEAR),
  },
  permissions: {
    getStatus: () => ipcRenderer.invoke(IPC.PERMISSIONS_STATUS),
    promptAccessibility: () => ipcRenderer.invoke(IPC.PERMISSIONS_PROMPT_ACCESSIBILITY),
    openSystemSettings: (target: 'screen' | 'accessibility') =>
      ipcRenderer.invoke(IPC.PERMISSIONS_OPEN_SETTINGS, { target }),
  },
  collect: {
    start: () => ipcRenderer.invoke(IPC.COLLECT_START),
    stop: () => ipcRenderer.invoke(IPC.COLLECT_STOP),
    state: () => ipcRenderer.invoke(IPC.COLLECT_STATE),
  },
  activity: {
    getToday: (date?: string) => ipcRenderer.invoke(IPC.ACTIVITY_GET_TODAY, { date }),
  },
  goals: {
    save: (goalText: string, date?: string) => ipcRenderer.invoke(IPC.GOALS_SAVE, { goalText, date }),
    get: (date?: string) => ipcRenderer.invoke(IPC.GOALS_GET, { date }),
  },
  report: {
    generate: (date?: string) => ipcRenderer.invoke(IPC.REPORT_GENERATE, { date }),
    get: (date?: string) => ipcRenderer.invoke(IPC.REPORT_GET, { date }),
  },
  today: {
    summary: (date?: string) => ipcRenderer.invoke(IPC.TODAY_SUMMARY, { date }),
  },
  feedback: {
    submit: (payload: { reportId?: number | null; itemType: string; rating: number }) =>
      ipcRenderer.invoke(IPC.FEEDBACK_SUBMIT, payload),
  },
  openclaw: {
    delegate: (prompt: string) => ipcRenderer.invoke(IPC.OPENCLAW_DELEGATE, { prompt }),
  },
  video: {
    checkFfmpeg: () => ipcRenderer.invoke(IPC.VIDEO_CHECK_FFMPEG),
    import: (filePath: string) => ipcRenderer.invoke(IPC.VIDEO_IMPORT, { filePath }),
    onProgress: (callback: (...args: unknown[]) => void) => {
      ipcRenderer.on(IPC.VIDEO_PROGRESS, callback)
      return () => {
        ipcRenderer.removeListener(IPC.VIDEO_PROGRESS, callback)
      }
    },
    selectFile: () => ipcRenderer.invoke('video:select-file'),
  },
})
