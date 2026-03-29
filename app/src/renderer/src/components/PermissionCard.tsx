import type { LiveCapturePermissionStatus, PermissionTarget } from '../lib/electron-api'

interface PermissionCardProps {
  permissions: LiveCapturePermissionStatus
  busyAction: 'prompt-accessibility' | 'open-screen' | 'open-accessibility' | null
  onPromptAccessibility: () => Promise<void>
  onOpenSystemSettings: (target: PermissionTarget) => Promise<void>
}

function screenLabel(status: LiveCapturePermissionStatus['screen']): string {
  switch (status) {
    case 'granted':
      return 'Granted'
    case 'denied':
      return 'Denied'
    case 'restricted':
      return 'Restricted'
    case 'not-determined':
      return 'Not Determined'
    default:
      return 'Unknown'
  }
}

export function PermissionCard({
  permissions,
  busyAction,
  onPromptAccessibility,
  onOpenSystemSettings
}: PermissionCardProps): JSX.Element {
  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <p className="eyebrow">Permissions</p>
        <h2 className="section-title">Capture Permission Status</h2>
        <p className="muted">WooWoomo requires Screen Recording and Accessibility permissions to capture and analyze your activity.</p>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Screen Recording</span>
          <strong>{screenLabel(permissions.screen)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Accessibility</span>
          <strong>{permissions.accessibility ? 'Granted' : 'Required'}</strong>
        </article>
      </div>

      <div className="cluster">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void onOpenSystemSettings('screen')}
          disabled={busyAction !== null}
        >
          {busyAction === 'open-screen' ? 'Opening…' : 'Open screen settings'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void onPromptAccessibility()}
          disabled={busyAction !== null}
        >
          {busyAction === 'prompt-accessibility' ? 'Prompting…' : 'Prompt accessibility'}
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => void onOpenSystemSettings('accessibility')}
          disabled={busyAction !== null}
        >
          {busyAction === 'open-accessibility' ? 'Opening…' : 'Open accessibility settings'}
        </button>
      </div>
    </section>
  )
}
