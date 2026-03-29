export const IPC = {
  COLLECT_START: 'collect:start',
  COLLECT_STOP: 'collect:stop',
  COLLECT_STATE: 'collect:state',
  PERMISSIONS_STATUS: 'permissions:status',
  PERMISSIONS_PROMPT_ACCESSIBILITY: 'permissions:prompt-accessibility',
  PERMISSIONS_OPEN_SETTINGS: 'permissions:open-settings',
  VIDEO_IMPORT: 'video:import',
  VIDEO_PROGRESS: 'video:progress',
  VIDEO_CHECK_FFMPEG: 'video:check-ffmpeg',
  ACTIVITY_GET_TODAY: 'activity:get-today',
  GOALS_SAVE: 'goals:save',
  GOALS_GET: 'goals:get',
  REPORT_GENERATE: 'report:generate',
  REPORT_GET: 'report:get',
  PREFS_READ: 'prefs:read',
  PREFS_WRITE: 'prefs:write',
  API_KEY_GET_STATUS: 'api-key:get-status',
  API_KEY_SET: 'api-key:set',
  API_KEY_CLEAR: 'api-key:clear',
  TODAY_SUMMARY: 'today:summary',
  FEEDBACK_SUBMIT: 'feedback:submit',
  OPENCLAW_DELEGATE: 'openclaw:delegate',
  ERROR_PATTERN: 'error:*'
} as const

export const IPC_ERROR_PREFIX = 'error:' as const

export type NamedIpcChannel = Exclude<(typeof IPC)[keyof typeof IPC], typeof IPC.ERROR_PATTERN>
export type IpcErrorChannel = `${typeof IPC_ERROR_PREFIX}${string}`
export type IpcChannel = NamedIpcChannel | IpcErrorChannel
