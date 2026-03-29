import { shell, systemPreferences } from 'electron'

const SCREEN_RECORDING_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
const ACCESSIBILITY_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

export type PermissionTarget = 'screen' | 'accessibility'
export type ScreenPermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown'

export interface LiveCapturePermissionStatus {
  screen: ScreenPermissionState
  accessibility: boolean
  ready: boolean
}

function normalizeScreenPermissionState(value: string): ScreenPermissionState {
  switch (value) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
      return value
    default:
      return 'unknown'
  }
}

export class PermissionService {
  public getLiveCaptureStatus(): LiveCapturePermissionStatus {
    if (process.platform !== 'darwin') {
      return {
        screen: 'unknown',
        accessibility: false,
        ready: false,
      }
    }

    const screen = normalizeScreenPermissionState(systemPreferences.getMediaAccessStatus('screen'))
    const accessibility = systemPreferences.isTrustedAccessibilityClient(false)

    return {
      screen,
      accessibility,
      ready: screen === 'granted' && accessibility,
    }
  }

  public promptForAccessibility(): LiveCapturePermissionStatus {
    if (process.platform !== 'darwin') {
      return this.getLiveCaptureStatus()
    }

    systemPreferences.isTrustedAccessibilityClient(true)

    return this.getLiveCaptureStatus()
  }

  public async openSystemSettings(target: PermissionTarget): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false
    }

    const url = target === 'screen' ? SCREEN_RECORDING_SETTINGS_URL : ACCESSIBILITY_SETTINGS_URL

    await shell.openExternal(url)

    return true
  }
}
