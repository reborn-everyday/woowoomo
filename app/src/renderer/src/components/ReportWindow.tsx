import type { BottleneckItem, DailyReport, InterruptedTaskItem, TomorrowNudge } from '../../../shared/types'
import type { ReportHookResponse, TodaySummary } from '../lib/electron-api'

interface ReportWindowProps {
  todaySummary: TodaySummary
  reportState: ReportHookResponse
  busy: boolean
  feedbackByItem: Record<string, number | null>
  feedbackBusyItem: string | null
  delegateBusyItem: string | null
  delegateMessages: Record<string, string>
  onGenerate: () => Promise<void>
  onSubmitFeedback: (itemType: string, rating: 1 | -1) => Promise<void>
  onDelegate: (itemType: string, prompt: string) => Promise<void>
}

interface SectionFeedbackProps {
  itemType: string
  rating: number | null
  busy: boolean
  onSubmit: (itemType: string, rating: 1 | -1) => Promise<void>
}

function formatReportDate(date: string): string {
  if (date.trim().length === 0) {
    return 'Today'
  }

  const parsed = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  }).format(parsed)
}

function SectionFeedback({ itemType, rating, busy, onSubmit }: SectionFeedbackProps): JSX.Element {
  return (
    <div className="section-feedback">
      <span className="field-label">Feedback</span>
      <div className="cluster">
        <button
          className={`feedback-button ${rating === 1 ? 'feedback-button--active' : ''}`}
          type="button"
          disabled={busy}
          onClick={() => void onSubmit(itemType, 1)}
        >
          👍 Helpful
        </button>
        <button
          className={`feedback-button ${rating === -1 ? 'feedback-button--active feedback-button--negative' : ''}`}
          type="button"
          disabled={busy}
          onClick={() => void onSubmit(itemType, -1)}
        >
          👎 Off target
        </button>
      </div>
    </div>
  )
}

function FocusCurveSection({
  report,
  feedbackByItem,
  feedbackBusyItem,
  onSubmitFeedback
}: {
  report: DailyReport
  feedbackByItem: Record<string, number | null>
  feedbackBusyItem: string | null
  onSubmitFeedback: (itemType: string, rating: 1 | -1) => Promise<void>
}): JSX.Element {
  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <p className="eyebrow">Section 1</p>
        <h2 className="section-title">Focus Curve</h2>
        <p className="muted">A visual timeline of your focus levels throughout the day.</p>
      </div>

      {report.focus_curve_data.length > 0 ? (
        <div className="focus-curve-list">
          {report.focus_curve_data.map((point) => (
            <article key={`${point.time}-${point.score}`} className="focus-curve-row">
              <span className="metric-label">{point.time}</span>
              <div className="focus-curve-track">
                <div className="focus-curve-fill" style={{ width: `${Math.max(point.score, 4)}%` }} />
              </div>
              <strong>{point.score}</strong>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-subtle">
          <p className="muted">No focus data available yet. Start collecting to see your focus curve.</p>
        </div>
      )}

      <SectionFeedback
        itemType="report:focus-curve"
        rating={feedbackByItem['report:focus-curve'] ?? null}
        busy={feedbackBusyItem === 'report:focus-curve'}
        onSubmit={onSubmitFeedback}
      />
    </section>
  )
}

function NudgeCard({ item, index }: { item: TomorrowNudge; index: number }): JSX.Element {
  return (
    <article className="metric-card stack-sm">
      <span className="metric-label">Nudge {index + 1}</span>
      <strong>{item.what}</strong>
      <p className="muted">{item.when}</p>
      <p>{item.why}</p>
    </article>
  )
}

function BottleneckCard({
  item,
  index,
  busy,
  message,
  onDelegate
}: {
  item: BottleneckItem
  index: number
  busy: boolean
  message: string | undefined
  onDelegate: (prompt: string) => Promise<void>
}): JSX.Element {
  const canDelegate = typeof item.delegate_prompt === 'string' && item.delegate_prompt.trim().length > 0

  return (
    <article className="metric-card stack-sm">
      <span className="metric-label">Bottleneck {index + 1}</span>
      <strong>{item.bottleneck}</strong>
      <p>{item.recommendation}</p>

      <div className="cluster">
        <button
          className="button button--secondary"
          type="button"
          disabled={!canDelegate || busy}
          onClick={() => void onDelegate(item.delegate_prompt ?? '')}
        >
          {busy ? 'Delegating…' : 'Delegate to OpenClaw'}
        </button>
        {message !== undefined ? <span className="muted">{message}</span> : null}
      </div>
    </article>
  )
}

function InterruptedTaskCard({ item }: { item: InterruptedTaskItem }): JSX.Element {
  return (
    <article className="metric-card stack-sm">
      <span className="metric-label">Interrupted task</span>
      <strong>{item.task}</strong>
      <p className="muted">{item.interrupted_at}</p>
      <p>{item.context}</p>
      {item.suggested_next_step ? (
        <div className="panel-subtle">
          <span className="field-label">Suggested next step</span>
          <p>{item.suggested_next_step}</p>
        </div>
      ) : null}
    </article>
  )
}

function GoalAlignmentSection({
  report,
  feedbackByItem,
  feedbackBusyItem,
  onSubmitFeedback
}: {
  report: DailyReport
  feedbackByItem: Record<string, number | null>
  feedbackBusyItem: string | null
  onSubmitFeedback: (itemType: string, rating: 1 | -1) => Promise<void>
}): JSX.Element | null {
  const hasGoalSection =
    report.goal_alignment_score !== null ||
    (report.deviation_patterns?.length ?? 0) > 0 ||
    (report.why_analysis?.length ?? 0) > 0 ||
    (report.how_suggestions?.length ?? 0) > 0

  if (!hasGoalSection) {
    return null
  }

  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <p className="eyebrow">Section 5</p>
        <h2 className="section-title">Goal Alignment Report</h2>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Alignment</span>
          <strong>{report.goal_alignment_score === null ? 'N/A' : `${Math.round(report.goal_alignment_score * 100)}%`}</strong>
        </article>
      </div>

      <div className="form-grid">
        <div className="panel-subtle stack-sm">
          <span className="field-label">Deviation patterns</span>
          <ul className="bullet-list">
            {(report.deviation_patterns ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="panel-subtle stack-sm">
          <span className="field-label">Why / How</span>
          <ul className="bullet-list">
            {[...(report.why_analysis ?? []), ...(report.how_suggestions ?? [])].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <SectionFeedback
        itemType="report:goal-alignment"
        rating={feedbackByItem['report:goal-alignment'] ?? null}
        busy={feedbackBusyItem === 'report:goal-alignment'}
        onSubmit={onSubmitFeedback}
      />
    </section>
  )
}

export function ReportWindow({
  todaySummary,
  reportState,
  busy,
  feedbackByItem,
  feedbackBusyItem,
  delegateBusyItem,
  delegateMessages,
  onGenerate,
  onSubmitFeedback,
  onDelegate
}: ReportWindowProps): JSX.Element {
  const report = reportState.report

  return (
    <div className="stack-lg">
      <section className="card card--hero stack-lg">
        <div className="cluster">
          <p className="eyebrow">Daily report</p>
          <span className={`status-pill status-pill--${reportState.status === 'ready' ? 'running' : 'stopped'}`}>
            {reportState.status}
          </span>
        </div>

        <div className="stack-sm">
          <h1 className="hero-title">{formatReportDate(reportState.date || todaySummary.date)} Report</h1>
          <p className="hero-copy">
            {report?.summary ?? todaySummary.reportSummary ?? 'Once enough activity is captured, your focus patterns, bottlenecks, and interrupted tasks will appear here.'}
          </p>
        </div>

        <div className="cluster">
          <button className="button button--primary" type="button" onClick={() => void onGenerate()} disabled={busy}>
            {busy ? 'Generating…' : 'Generate Report'}
          </button>
          <div className="chip-list">
            <span className="chip">Activity {todaySummary.activityCount}</span>
            <span className="chip chip--accent">Analyses {todaySummary.screenshotAnalysisCount}</span>
          </div>
        </div>
      </section>

      {busy ? <div className="notice notice--success">Analyzing your activity data and generating your daily report…</div> : null}

      {reportState.status !== 'ready' || report === null ? (
        <section className="card stack-lg">
          <div className="stack-sm">
            <p className="eyebrow">Report state</p>
            <h2 className="section-title">Report Not Available</h2>
          </div>
          <div className="panel-subtle stack-sm">
            <p>
              {reportState.message ??
                (reportState.status === 'empty'
                  ? 'Not enough activity data has been collected today to generate a report.'
                  : 'The report service is initializing. Please try again in a moment.')}
            </p>
          </div>
        </section>
      ) : (
        <>
          <FocusCurveSection
            report={report}
            feedbackByItem={feedbackByItem}
            feedbackBusyItem={feedbackBusyItem}
            onSubmitFeedback={onSubmitFeedback}
          />

          <section className="card stack-lg">
            <div className="stack-sm">
              <p className="eyebrow">Section 2</p>
              <h2 className="section-title">Tomorrow's Suggestions</h2>
            </div>
            <div className="metric-grid report-grid--triple">
              {report.tomorrow_nudges.map((item, index) => (
                <NudgeCard key={`${item.when}-${item.what}`} item={item} index={index} />
              ))}
            </div>
            <SectionFeedback
              itemType="report:nudges"
              rating={feedbackByItem['report:nudges'] ?? null}
              busy={feedbackBusyItem === 'report:nudges'}
              onSubmit={onSubmitFeedback}
            />
          </section>

          <section className="card stack-lg">
            <div className="stack-sm">
              <p className="eyebrow">Section 3</p>
              <h2 className="section-title">Bottleneck Analysis</h2>
            </div>
            <div className="metric-grid">
              {report.bottlenecks.map((item, index) => {
                const itemType = `report:bottleneck:${index}`

                return (
                  <BottleneckCard
                    key={`${item.bottleneck}-${index}`}
                    item={item}
                    index={index}
                    busy={delegateBusyItem === itemType}
                    message={delegateMessages[itemType]}
                    onDelegate={(prompt) => onDelegate(itemType, prompt)}
                  />
                )
              })}
            </div>
            <SectionFeedback
              itemType="report:bottlenecks"
              rating={feedbackByItem['report:bottlenecks'] ?? null}
              busy={feedbackBusyItem === 'report:bottlenecks'}
              onSubmit={onSubmitFeedback}
            />
          </section>

          <section className="card stack-lg">
            <div className="stack-sm">
              <p className="eyebrow">Section 4</p>
              <h2 className="section-title">Interrupted Tasks</h2>
            </div>
            <div className="metric-grid">
              {report.interrupted_tasks.map((item) => (
                <InterruptedTaskCard key={`${item.task}-${item.interrupted_at}`} item={item} />
              ))}
            </div>
            <SectionFeedback
              itemType="report:interrupted-tasks"
              rating={feedbackByItem['report:interrupted-tasks'] ?? null}
              busy={feedbackBusyItem === 'report:interrupted-tasks'}
              onSubmit={onSubmitFeedback}
            />
          </section>

          <GoalAlignmentSection
            report={report}
            feedbackByItem={feedbackByItem}
            feedbackBusyItem={feedbackBusyItem}
            onSubmitFeedback={onSubmitFeedback}
          />
        </>
      )}
    </div>
  )
}
