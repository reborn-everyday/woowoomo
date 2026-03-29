import { useEffect, useMemo, useState } from 'react'

import type { Goal } from '../../shared/types'
import { MenuBarPopup } from './components/MenuBarPopup'
import type { OnboardingStep } from './components/OnboardingChecklist'
import { ReportWindow } from './components/ReportWindow'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import {
  DEFAULT_API_KEY_STATUS,
  DEFAULT_COLLECT_STATE,
  DEFAULT_PREFERENCES,
  DEFAULT_REPORT_RESPONSE,
  DEFAULT_TODAY_SUMMARY,
  clearApiKey,
  delegateToOpenClaw,
  generateReport,
  getApiKeyStatus,
  getGoal,
  getReport,
  getTodaySummary,
  isBridgeAvailable,
  openPermissionSettings,
  promptAccessibilityPermission,
  readCollectState,
  readPermissions,
  readPreferences,
  saveApiKey,
  saveGoal,
  startCollect,
  stopCollect,
  submitFeedback,
  type ApiKeyStatus,
  type AppPreferences,
  type AppPreferencesPatch,
  type CollectStateSnapshot,
  type PermissionTarget,
  type ReportHookResponse,
  type TodaySummary,
  writePreferences
} from './lib/electron-api'

type AppRoute = 'home' | 'settings' | 'report' | 'popup'
type NoticeTone = 'success' | 'warning'
type PermissionBusyAction = 'prompt-accessibility' | 'open-screen' | 'open-accessibility' | null

interface NoticeState {
  tone: NoticeTone
  text: string
}

function getRouteFromHash(): AppRoute {
  if (typeof window === 'undefined') {
    return 'home'
  }

  switch (window.location.hash) {
    case '#/settings':
      return 'settings'
    case '#/report':
      return 'report'
    case '#/popup':
      return 'popup'
    default:
      return 'home'
  }
}

function navigateTo(route: AppRoute): void {
  if (typeof window === 'undefined') {
    return
  }

  const nextHash =
    route === 'settings' ? '/settings' : route === 'report' ? '/report' : route === 'popup' ? '/popup' : '/'

  window.location.hash = nextHash
}

function mergeCollectState(snapshot: CollectStateSnapshot | null): CollectStateSnapshot {
  return snapshot === null
    ? DEFAULT_COLLECT_STATE
    : {
        ...snapshot,
        permissions: {
          ...DEFAULT_COLLECT_STATE.permissions,
          ...snapshot.permissions
        },
        preferences: {
          ...DEFAULT_PREFERENCES,
          ...snapshot.preferences
        }
      }
}

function mergeTodaySummary(summary: TodaySummary | null): TodaySummary {
  return summary === null
    ? DEFAULT_TODAY_SUMMARY
    : {
        ...DEFAULT_TODAY_SUMMARY,
        ...summary,
        collect: mergeCollectState(summary.collect)
      }
}

function mergeReportState(report: ReportHookResponse | null, fallbackDate: string): ReportHookResponse {
  return report === null
    ? {
        ...DEFAULT_REPORT_RESPONSE,
        date: fallbackDate
      }
    : {
        ...DEFAULT_REPORT_RESPONSE,
        ...report,
        date: report.date || fallbackDate
      }
}

function pickFirstError(...messages: Array<string | null>): string | null {
  for (const message of messages) {
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }

  return null
}

export default function App(): JSX.Element {
  const [route, setRoute] = useState<AppRoute>(getRouteFromHash())
  const [bridgeConnected, setBridgeConnected] = useState(isBridgeAvailable())
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES)
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>(DEFAULT_API_KEY_STATUS)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [collectState, setCollectState] = useState<CollectStateSnapshot>(DEFAULT_COLLECT_STATE)
  const [todaySummary, setTodaySummary] = useState<TodaySummary>(DEFAULT_TODAY_SUMMARY)
  const [reportState, setReportState] = useState<ReportHookResponse>(DEFAULT_REPORT_RESPONSE)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [preferencesBusy, setPreferencesBusy] = useState(false)
  const [apiKeyBusy, setApiKeyBusy] = useState(false)
  const [goalBusy, setGoalBusy] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [collectBusyAction, setCollectBusyAction] = useState<'start' | 'stop' | null>(null)
  const [permissionBusyAction, setPermissionBusyAction] = useState<PermissionBusyAction>(null)
  const [feedbackBusyItem, setFeedbackBusyItem] = useState<string | null>(null)
  const [delegateBusyItem, setDelegateBusyItem] = useState<string | null>(null)
  const [feedbackByItem, setFeedbackByItem] = useState<Record<string, number | null>>({})
  const [delegateMessages, setDelegateMessages] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [didAnnounceApiKeyReady, setDidAnnounceApiKeyReady] = useState(false)

  useEffect(() => {
    const handleHashChange = (): void => {
      setRoute(getRouteFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (route === 'settings' && !didAnnounceApiKeyReady) {
      console.info('API_KEY_READY')
      setDidAnnounceApiKeyReady(true)
    }
  }, [didAnnounceApiKeyReady, route])

  useEffect(() => {
    void refreshShellData(true)
  }, [])

  async function refreshShellData(isInitialLoad = false): Promise<void> {
    if (!isInitialLoad) {
      setRefreshBusy(true)
    }

    setBridgeConnected(isBridgeAvailable())

    const [preferencesResult, apiKeyResult, goalResult, collectResult, permissionsResult, summaryResult, reportResult] =
      await Promise.all([
        readPreferences(),
        getApiKeyStatus(),
        getGoal(),
        readCollectState(),
        readPermissions(),
        getTodaySummary(),
        getReport()
      ])

    const nextSummary = mergeTodaySummary(summaryResult.data)
    const nextCollectState = {
      ...mergeCollectState(collectResult.data),
      permissions: permissionsResult.data ?? mergeCollectState(collectResult.data).permissions
    }

    setPreferences(preferencesResult.data ?? DEFAULT_PREFERENCES)
    setApiKeyStatus(apiKeyResult.data ?? DEFAULT_API_KEY_STATUS)
    setGoal(goalResult.data ?? null)
    setCollectState(nextCollectState)
    setTodaySummary(nextSummary)
    setReportState(mergeReportState(reportResult.data, nextSummary.date))

    const firstError = pickFirstError(
      preferencesResult.error,
      apiKeyResult.error,
      goalResult.error,
      collectResult.error,
      permissionsResult.error,
      summaryResult.error,
      reportResult.error
    )

    if (firstError !== null) {
      setNotice({ tone: 'warning', text: firstError })
    } else if (!isInitialLoad) {
      setNotice({ tone: 'success', text: 'Renderer shell state refreshed.' })
    }

    if (!isInitialLoad) {
      setRefreshBusy(false)
    }
  }

  async function handleSavePreferences(patch: AppPreferencesPatch): Promise<boolean> {
    setPreferencesBusy(true)

    const result = await writePreferences(patch)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setPreferencesBusy(false)
      return false
    }

    setPreferences(result.data ?? DEFAULT_PREFERENCES)
    setNotice({ tone: 'success', text: 'Preferences saved successfully.' })
    setPreferencesBusy(false)
    return true
  }

  async function handleSaveApiKey(apiKey: string): Promise<boolean> {
    setApiKeyBusy(true)

    const result = await saveApiKey(apiKey)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setApiKeyBusy(false)
      return false
    }

    setApiKeyStatus(result.data ?? DEFAULT_API_KEY_STATUS)
    setNotice({ tone: 'success', text: 'API key saved successfully.' })
    setApiKeyBusy(false)
    return true
  }

  async function handleClearApiKey(): Promise<void> {
    setApiKeyBusy(true)

    const result = await clearApiKey()

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
    } else {
      setApiKeyStatus(result.data ?? DEFAULT_API_KEY_STATUS)
      setNotice({ tone: 'success', text: 'API key removed.' })
    }

    setApiKeyBusy(false)
  }

  async function handleSaveGoal(goalText: string): Promise<boolean> {
    setGoalBusy(true)

    const result = await saveGoal(goalText)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setGoalBusy(false)
      return false
    }

    setGoal(result.data)
    setTodaySummary((current) => ({
      ...current,
      goalText: result.data?.goal_text ?? current.goalText
    }))
    setNotice({ tone: 'success', text: 'Daily goal saved.' })
    setGoalBusy(false)
    return true
  }

  async function handleStartCollect(): Promise<void> {
    setCollectBusyAction('start')

    const result = await startCollect()

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
    } else {
      const nextCollectState = mergeCollectState(result.data)
      setCollectState(nextCollectState)
      setTodaySummary((current) => ({
        ...current,
        collect: nextCollectState
      }))
      setNotice({ tone: 'success', text: 'Data collection started.' })
    }

    setCollectBusyAction(null)
  }

  async function handleStopCollect(): Promise<void> {
    setCollectBusyAction('stop')

    const result = await stopCollect()

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
    } else {
      const nextCollectState = mergeCollectState(result.data)
      setCollectState(nextCollectState)
      setTodaySummary((current) => ({
        ...current,
        collect: nextCollectState
      }))
      setNotice({ tone: 'success', text: 'Data collection stopped.' })
    }

    setCollectBusyAction(null)
  }

  async function handlePromptAccessibility(): Promise<void> {
    setPermissionBusyAction('prompt-accessibility')

    const result = await promptAccessibilityPermission()

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
    } else {
      setCollectState((current) => ({
        ...current,
        permissions: result.data ?? current.permissions
      }))
      setNotice({ tone: 'success', text: 'Accessibility permission prompt displayed.' })
    }

    setPermissionBusyAction(null)
  }

  async function handleOpenSystemSettings(target: PermissionTarget): Promise<void> {
    setPermissionBusyAction(target === 'screen' ? 'open-screen' : 'open-accessibility')

    const result = await openPermissionSettings(target)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
    } else {
      setNotice({ tone: 'success', text: 'System Settings opened.' })
    }

    setPermissionBusyAction(null)
  }

  async function handleGenerateReport(openAfter = false): Promise<void> {
    setReportBusy(true)

    const result = await generateReport(todaySummary.date || undefined)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setReportBusy(false)
      return
    }

    const nextReportState = mergeReportState(result.data, todaySummary.date)

    setReportState(nextReportState)
    setTodaySummary((current) => ({
      ...current,
      reportSummary: nextReportState.report?.summary ?? current.reportSummary
    }))
    setNotice({ tone: 'success', text: 'Daily report generated.' })
    setReportBusy(false)

    if (openAfter) {
      navigateTo('report')
    }
  }

  async function handleSubmitFeedback(itemType: string, rating: 1 | -1): Promise<void> {
    setFeedbackBusyItem(itemType)

    const result = await submitFeedback({
      reportId: reportState.report?.id ?? null,
      itemType,
      rating
    })

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setFeedbackBusyItem(null)
      return
    }

    setFeedbackByItem((current) => ({
      ...current,
      [itemType]: result.data?.rating ?? null
    }))
    setNotice({
      tone: 'success',
      text: result.data?.status === 'cleared' ? 'Feedback cleared.' : 'Feedback submitted. Thank you!'
    })
    setFeedbackBusyItem(null)
  }

  async function handleDelegate(itemType: string, prompt: string): Promise<void> {
    setDelegateBusyItem(itemType)

    const result = await delegateToOpenClaw(prompt)

    if (result.error !== null) {
      setNotice({ tone: 'warning', text: result.error })
      setDelegateBusyItem(null)
      return
    }

    setDelegateMessages((current) => ({
      ...current,
      [itemType]: result.data?.message ?? 'Delegation request sent to OpenClaw.'
    }))
    setNotice({ tone: 'success', text: 'Task delegated to OpenClaw.' })
    setDelegateBusyItem(null)
  }

  const onboardingSteps = useMemo<OnboardingStep[]>(() => {
    return [
      {
        id: 'screen-permission',
        title: 'Screen Recording Permission',
        detail:
          collectState.permissions.screen === 'granted'
            ? 'Screen recording permission granted.'
            : `Current status: ${collectState.permissions.screen}`,
        status: collectState.permissions.screen === 'granted' ? 'ready' : 'pending'
      },
      {
        id: 'accessibility-permission',
        title: 'Accessibility Permission',
        detail: collectState.permissions.accessibility
          ? 'Accessibility permission granted.'
          : 'Required for tracking the active window.',
        status: collectState.permissions.accessibility ? 'ready' : 'pending'
      },
      {
        id: 'api-key',
        title: 'Claude API Key',
        detail: apiKeyStatus.isConfigured
          ? `Saved: ${apiKeyStatus.maskedValue}`
          : 'Add your API key in Settings to enable AI-powered goal structuring and live analysis.',
        status: apiKeyStatus.isConfigured ? 'ready' : 'pending'
      },
      {
        id: 'goal',
        title: 'Set Today\'s Goal',
        detail: goal !== null ? goal.goal_text : 'Optional, but setting a goal lets you track alignment between your intent and actual behavior.',
        status: goal !== null ? 'ready' : 'pending'
      },
      {
        id: 'collect',
        title: 'Start Live Collection',
        detail:
          collectState.state === 'running'
            ? 'Live collection is currently active.'
            : 'Once permissions and API key are ready, start collecting screen activity.',
        status: collectState.state === 'running' ? 'ready' : 'pending'
      }
    ]
  }, [apiKeyStatus.isConfigured, apiKeyStatus.maskedValue, collectState.permissions.accessibility, collectState.permissions.screen, collectState.state, goal])

  const isPopupSurface = route === 'popup'

  return (
    <main className={`app-shell ${isPopupSurface ? 'app-shell--popup' : ''}`}>
      <div className={`shell ${isPopupSurface ? 'shell--popup' : ''}`}>
        {isPopupSurface ? null : (
          <header className="shell-header">
            <div className="brand-block">
              <p className="eyebrow">WooWoomo</p>
              <h1 className="brand-title">Your AI-Powered Productivity Companion</h1>
              <p className="brand-copy">Capture your screen activity, track your daily goals, and get AI-generated insights to help you work smarter.</p>
            </div>

            <nav className="shell-nav" aria-label="Primary navigation">
              <button className={`nav-tab ${route === 'home' ? 'nav-tab--active' : ''}`} type="button" onClick={() => navigateTo('home')}>
                Home
              </button>
              <button className={`nav-tab ${route === 'report' ? 'nav-tab--active' : ''}`} type="button" onClick={() => navigateTo('report')}>
                Report
              </button>
              <button className="nav-tab" type="button" onClick={() => navigateTo('popup')}>
                Popup
              </button>
              <button className={`nav-tab ${route === 'settings' ? 'nav-tab--active' : ''}`} type="button" onClick={() => navigateTo('settings')}>
                Settings
              </button>
            </nav>
          </header>
        )}

        {notice !== null ? <div className={`notice notice--${notice.tone}`}>{notice.text}</div> : null}

        <section className="content">
          {route === 'settings' ? (
            <SettingsPage
              preferences={preferences}
              apiKeyStatus={apiKeyStatus}
              permissions={collectState.permissions}
              preferencesBusy={preferencesBusy}
              apiKeyBusy={apiKeyBusy}
              permissionBusyAction={permissionBusyAction}
              onSavePreferences={handleSavePreferences}
              onSaveApiKey={handleSaveApiKey}
              onClearApiKey={handleClearApiKey}
              onPromptAccessibility={handlePromptAccessibility}
              onOpenSystemSettings={handleOpenSystemSettings}
            />
          ) : route === 'report' ? (
            <ReportWindow
              todaySummary={todaySummary}
              reportState={reportState}
              busy={reportBusy}
              feedbackByItem={feedbackByItem}
              feedbackBusyItem={feedbackBusyItem}
              delegateBusyItem={delegateBusyItem}
              delegateMessages={delegateMessages}
              onGenerate={() => handleGenerateReport()}
              onSubmitFeedback={handleSubmitFeedback}
              onDelegate={handleDelegate}
            />
          ) : route === 'popup' ? (
            <MenuBarPopup
              apiKeyStatus={apiKeyStatus}
              collectState={collectState}
              todaySummary={todaySummary}
              reportState={reportState}
              collectBusyAction={collectBusyAction}
              reportBusy={reportBusy}
              refreshBusy={refreshBusy}
              onStartCollect={handleStartCollect}
              onStopCollect={handleStopCollect}
              onGenerateReport={() => handleGenerateReport(true)}
              onOpenReport={() => navigateTo('report')}
              onRefresh={() => refreshShellData()}
            />
          ) : (
            <HomePage
              bridgeConnected={bridgeConnected}
              onboardingSteps={onboardingSteps}
              apiKeyStatus={apiKeyStatus}
              collectState={collectState}
              goal={goal}
              todaySummary={todaySummary}
              goalBusy={goalBusy}
              collectBusyAction={collectBusyAction}
              refreshBusy={refreshBusy}
              onOpenReport={() => navigateTo('report')}
              onOpenPopup={() => navigateTo('popup')}
              onSaveGoal={handleSaveGoal}
              onStartCollect={handleStartCollect}
              onStopCollect={handleStopCollect}
              onRefresh={() => refreshShellData()}
              onOpenSettings={() => navigateTo('settings')}
            />
          )}
        </section>
      </div>
    </main>
  )
}
