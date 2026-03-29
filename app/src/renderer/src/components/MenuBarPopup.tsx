import type { ApiKeyStatus, CollectStateSnapshot, ReportHookResponse, TodaySummary } from '../lib/electron-api'

interface MenuBarPopupProps {
  apiKeyStatus: ApiKeyStatus
  collectState: CollectStateSnapshot
  todaySummary: TodaySummary
  reportState: ReportHookResponse
  collectBusyAction: 'start' | 'stop' | null
  reportBusy: boolean
  refreshBusy: boolean
  onStartCollect: () => Promise<void>
  onStopCollect: () => Promise<void>
  onGenerateReport: () => Promise<void>
  onOpenReport: () => void
  onRefresh: () => Promise<void>
}

function formatTimestamp(value: string | null): string {
  if (value === null) {
    return 'Pending'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return 'Pending'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed)
}

function getCollectDisabledReason(collectState: CollectStateSnapshot, apiKeyStatus: ApiKeyStatus): string | null {
  if (!apiKeyStatus.isConfigured) {
    return 'API key is not configured yet.'
  }

  if (!collectState.permissions.ready) {
    return 'All permissions must be granted before starting collection.'
  }

  return null
}

export function MenuBarPopup({
  apiKeyStatus,
  collectState,
  todaySummary,
  reportState,
  collectBusyAction,
  reportBusy,
  refreshBusy,
  onStartCollect,
  onStopCollect,
  onGenerateReport,
  onOpenReport,
  onRefresh
}: MenuBarPopupProps): JSX.Element {
  const isRunning = collectState.state === 'running'
  const disabledReason = getCollectDisabledReason(collectState, apiKeyStatus)

  return (
    <section className="popup-surface card stack-lg">
      <div className="cluster">
        <div className="stack-xs">
          <p className="eyebrow">Menu bar popup</p>
          <h1 className="section-title">Today's Summary</h1>
        </div>
        <span className={`status-pill status-pill--${collectState.state}`}>{collectState.state}</span>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Activity</span>
          <strong>{todaySummary.activityCount}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Analyses</span>
          <strong>{todaySummary.screenshotAnalysisCount}</strong>
        </article>
      </div>

      <div className="panel-subtle stack-sm">
        <span className="field-label">Current goal</span>
        <p>{todaySummary.goalText ?? 'No goal set for today.'}</p>
      </div>

      <div className="panel-subtle stack-sm">
        <span className="field-label">Latest report</span>
        <p>
          {reportState.report?.summary ?? todaySummary.reportSummary ?? 'No report yet. Generate one with the button below.'}
        </p>
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

      <div className="popup-actions">
        <button
          className="button button--primary"
          type="button"
          disabled={collectBusyAction !== null || isRunning || disabledReason !== null}
          onClick={() => void onStartCollect()}
        >
          {collectBusyAction === 'start' ? 'Starting…' : 'Start collect'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={collectBusyAction !== null || !isRunning}
          onClick={() => void onStopCollect()}
        >
          {collectBusyAction === 'stop' ? 'Stopping…' : 'Stop collect'}
        </button>
        <button className="button button--secondary" type="button" disabled={reportBusy} onClick={() => void onGenerateReport()}>
          {reportBusy ? 'Generating…' : 'Generate Report'}
        </button>
        <button className="button button--ghost" type="button" onClick={onOpenReport}>
          Report view
        </button>
        <button className="button button--ghost" type="button" disabled={refreshBusy} onClick={() => void onRefresh()}>
          {refreshBusy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {disabledReason !== null ? <p className="notice notice--warning">{disabledReason}</p> : null}
    </section>
  )
}
