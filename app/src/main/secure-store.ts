import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { app, safeStorage } from 'electron'

const SECURE_STORE_FILE_NAME = 'secure-store.json'
const API_KEY_SECRET_NAME = 'anthropic-api-key'

export interface ApiKeyStatus {
  storageAvailable: boolean
  isConfigured: boolean
  maskedValue: string | null
}

interface SecureStorePayload {
  version: 1
  secrets: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

function getDefaultSecureStorePath(): string {
  return join(app.getPath('userData'), SECURE_STORE_FILE_NAME)
}

function normalizePayload(value: unknown): SecureStorePayload {
  if (!isRecord(value) || !isRecord(value.secrets)) {
    return {
      version: 1,
      secrets: {},
    }
  }

  const secrets = Object.fromEntries(
    Object.entries(value.secrets).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )

  return {
    version: 1,
    secrets,
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 4) {
    return '****'
  }

  return `****${secret.slice(-4)}`
}

export class SecureStore {
  private readonly filePath: string

  public constructor(filePath?: string) {
    this.filePath = filePath ?? getDefaultSecureStorePath()
    ensureParentDirectory(this.filePath)
  }

  public getApiKeyStatus(): ApiKeyStatus {
    const storageAvailable = safeStorage.isEncryptionAvailable()
    const apiKey = this.getApiKey()

    return {
      storageAvailable,
      isConfigured: apiKey !== null,
      maskedValue: apiKey === null ? null : maskSecret(apiKey),
    }
  }

  public getApiKey(): string | null {
    // 1. Try secure storage first (user-configured via UI takes precedence)
    try {
      const fromStorage = this.getApiKeyFromStorage()
      if (fromStorage !== null) {
        return fromStorage
      }
    } catch (error) {
      console.error('Failed to read API key from secure storage.', error)
    }

    // 2. Fallback to environment variable (for competition/dev modes)
    const fromEnv = process.env.ANTHROPIC_API_KEY?.trim()
    return fromEnv || null
  }

  private getApiKeyFromStorage(): string | null {
    this.assertEncryptionAvailable()

    const payload = this.readPayload()
    const encryptedValue = payload.secrets[API_KEY_SECRET_NAME]

    if (encryptedValue === undefined) {
      return null
    }

    try {
      return safeStorage.decryptString(Buffer.from(encryptedValue, 'base64')).trim() || null
    } catch (error) {
      throw new Error('Stored Claude API key could not be decrypted.', { cause: error })
    }
  }

  public setApiKey(apiKey: string): ApiKeyStatus {
    const normalizedApiKey = apiKey.trim()

    if (normalizedApiKey.length === 0) {
      throw new Error('API key is required.')
    }

    this.assertEncryptionAvailable()

    const payload = this.readPayload()
    payload.secrets[API_KEY_SECRET_NAME] = safeStorage.encryptString(normalizedApiKey).toString('base64')
    this.writePayload(payload)

    return this.getApiKeyStatus()
  }

  public clearApiKey(): ApiKeyStatus {
    const payload = this.readPayload()

    delete payload.secrets[API_KEY_SECRET_NAME]
    this.writePayload(payload)

    return this.getApiKeyStatus()
  }

  private assertEncryptionAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption is not available on this system.')
    }
  }

  private readPayload(): SecureStorePayload {
    if (!existsSync(this.filePath)) {
      return {
        version: 1,
        secrets: {},
      }
    }

    try {
      const raw = readFileSync(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown

      return normalizePayload(parsed)
    } catch (parseError) {
      console.error('SecureStore payload could not be parsed. Falling back to empty secrets.', parseError)
      return {
        version: 1,
        secrets: {},
      }
    }
  }

  private writePayload(payload: SecureStorePayload): void {
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8')
  }
}
