import type { Goal } from '../../../shared/types'
import { CollectControls } from '../components/CollectControls'
import { GoalInput } from '../components/GoalInput'
import { OnboardingChecklist } from '../components/OnboardingChecklist'
import type { OnboardingStep } from '../components/OnboardingChecklist'
import { VideoImport } from '../components/VideoImport'
import type { ApiKeyStatus, CollectStateSnapshot, TodaySummary } from '../lib/electron-api'

interface HomePageProps {
  bridgeConnected: boolean
  onboardingSteps: OnboardingStep[]
  apiKeyStatus: ApiKeyStatus
  collectState: CollectStateSnapshot
  goal: Goal | null
  todaySummary: TodaySummary
  goalBusy: boolean
  collectBusyAction: 'start' | 'stop' | null
  refreshBusy: boolean
  onOpenReport: () => void
  onOpenPopup: () => void
  onSaveGoal: (goalText: string) => Promise<boolean>
  onStartCollect: () => Promise<void>
  onStopCollect: () => Promise<void>
  onRefresh: () => Promise<void>
  onOpenSettings: () => void
}

export function HomePage({
  bridgeConnected,
  onboardingSteps,
  apiKeyStatus,
  collectState,
  goal,
  todaySummary,
  goalBusy,
  collectBusyAction,
  refreshBusy,
  onOpenReport,
  onOpenPopup,
  onSaveGoal,
  onStartCollect,
  onStopCollect,
  onRefresh,
  onOpenSettings
}: HomePageProps): JSX.Element {
  return (
    <div className="page-grid">
      <div className="stack-lg">
        <section className="card card--hero stack-lg">
          <div className="cluster">
            <p className="eyebrow">Dashboard</p>
            <span className={`status-pill status-pill--${bridgeConnected ? 'running' : 'unknown'}`}>
              {bridgeConnected ? 'bridge ready' : 'bridge missing'}
            </span>
          </div>

          <div className="stack-sm">
            <h1 className="hero-title">Welcome to WooWoomo</h1>
            <p className="hero-copy">
              Set up your environment, define your daily goals, and start capturing screen activity. AI-powered insights will help you stay focused and productive.
            </p>
          </div>

          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Permissions</span>
              <strong>{collectState.permissions.ready ? 'Ready' : 'Needs setup'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">API key</span>
              <strong>{apiKeyStatus.isConfigured ? 'Saved' : 'Missing'}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Collect</span>
              <strong>{collectState.state}</strong>
            </article>
          </div>
        </section>

        <GoalInput goal={goal} canSubmit={apiKeyStatus.isConfigured} busy={goalBusy} onSubmit={onSaveGoal} />
        <OnboardingChecklist steps={onboardingSteps} />
      </div>

      <div className="stack-lg">
        <section className="card stack-lg">
          <div className="cluster">
            <div className="stack-sm">
              <p className="eyebrow">Today</p>
              <h2 className="section-title">Daily Summary</h2>
            </div>

            <button className="button button--ghost" type="button" onClick={() => void onRefresh()} disabled={refreshBusy}>
              {refreshBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Activity rows</span>
              <strong>{todaySummary.activityCount}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Analyses</span>
              <strong>{todaySummary.screenshotAnalysisCount}</strong>
            </article>
          </div>

          <div className="panel-subtle stack-sm">
            <span className="field-label">Current goal</span>
            <p>{goal?.goal_text ?? todaySummary.goalText ?? 'No goal set for today.'}</p>
          </div>

          <div className="panel-subtle stack-sm">
            <span className="field-label">Report summary</span>
            <p>{todaySummary.reportSummary ?? 'No report generated yet. Generate one from the Report tab or the menu bar popup.'}</p>
            <div className="cluster">
              <button className="button button--secondary" type="button" onClick={onOpenReport}>
                Open report
              </button>
              <button className="button button--ghost" type="button" onClick={onOpenPopup}>
                Popup surface
              </button>
            </div>
          </div>
        </section>

        <CollectControls
          collectState={collectState}
          apiKeyStatus={apiKeyStatus}
          busyAction={collectBusyAction}
          onStart={onStartCollect}
          onStop={onStopCollect}
        />

        <VideoImport
          apiKeyConfigured={apiKeyStatus.isConfigured}
          onComplete={() => void onRefresh()}
          onOpenSettings={onOpenSettings}
          onOpenReport={onOpenReport}
        />
      </div>
    </div>
  )
}
