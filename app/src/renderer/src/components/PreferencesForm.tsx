import { useEffect, useState, type FormEvent } from 'react'

import type { AppPreferences, AppPreferencesPatch } from '../lib/electron-api'

interface PreferencesFormProps {
  preferences: AppPreferences
  busy: boolean
  onSave: (patch: AppPreferencesPatch) => Promise<boolean>
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function PreferencesForm({ preferences, busy, onSave }: PreferencesFormProps): JSX.Element {
  const [captureIntervalMinutes, setCaptureIntervalMinutes] = useState(preferences.captureIntervalMinutes)
  const [watcherPollSeconds, setWatcherPollSeconds] = useState(preferences.watcherPollSeconds)
  const [autoBriefingEnabled, setAutoBriefingEnabled] = useState(preferences.autoBriefingEnabled)
  const [autoBriefingTime, setAutoBriefingTime] = useState(preferences.autoBriefingTime)
  const [screenshotRetentionDays, setScreenshotRetentionDays] = useState(preferences.screenshotRetentionDays)
  const [activityRetentionDays, setActivityRetentionDays] = useState(preferences.activityRetentionDays)

  useEffect(() => {
    setCaptureIntervalMinutes(preferences.captureIntervalMinutes)
    setWatcherPollSeconds(preferences.watcherPollSeconds)
    setAutoBriefingEnabled(preferences.autoBriefingEnabled)
    setAutoBriefingTime(preferences.autoBriefingTime)
    setScreenshotRetentionDays(preferences.screenshotRetentionDays)
    setActivityRetentionDays(preferences.activityRetentionDays)
  }, [preferences])

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    await onSave({
      captureIntervalMinutes: clampNumber(captureIntervalMinutes, 1, 15),
      watcherPollSeconds: clampNumber(watcherPollSeconds, 10, 120),
      autoBriefingEnabled,
      autoBriefingTime,
      screenshotRetentionDays: clampNumber(screenshotRetentionDays, 1, 365),
      activityRetentionDays: clampNumber(activityRetentionDays, 1, 365)
    })
  }

  return (
    <form className="card stack-lg" onSubmit={(event) => void handleSubmit(event)}>
      <div className="stack-sm">
        <p className="eyebrow">Preferences</p>
        <h2 className="section-title">Capture & Retention Settings</h2>
        <p className="muted">Configure how often screenshots are captured and how long data is retained.</p>
      </div>

      <div className="form-grid">
        <label className="field stack-xs">
          <span className="field-label">Capture interval (minutes)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={15}
            value={captureIntervalMinutes}
            onChange={(event) => setCaptureIntervalMinutes(Number(event.target.value))}
          />
        </label>

        <label className="field stack-xs">
          <span className="field-label">Watcher poll (seconds)</span>
          <input
            className="input"
            type="number"
            min={10}
            max={120}
            value={watcherPollSeconds}
            onChange={(event) => setWatcherPollSeconds(Number(event.target.value))}
          />
        </label>

        <label className="field stack-xs">
          <span className="field-label">Auto briefing time</span>
          <input
            className="input"
            type="time"
            value={autoBriefingTime}
            onChange={(event) => setAutoBriefingTime(event.target.value)}
          />
        </label>

        <label className="field stack-xs">
          <span className="field-label">Screenshot retention (days)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={365}
            value={screenshotRetentionDays}
            onChange={(event) => setScreenshotRetentionDays(Number(event.target.value))}
          />
        </label>

        <label className="field stack-xs">
          <span className="field-label">Activity retention (days)</span>
          <input
            className="input"
            type="number"
            min={1}
            max={365}
            value={activityRetentionDays}
            onChange={(event) => setActivityRetentionDays(Number(event.target.value))}
          />
        </label>
      </div>

      <label className="toggle-row">
        <input type="checkbox" checked={autoBriefingEnabled} onChange={(event) => setAutoBriefingEnabled(event.target.checked)} />
        <span>Enable auto briefing</span>
      </label>

      <button className="button button--primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  )
}
