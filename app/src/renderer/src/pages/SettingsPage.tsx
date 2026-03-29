import { ApiKeyCard } from '../components/ApiKeyCard'
import { PermissionCard } from '../components/PermissionCard'
import { PreferencesForm } from '../components/PreferencesForm'
import type {
  ApiKeyStatus,
  AppPreferences,
  AppPreferencesPatch,
  LiveCapturePermissionStatus,
  PermissionTarget
} from '../lib/electron-api'

interface SettingsPageProps {
  preferences: AppPreferences
  apiKeyStatus: ApiKeyStatus
  permissions: LiveCapturePermissionStatus
  preferencesBusy: boolean
  apiKeyBusy: boolean
  permissionBusyAction: 'prompt-accessibility' | 'open-screen' | 'open-accessibility' | null
  onSavePreferences: (patch: AppPreferencesPatch) => Promise<boolean>
  onSaveApiKey: (apiKey: string) => Promise<boolean>
  onClearApiKey: () => Promise<void>
  onPromptAccessibility: () => Promise<void>
  onOpenSystemSettings: (target: PermissionTarget) => Promise<void>
}

export function SettingsPage({
  preferences,
  apiKeyStatus,
  permissions,
  preferencesBusy,
  apiKeyBusy,
  permissionBusyAction,
  onSavePreferences,
  onSaveApiKey,
  onClearApiKey,
  onPromptAccessibility,
  onOpenSystemSettings
}: SettingsPageProps): JSX.Element {
  return (
    <div className="page-grid page-grid--settings">
      <div className="stack-lg">
        <ApiKeyCard apiKeyStatus={apiKeyStatus} busy={apiKeyBusy} onSave={onSaveApiKey} onClear={onClearApiKey} />
        <PreferencesForm preferences={preferences} busy={preferencesBusy} onSave={onSavePreferences} />
      </div>

      <div className="stack-lg">
        <PermissionCard
          permissions={permissions}
          busyAction={permissionBusyAction}
          onPromptAccessibility={onPromptAccessibility}
          onOpenSystemSettings={onOpenSystemSettings}
        />

        <section className="card stack-lg">
          <div className="stack-sm">
            <p className="eyebrow">Coming Soon</p>
            <h2 className="section-title">Features In Development</h2>
          </div>

          <ul className="bullet-list">
            <li>Deferred video import UI</li>
            <li>Competition control-plane integration</li>
            <li>Unsupported external OpenClaw live bridge</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
