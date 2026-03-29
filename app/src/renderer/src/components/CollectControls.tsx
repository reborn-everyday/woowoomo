import type { ApiKeyStatus, CollectStateSnapshot } from '../lib/electron-api'

interface CollectControlsProps {
  collectState: CollectStateSnapshot
  apiKeyStatus: ApiKeyStatus
  busyAction: 'start' | 'stop' | null
  onStart: () => Promise<void>
  onStop: () => Promise<void>
}

function formatTimestamp(value: string | null): string {
  if (value === null) {
    return 'None yet'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Pending'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function getDisabledReason(collectState: CollectStateSnapshot, apiKeyStatus: ApiKeyStatus): string | null {
  if (!apiKeyStatus.isConfigured) {
    return 'An API key is required first.'
  }

  if (!collectState.permissions.ready) {
    return 'Both Screen Recording and Accessibility permissions are required.'
  }

  return null
}

export function CollectControls({
  collectState,
  apiKeyStatus,
  busyAction,
  onStart,
  onStop
}: CollectControlsProps): JSX.Element {
  const isRunning = collectState.state === 'running'
  const disabledReason = getDisabledReason(collectState, apiKeyStatus)

  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <div className="cluster">
          <p className="eyebrow">Collect</p>
          <span className={`status-pill status-pill--${collectState.state}`}>{collectState.state}</span>
        </div>
        <h2 className="section-title">Collection Controls</h2>
        <p className="muted">Start or stop screen activity collection. Requires permissions and an API key to be configured.</p>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Last capture</span>
          <strong>{formatTimestamp(collectState.lastCaptureAt)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Next capture</span>
          <strong>{formatTimestamp(collectState.nextCaptureAt)}</strong>
        </article>
      </div>

      <div className="cluster">
        <button
          className="button button--primary"
          type="button"
          onClick={() => void onStart()}
          disabled={busyAction !== null || isRunning || disabledReason !== null}
        >
          {busyAction === 'start' ? 'Starting…' : 'Start collect'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void onStop()}
          disabled={busyAction !== null || !isRunning}
        >
          {busyAction === 'stop' ? 'Stopping…' : 'Stop collect'}
        </button>
      </div>

      {disabledReason !== null ? <p className="notice notice--warning">{disabledReason}</p> : null}
    </section>
  )
}
