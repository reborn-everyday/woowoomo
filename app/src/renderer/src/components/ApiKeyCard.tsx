import { useState, type FormEvent } from 'react'

import type { ApiKeyStatus } from '../lib/electron-api'

interface ApiKeyCardProps {
  apiKeyStatus: ApiKeyStatus
  busy: boolean
  onSave: (apiKey: string) => Promise<boolean>
  onClear: () => Promise<void>
}

export function ApiKeyCard({ apiKeyStatus, busy, onSave, onClear }: ApiKeyCardProps): JSX.Element {
  const [apiKey, setApiKey] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const trimmed = apiKey.trim()

    if (trimmed.length === 0) {
      return
    }

    const saved = await onSave(trimmed)

    if (saved) {
      setApiKey('')
    }
  }

  return (
    <form className="card stack-lg" onSubmit={(event) => void handleSubmit(event)}>
      <div className="stack-sm">
        <p className="eyebrow">API key</p>
        <h2 className="section-title">Secure Key Management</h2>
        <p className="muted">Your API key is encrypted and stored securely using the system keychain.</p>
      </div>

      <label className="field stack-xs">
        <span className="field-label">Claude API key</span>
        <input
          className="input"
          type="password"
          placeholder={apiKeyStatus.maskedValue ?? 'sk-ant-...'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <span className="muted">
          {apiKeyStatus.storageAvailable
            ? apiKeyStatus.isConfigured
              ? `Currently saved: ${apiKeyStatus.maskedValue}`
              : 'No API key saved yet.'
            : 'Secure storage is not available on this system.'}
        </span>
      </label>

      <div className="cluster">
        <button className="button button--primary" type="submit" disabled={busy || apiKey.trim().length === 0 || !apiKeyStatus.storageAvailable}>
          {busy ? 'Saving…' : 'Save API key'}
        </button>
        <button className="button button--secondary" type="button" disabled={busy || !apiKeyStatus.isConfigured} onClick={() => void onClear()}>
          Clear key
        </button>
      </div>
    </form>
  )
}
