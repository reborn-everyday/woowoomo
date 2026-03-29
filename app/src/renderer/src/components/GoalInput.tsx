import { useEffect, useState, type FormEvent } from 'react'

import type { Goal } from '../../../shared/types'

interface GoalInputProps {
  goal: Goal | null
  canSubmit: boolean
  busy: boolean
  onSubmit: (goalText: string) => Promise<boolean>
}

function formatMetricValue(value: Goal['success_metric'][string]): string {
  if (value === null) {
    return 'null'
  }

  return String(value)
}

export function GoalInput({ goal, canSubmit, busy, onSubmit }: GoalInputProps): JSX.Element {
  const [goalText, setGoalText] = useState(goal?.goal_text ?? '')

  useEffect(() => {
    setGoalText(goal?.goal_text ?? '')
  }, [goal])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmed = goalText.trim()

    if (trimmed.length === 0) {
      return
    }

    await onSubmit(trimmed)
  }

  return (
    <section className="card stack-lg">
      <div className="stack-sm">
        <p className="eyebrow">Goal input</p>
        <h2 className="section-title">Set Your Daily Goal</h2>
        <p className="muted">Describe what you want to accomplish today. The AI will break it down into trackable behaviors and success metrics.</p>
      </div>

      <form className="stack-md" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field stack-xs">
          <span className="field-label">Daily goal</span>
          <textarea
            className="input input--textarea"
            placeholder="e.g., Focus on coding for 2 hours without distractions"
            value={goalText}
            onChange={(event) => setGoalText(event.target.value)}
          />
        </label>

        <div className="cluster">
          <button className="button button--primary" type="submit" disabled={!canSubmit || busy || goalText.trim().length === 0}>
            {busy ? 'Saving…' : 'Save goal'}
          </button>
          {!canSubmit ? <span className="muted">Please save your API key first to enable goal structuring.</span> : null}
        </div>
      </form>

      {goal !== null ? (
        <div className="stack-md panel-subtle">
          <div className="stack-xs">
            <span className="field-label">Target behaviors</span>
            <div className="chip-list">
              {goal.target_behaviors.map((behavior) => (
                <span key={behavior} className="chip">
                  {behavior}
                </span>
              ))}
            </div>
          </div>

          <div className="stack-xs">
            <span className="field-label">Anti behaviors</span>
            <div className="chip-list">
              {goal.anti_behaviors.length > 0 ? (
                goal.anti_behaviors.map((behavior) => (
                  <span key={behavior} className="chip chip--muted">
                    {behavior}
                  </span>
                ))
              ) : (
                <span className="muted">None</span>
              )}
            </div>
          </div>

          <div className="stack-xs">
            <span className="field-label">Success metric</span>
            <div className="chip-list">
              {Object.entries(goal.success_metric).map(([key, value]) => (
                <span key={key} className="chip chip--accent">
                  {key}: {formatMetricValue(value)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
